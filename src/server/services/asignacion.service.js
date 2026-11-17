import "server-only";
import { query, transaccion } from "../db";
import { ErrorApp } from "../http";
import { exigirVisible } from "../permisos";
import { cobradoresDisponibles } from "./clientes.service";
import { notificar } from "./notificaciones.service";
import * as auditoria from "../repos/auditoria.repo";

function soloJefes(yo) {
  if (!["dueno", "supervisor"].includes(yo.rol)) throw new ErrorApp(403, "Solo el dueño o un supervisor reasigna clientes", "prohibido");
}

/** Tablero: cada cobrador visible con sus rutas y sus clientes activos. */
export async function tablero(yo) {
  soloJefes(yo);
  const cobradores = await cobradoresDisponibles(yo);
  const ids = cobradores.map((c) => c.id);
  if (!ids.length) return { cobradores: [], rutas: [], clientes: [] };
  const [{ rows: rutas }, { rows: clientes }] = await Promise.all([
    query(`SELECT id, nombre, cobrador_id, orden FROM rutas WHERE cobrador_id = ANY($1::uuid[]) AND activa ORDER BY orden, nombre`, [ids]),
    query(
      `SELECT c.id, c.nombre, c.barrio, c.cobrador_id, c.ruta_id, c.orden_ruta,
              COALESCE(sum(p.saldo) FILTER (WHERE p.estado = 'activo'), 0)::bigint AS saldo,
              COALESCE(max(p.dias_atraso) FILTER (WHERE p.estado = 'activo'), 0)::int AS dias_atraso
         FROM clientes c LEFT JOIN prestamos p ON p.cliente_id = c.id
        WHERE c.cobrador_id = ANY($1::uuid[]) AND c.estado = 'activo'
        GROUP BY c.id
        ORDER BY c.orden_ruta, c.nombre`,
      [ids]
    ),
  ]);
  return { cobradores, rutas, clientes };
}

/** Cobrador destino válido: activo, cobrador y visible para `yo`. */
async function validarDestino(db, yo, cobradorId) {
  const { rows } = await db.query(`SELECT id, nombre, rol, estado, organizacion_id, eliminado_en FROM usuarios WHERE id = $1`, [cobradorId]);
  const u = rows[0];
  if (!u || u.organizacion_id !== yo.org || u.rol !== "cobrador" || u.estado !== "activo" || u.eliminado_en) {
    throw new ErrorApp(400, "Solo se puede pasar a un cobrador activo", "cobrador_invalido");
  }
  await exigirVisible(yo, u.id, u.organizacion_id);
  return u;
}

/**
 * Pasa clientes sueltos a otro cobrador (y opcionalmente a una de sus rutas).
 * Se llevan sus préstamos activos; los cobros ya hechos siguen a nombre de quien los cobró.
 */
export async function moverClientes(yo, { clientes: clienteIds, cobrador_id, ruta_id }, ip) {
  soloJefes(yo);
  const r = await transaccion(async (db) => {
    const destino = await validarDestino(db, yo, cobrador_id);
    if (ruta_id) {
      const { rows } = await db.query(`SELECT cobrador_id, activa FROM rutas WHERE id = $1`, [ruta_id]);
      if (!rows[0]?.activa || rows[0].cobrador_id !== destino.id) throw new ErrorApp(400, "Esa ruta no es de ese cobrador", "ruta_invalida");
    }
    const { rows: cs } = await db.query(`SELECT id, nombre, cobrador_id, organizacion_id FROM clientes WHERE id = ANY($1::uuid[]) FOR UPDATE`, [clienteIds]);
    if (cs.length !== clienteIds.length) throw new ErrorApp(404, "Algún cliente no existe", "no_encontrado");
    for (const c of cs) await exigirVisible(yo, c.cobrador_id, c.organizacion_id);

    // Al final de la ruta destino (o de "sin ruta"), en el orden en que llegaron
    const { rows: mx } = await db.query(
      `SELECT COALESCE(max(orden_ruta), 0)::int AS m FROM clientes WHERE cobrador_id = $1 AND ruta_id IS NOT DISTINCT FROM $2`,
      [destino.id, ruta_id ?? null]
    );
    await db.query(
      `UPDATE clientes c SET cobrador_id = $2, ruta_id = $3, orden_ruta = $4 + x.n
         FROM unnest($1::uuid[]) WITH ORDINALITY AS x(id, n) WHERE c.id = x.id`,
      [clienteIds, destino.id, ruta_id ?? null, mx[0].m]
    );
    await db.query(`UPDATE prestamos SET cobrador_id = $2 WHERE cliente_id = ANY($1::uuid[]) AND estado = 'activo'`, [clienteIds, destino.id]);
    await auditoria.registrar(db, { organizacionId: yo.org, usuarioId: yo.id, accion: "cliente.transferir", entidad: "usuario", entidadId: destino.id, datos: { clientes: clienteIds, ruta_id: ruta_id ?? null }, ip });
    return { destino, anteriores: [...new Set(cs.map((c) => c.cobrador_id))].filter((id) => id !== destino.id), nombres: cs.map((c) => c.nombre) };
  });
  await avisar(yo, r, r.nombres.length === 1 ? `el cliente ${r.nombres[0]}` : `${r.nombres.length} clientes`);
  return { movidos: r.nombres.length, cobrador: r.destino.nombre };
}

/** Pasa una ruta completa (con todos sus clientes y sus préstamos activos) a otro cobrador. */
export async function moverRuta(yo, { ruta_id, cobrador_id }, ip) {
  soloJefes(yo);
  const r = await transaccion(async (db) => {
    const destino = await validarDestino(db, yo, cobrador_id);
    const { rows } = await db.query(
      `SELECT r.id, r.nombre, r.cobrador_id, r.activa, u.organizacion_id, u.nombre AS cobrador_nombre
         FROM rutas r JOIN usuarios u ON u.id = r.cobrador_id WHERE r.id = $1 FOR UPDATE OF r`,
      [ruta_id]
    );
    const ruta = rows[0];
    if (!ruta?.activa) throw new ErrorApp(404, "Ruta no encontrada", "no_encontrado");
    await exigirVisible(yo, ruta.cobrador_id, ruta.organizacion_id);
    if (ruta.cobrador_id === destino.id) return null;

    // Si el destino ya tiene una ruta con ese nombre, se distingue con el nombre del anterior
    const { rows: rep } = await db.query(`SELECT 1 FROM rutas WHERE cobrador_id = $1 AND lower(nombre) = lower($2) AND activa`, [destino.id, ruta.nombre]);
    const nombre = rep[0] ? `${ruta.nombre} (de ${ruta.cobrador_nombre})`.slice(0, 80) : ruta.nombre;
    const { rows: ord } = await db.query(`SELECT COALESCE(max(orden), 0) + 1 AS o FROM rutas WHERE cobrador_id = $1 AND activa`, [destino.id]);
    await db.query(`UPDATE rutas SET cobrador_id = $2, nombre = $3, orden = $4 WHERE id = $1`, [ruta.id, destino.id, nombre, ord[0].o]);
    const { rows: cs } = await db.query(`UPDATE clientes SET cobrador_id = $2 WHERE ruta_id = $1 RETURNING id`, [ruta.id, destino.id]);
    await db.query(`UPDATE prestamos SET cobrador_id = $2 WHERE cliente_id = ANY($1::uuid[]) AND estado = 'activo'`, [cs.map((c) => c.id), destino.id]);
    await auditoria.registrar(db, { organizacionId: yo.org, usuarioId: yo.id, accion: "ruta.transferir", entidad: "ruta", entidadId: ruta.id, datos: { de: ruta.cobrador_id, a: destino.id, clientes: cs.length }, ip });
    return { destino, anteriores: [ruta.cobrador_id], nombres: cs, ruta: nombre };
  });
  if (!r) return { movidos: 0 };
  await avisar(yo, r, `la ruta ${r.ruta} (${r.nombres.length} clientes)`);
  return { movidos: r.nombres.length, cobrador: r.destino.nombre, ruta: r.ruta };
}

async function avisar(yo, r, que) {
  await notificar({
    organizacionId: yo.org,
    usuarioIds: [r.destino.id],
    tipo: "clientes.asignados",
    titulo: `Te asignaron ${que}`,
    cuerpo: `${yo.nombre} te pasó ${que}. Ya aparecen en tu ruta.`,
    url: "/ruta",
  });
  await notificar({
    organizacionId: yo.org,
    usuarioIds: r.anteriores,
    tipo: "clientes.retirados",
    titulo: `Cambio de clientes: ${que} → ${r.destino.nombre}`,
    cuerpo: `Cambio hecho por ${yo.nombre}.`,
    url: "/ruta",
  });
}
