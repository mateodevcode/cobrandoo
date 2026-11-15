import "server-only";
import { query, transaccion } from "../db";
import { ErrorApp } from "../http";
import { exigirVisible, filtroVisible } from "../permisos";
import { hoyBogota, sumarDias } from "@/lib/fechas";
import * as auditoria from "../repos/auditoria.repo";

/** Jornada (caja del día) de un usuario; la crea si no existe. */
export async function obtenerJornada(db, { organizacionId, usuarioId, fecha = hoyBogota() }) {
  const { rows } = await db.query(
    `INSERT INTO jornadas (organizacion_id, usuario_id, fecha) VALUES ($1, $2, $3)
     ON CONFLICT (usuario_id, fecha) DO UPDATE SET usuario_id = EXCLUDED.usuario_id
     RETURNING id, estado`,
    [organizacionId, usuarioId, fecha]
  );
  return rows[0];
}

/** Días hacia atrás que se aceptan para operaciones hechas sin señal. */
export const MAX_DIAS_OFFLINE = 7;

/**
 * Fecha de negocio de una operación: la del teléfono cuando se hizo (modo sin internet),
 * nunca futura y como máximo MAX_DIAS_OFFLINE atrás.
 */
export function fechaDeOperacion(creadoEnDispositivo) {
  const hoy = hoyBogota();
  if (!creadoEnDispositivo) return hoy;
  const f = hoyBogota(new Date(creadoEnDispositivo));
  if (f >= hoy) return hoy;
  if (f < sumarDias(hoy, -MAX_DIAS_OFFLINE)) {
    throw new ErrorApp(409, `Esta operación se hizo hace más de ${MAX_DIAS_OFFLINE} días sin conexión. Regístrala con tu jefe.`, "operacion_antigua");
  }
  return f;
}

/** Inserta un movimiento en la caja de `usuarioId` (del día `m.fecha`, o hoy). Devuelve el id. */
export async function registrarMovimiento(db, m) {
  const jornada = m.jornadaId
    ? { id: m.jornadaId }
    : await obtenerJornada(db, { organizacionId: m.organizacionId, usuarioId: m.usuarioId, fecha: m.fecha });
  const { rows } = await db.query(
    `INSERT INTO movimientos_caja (id, organizacion_id, usuario_id, jornada_id, tipo, metodo, monto, categoria,
                                   descripcion, ref_tipo, ref_id, contraparte_id, creado_por, creado_en_dispositivo)
     VALUES (COALESCE($1, gen_random_uuid()), $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
     ON CONFLICT (id) DO NOTHING
     RETURNING id`,
    [
      m.id ?? null, m.organizacionId, m.usuarioId, jornada.id, m.tipo, m.metodo, m.monto, m.categoria ?? null,
      m.descripcion ?? null, m.refTipo ?? null, m.refId ?? null, m.contraparteId ?? null, m.creadoPor ?? null,
      m.creadoEnDispositivo ?? null,
    ]
  );
  return { id: rows[0]?.id ?? m.id, jornadaId: jornada.id, duplicado: !rows[0] };
}

export async function registrarGasto(yo, d, ip) {
  if (d.monto <= 0) throw new ErrorApp(400, "Monto inválido", "monto");
  const fecha = fechaDeOperacion(d.creado_en_dispositivo);
  return transaccion(async (db) => {
    const r = await registrarMovimiento(db, {
      id: d.id, organizacionId: yo.org, usuarioId: yo.id, tipo: "gasto", metodo: d.metodo, fecha,
      monto: -d.monto, categoria: d.categoria, descripcion: d.descripcion, creadoPor: yo.id,
      creadoEnDispositivo: d.creado_en_dispositivo,
    });
    if (!r.duplicado) {
      await auditoria.registrar(db, { organizacionId: yo.org, usuarioId: yo.id, accion: "caja.gasto", entidad: "movimiento", entidadId: r.id, datos: { monto: d.monto, categoria: d.categoria }, ip });
    }
    return r;
  });
}

/** El jefe (supervisor o dueño) entrega base a un cobrador de su equipo. */
export async function entregarBase(yo, d, ip) {
  if (yo.rol === "cobrador") throw new ErrorApp(403, "Solo un jefe puede entregar base", "prohibido");
  if (d.cobrador_id === yo.id) throw new ErrorApp(400, "No puedes entregarte base a ti mismo", "base_invalida");
  const { rows } = await query(`SELECT id, organizacion_id, rol, nombre FROM usuarios WHERE id = $1`, [d.cobrador_id]);
  const cob = rows[0];
  if (!cob) throw new ErrorApp(404, "Cobrador no encontrado", "no_encontrado");
  await exigirVisible(yo, cob.id, cob.organizacion_id);
  const fecha = fechaDeOperacion(d.creado_en_dispositivo);

  return transaccion(async (db) => {
    const r = await registrarMovimiento(db, {
      id: d.id, organizacionId: yo.org, usuarioId: cob.id, tipo: "base", metodo: d.metodo, monto: d.monto, fecha,
      creadoEnDispositivo: d.creado_en_dispositivo,
      descripcion: d.descripcion ?? `Base entregada por ${yo.nombre}`, contraparteId: yo.id, creadoPor: yo.id,
    });
    if (!r.duplicado) {
      await auditoria.registrar(db, { organizacionId: yo.org, usuarioId: yo.id, accion: "caja.base", entidad: "movimiento", entidadId: r.id, datos: { cobrador: cob.id, monto: d.monto }, ip });
    }
    return r;
  });
}

/** Personas a cargo de `yo` con el resumen de su caja de hoy. */
export async function equipoHoy(yo, fecha = hoyBogota()) {
  const params = [];
  const filtro = await filtroVisible(yo, "u.id", "u.organizacion_id", params);
  params.push(yo.id, fecha);
  const { rows } = await query(
    `SELECT u.id, u.nombre, u.rol, j.nombre AS jefe_nombre,
            COALESCE(sum(m.monto) FILTER (WHERE m.metodo = 'efectivo'), 0)::bigint AS efectivo,
            COALESCE(sum(m.monto) FILTER (WHERE m.tipo = 'base'), 0)::bigint AS base,
            COALESCE(sum(m.monto) FILTER (WHERE m.tipo IN ('cobro', 'anulacion') AND m.ref_tipo = 'pago'), 0)::bigint AS cobrado,
            COALESCE(-sum(m.monto) FILTER (WHERE m.tipo = 'desembolso'), 0)::bigint AS prestado,
            COALESCE(-sum(m.monto) FILTER (WHERE m.tipo = 'gasto'), 0)::bigint AS gastos,
            (SELECT COALESCE(sum(p.sugerido_hoy), 0) FROM prestamos p WHERE p.cobrador_id = u.id AND p.estado = 'activo')::bigint AS pendiente
       FROM usuarios u
       LEFT JOIN usuarios j ON j.id = u.jefe_id
       LEFT JOIN jornadas jo ON jo.usuario_id = u.id AND jo.fecha = $${params.length}
       LEFT JOIN movimientos_caja m ON m.jornada_id = jo.id
      WHERE ${filtro} AND u.id <> $${params.length - 1} AND u.estado = 'activo' AND u.rol IN ('supervisor', 'cobrador')
      GROUP BY u.id, j.nombre
      ORDER BY array_position(ARRAY['supervisor','cobrador'], u.rol), u.nombre`,
    params
  );
  return rows;
}

/** Resumen de la caja de un usuario en una fecha. */
export async function resumenCaja(yo, usuarioId, fecha = hoyBogota()) {
  const { rows: us } = await query(`SELECT id, nombre, rol, organizacion_id FROM usuarios WHERE id = $1`, [usuarioId]);
  if (!us[0]) throw new ErrorApp(404, "No encontrado", "no_encontrado");
  if (usuarioId !== yo.id) await exigirVisible(yo, usuarioId, us[0].organizacion_id);

  const { rows: jornadas } = await query(`SELECT id, fecha, estado, abierta_en, cerrada_en FROM jornadas WHERE usuario_id = $1 AND fecha = $2`, [usuarioId, fecha]);
  const jornada = jornadas[0] ?? null;
  const movimientos = jornada
    ? (
        await query(
          `SELECT m.id, m.tipo, m.metodo, m.monto, m.categoria, m.descripcion, m.ref_tipo, m.ref_id, m.creado_en,
                  cp.nombre AS contraparte_nombre, cl.nombre AS cliente_nombre
             FROM movimientos_caja m
             LEFT JOIN usuarios cp ON cp.id = m.contraparte_id
             LEFT JOIN pagos pg ON m.ref_tipo = 'pago' AND pg.id = m.ref_id
             LEFT JOIN prestamos pr ON m.ref_tipo = 'prestamo' AND pr.id = m.ref_id
             LEFT JOIN clientes cl ON cl.id = COALESCE(pg.cliente_id, pr.cliente_id)
            WHERE m.jornada_id = $1
            ORDER BY m.creado_en DESC`,
          [jornada.id]
        )
      ).rows
    : [];

  const totales = { base: 0, cobro: 0, desembolso: 0, gasto: 0, entrega: 0, ajuste: 0, anulacion: 0 };
  const porMetodo = { efectivo: 0, nequi: 0, daviplata: 0, transferencia: 0 };
  for (const m of movimientos) {
    totales[m.tipo] += m.monto;
    porMetodo[m.metodo] += m.monto;
  }
  return {
    usuario: us[0],
    fecha,
    jornada,
    movimientos,
    totales,
    porMetodo,
    /** Lo que debería tener en la mano (solo efectivo) */
    efectivoEsperado: porMetodo.efectivo,
    digital: porMetodo.nequi + porMetodo.daviplata + porMetodo.transferencia,
  };
}
