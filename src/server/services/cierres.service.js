import "server-only";
import { query, transaccion } from "../db";
import { ErrorApp } from "../http";
import { exigirVisible, filtroVisible } from "../permisos";
import { destinatariosArriba } from "../jerarquia";
import { hoyBogota } from "@/lib/fechas";
import { dinero, fecha as fmtFecha } from "@/lib/formato";
import { obtenerJornada, registrarMovimiento } from "./caja.service";
import { notificar } from "./notificaciones.service";
import * as auditoria from "../repos/auditoria.repo";

const COLS = `c.id, c.organizacion_id, c.jornada_id, c.usuario_id, c.jefe_id, c.fecha, c.efectivo_esperado, c.efectivo_contado,
  c.diferencia, c.digital, c.resumen, c.observacion, c.estado, c.revisado_por, c.revisado_en, c.comentario_revision,
  c.resuelto_por, c.resuelto_en, c.comentario_resolucion, c.creado_en,
  u.nombre AS usuario_nombre, j.nombre AS jefe_nombre, rv.nombre AS revisado_por_nombre, rs.nombre AS resuelto_por_nombre`;
const JOINS = `JOIN usuarios u ON u.id = c.usuario_id
  LEFT JOIN usuarios j ON j.id = c.jefe_id
  LEFT JOIN usuarios rv ON rv.id = c.revisado_por
  LEFT JOIN usuarios rs ON rs.id = c.resuelto_por`;

/** Totales de una jornada (por tipo y por método). */
async function totalesJornada(db, jornadaId) {
  const { rows } = await db.query(`SELECT tipo, metodo, sum(monto)::bigint AS total FROM movimientos_caja WHERE jornada_id = $1 GROUP BY tipo, metodo`, [jornadaId]);
  const porTipo = {};
  const porMetodo = { efectivo: 0, nequi: 0, daviplata: 0, transferencia: 0 };
  for (const r of rows) {
    porTipo[r.tipo] = (porTipo[r.tipo] ?? 0) + r.total;
    porMetodo[r.metodo] += r.total;
  }
  return { porTipo, porMetodo, movimientos: rows.length };
}

/** Estado del cierre de un usuario en una fecha: si ya cerró, su cierre; si no, lo esperado. */
export async function estado(yo, fecha = hoyBogota()) {
  const { rows: js } = await query(`SELECT id, estado FROM jornadas WHERE usuario_id = $1 AND fecha = $2`, [yo.id, fecha]);
  const { rows: cs } = await query(`SELECT ${COLS} FROM cierres c ${JOINS} WHERE c.usuario_id = $1 AND c.fecha = $2`, [yo.id, fecha]);
  const t = js[0] ? await totalesJornada({ query }, js[0].id) : { porTipo: {}, porMetodo: { efectivo: 0, nequi: 0, daviplata: 0, transferencia: 0 }, movimientos: 0 };
  // Días anteriores con movimientos que quedaron sin cerrar
  const { rows: abiertos } = await query(
    `SELECT j.fecha FROM jornadas j
      WHERE j.usuario_id = $1 AND j.estado = 'abierta' AND j.fecha < $2
        AND EXISTS (SELECT 1 FROM movimientos_caja m WHERE m.jornada_id = j.id)
      ORDER BY j.fecha`,
    [yo.id, fecha]
  );
  return {
    fecha,
    cerrada: js[0]?.estado === "cerrada",
    cierre: cs[0] ?? null,
    efectivoEsperado: t.porMetodo.efectivo,
    digital: t.porMetodo.nequi + t.porMetodo.daviplata + t.porMetodo.transferencia,
    porTipo: t.porTipo,
    movimientos: t.movimientos,
    diasSinCerrar: abiertos.map((r) => r.fecha),
  };
}

/**
 * El cobrador (o el supervisor) cierra el día: cuenta el efectivo, se lo entrega todo a su jefe
 * y el cierre queda pendiente de revisión. La caja de ese día ya no acepta movimientos.
 * Cobrador → supervisor o dueño; supervisor → dueño.
 */
export async function cerrarDia(yo, { efectivo_contado, observacion, fecha }, ip) {
  if (!["cobrador", "supervisor"].includes(yo.rol)) throw new ErrorApp(403, "El dueño no cierra el día: recibe los cierres de su equipo", "prohibido");
  const hoy = hoyBogota();
  const dia = fecha ?? hoy;
  if (dia > hoy) throw new ErrorApp(400, "No puedes cerrar un día futuro", "fecha_invalida");

  const resultado = await transaccion(async (db) => {
    const j0 = await obtenerJornada(db, { organizacionId: yo.org, usuarioId: yo.id, fecha: dia });
    const { rows } = await db.query(`SELECT id, estado FROM jornadas WHERE id = $1 FOR UPDATE`, [j0.id]);
    if (rows[0].estado === "cerrada") throw new ErrorApp(409, "Este día ya está cerrado", "ya_cerrado");

    const t = await totalesJornada(db, j0.id);
    const esperado = t.porMetodo.efectivo;
    const digital = t.porMetodo.nequi + t.porMetodo.daviplata + t.porMetodo.transferencia;
    const { rows: us } = await db.query(`SELECT jefe_id FROM usuarios WHERE id = $1`, [yo.id]);
    const jefeId = us[0]?.jefe_id ?? null;

    const { rows: cs } = await db.query(
      `INSERT INTO cierres (organizacion_id, jornada_id, usuario_id, jefe_id, fecha, efectivo_esperado, efectivo_contado, digital, resumen, observacion)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
       RETURNING id, diferencia`,
      [yo.org, j0.id, yo.id, jefeId, dia, esperado, efectivo_contado, digital, JSON.stringify({ porTipo: t.porTipo, porMetodo: t.porMetodo }), observacion]
    );
    const cierre = cs[0];

    // Todo el efectivo contado pasa al jefe
    if (efectivo_contado > 0) {
      await registrarMovimiento(db, {
        organizacionId: yo.org, usuarioId: yo.id, jornadaId: j0.id, tipo: "entrega", metodo: "efectivo", monto: -efectivo_contado,
        descripcion: "Entrega al cerrar el día", contraparteId: jefeId, refTipo: "cierre", refId: cierre.id, creadoPor: yo.id,
      });
      if (jefeId) {
        await registrarMovimiento(db, {
          organizacionId: yo.org, usuarioId: jefeId, tipo: "recibido", metodo: "efectivo", monto: efectivo_contado,
          descripcion: `Entrega de ${yo.nombre} (${fmtFecha(dia)})`, contraparteId: yo.id, refTipo: "cierre", refId: cierre.id, creadoPor: yo.id,
          alSiguienteDia: true, // si el jefe ya cerró su día, la entrega entra en su caja de mañana
        });
      }
    }
    await db.query(`UPDATE jornadas SET estado = 'cerrada', cerrada_en = now() WHERE id = $1`, [j0.id]);
    await auditoria.registrar(db, { organizacionId: yo.org, usuarioId: yo.id, accion: "cierre.crear", entidad: "cierre", entidadId: cierre.id, datos: { esperado, contado: efectivo_contado }, ip });
    return { id: cierre.id, esperado, diferencia: cierre.diferencia };
  });

  const d = resultado.diferencia;
  await notificar({
    organizacionId: yo.org,
    usuarioIds: await destinatariosArriba(yo.id),
    tipo: "cierre.nuevo",
    titulo: `${yo.nombre} cerró el día`,
    cuerpo: `Entregó ${dinero(efectivo_contado)} de ${dinero(resultado.esperado)} esperados${d === 0 ? ". Cuadra exacto." : d < 0 ? `. Faltan ${dinero(-d)}.` : `. Sobran ${dinero(d)}.`}`,
    url: "/cuadres",
    datos: { cierre: resultado.id },
  });
  return resultado;
}

/** Cierres que `yo` puede ver: los propios (cobrador) o los de su equipo (jefes). */
export async function listar(yo, { estado: est, limite = 100 } = {}) {
  const params = [];
  const where = [await filtroVisible(yo, "c.usuario_id", "c.organizacion_id", params)];
  if (est === "abiertos") where.push(`c.estado IN ('pendiente', 'con_fallo')`);
  else if (est) {
    params.push(est);
    where.push(`c.estado = $${params.length}`);
  }
  params.push(limite);
  const { rows } = await query(
    `SELECT ${COLS} FROM cierres c ${JOINS}
      WHERE ${where.join(" AND ")}
      ORDER BY array_position(ARRAY['pendiente','con_fallo','resuelto','aprobado'], c.estado), c.fecha DESC, c.creado_en DESC
      LIMIT $${params.length}`,
    params
  );
  return rows;
}

async function cargarParaRevisar(db, yo, id) {
  const { rows } = await db.query(`SELECT * FROM cierres WHERE id = $1 FOR UPDATE`, [id]);
  const c = rows[0];
  if (!c) throw new ErrorApp(404, "Cierre no encontrado", "no_encontrado");
  await exigirVisible(yo, c.usuario_id, c.organizacion_id);
  if (c.usuario_id === yo.id) throw new ErrorApp(403, "No puedes revisar tu propio cierre", "prohibido");
  return c;
}

/** El jefe aprueba o marca el cierre con fallo (con comentario). */
export async function revisar(yo, id, { decision, comentario }, ip) {
  if (yo.rol === "cobrador") throw new ErrorApp(403, "Solo un jefe revisa cierres", "prohibido");
  const c = await transaccion(async (db) => {
    const c = await cargarParaRevisar(db, yo, id);
    if (c.estado !== "pendiente") throw new ErrorApp(409, "Este cierre ya fue revisado", "ya_revisado");
    const nuevo = decision === "aprobar" ? "aprobado" : "con_fallo";
    await db.query(
      `UPDATE cierres SET estado = $2, revisado_por = $3, revisado_en = now(), comentario_revision = $4 WHERE id = $1`,
      [id, nuevo, yo.id, comentario ?? null]
    );
    await auditoria.registrar(db, { organizacionId: c.organizacion_id, usuarioId: yo.id, accion: `cierre.${nuevo}`, entidad: "cierre", entidadId: id, datos: { comentario }, ip });
    return { ...c, estado: nuevo };
  });
  await notificar({
    organizacionId: c.organizacion_id,
    usuarioIds: [c.usuario_id],
    tipo: `cierre.${c.estado}`,
    titulo: c.estado === "aprobado" ? `Tu cierre del ${fmtFecha(c.fecha)} fue aprobado` : `Tu cierre del ${fmtFecha(c.fecha)} tiene un fallo`,
    cuerpo: comentario || (c.estado === "aprobado" ? "Todo en orden." : "Habla con tu jefe para resolverlo."),
    url: "/caja/cierres",
    datos: { cierre: id },
  });
  return { id, estado: c.estado };
}

/** El jefe da por resuelto un cierre con fallo, explicando cómo se arregló. */
export async function resolver(yo, id, { comentario }, ip) {
  if (yo.rol === "cobrador") throw new ErrorApp(403, "Solo un jefe resuelve cierres", "prohibido");
  const c = await transaccion(async (db) => {
    const c = await cargarParaRevisar(db, yo, id);
    if (c.estado !== "con_fallo") throw new ErrorApp(409, "Solo se resuelven cierres con fallo", "estado_invalido");
    await db.query(`UPDATE cierres SET estado = 'resuelto', resuelto_por = $2, resuelto_en = now(), comentario_resolucion = $3 WHERE id = $1`, [id, yo.id, comentario]);
    await auditoria.registrar(db, { organizacionId: c.organizacion_id, usuarioId: yo.id, accion: "cierre.resuelto", entidad: "cierre", entidadId: id, datos: { comentario }, ip });
    return c;
  });
  await notificar({
    organizacionId: c.organizacion_id,
    usuarioIds: [c.usuario_id],
    tipo: "cierre.resuelto",
    titulo: `El fallo del ${fmtFecha(c.fecha)} quedó resuelto`,
    cuerpo: comentario,
    url: "/caja/cierres",
    datos: { cierre: id },
  });
  return { id, estado: "resuelto" };
}
