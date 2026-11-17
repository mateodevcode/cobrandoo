import "server-only";
import { query, transaccion } from "../db";
import { ErrorApp } from "../http";
import { exigirVisible, filtroVisible } from "../permisos";
import { hoyBogota, sumarDias } from "@/lib/fechas";
import * as auditoria from "../repos/auditoria.repo";

/**
 * Jornada (caja del día) de un usuario; la crea si no existe.
 * Con `paraEscribir`: un día ya cerrado no recibe movimientos. Si es un día anterior
 * (p. ej. un cobro sin señal que llegó después del cierre) se anota en la caja de hoy;
 * si hoy ya está cerrado, se rechaza.
 * Con `alSiguienteDia`: si hoy ya está cerrado, el movimiento pasa a la caja de mañana. Se usa para
 * dinero que le LLEGA a alguien por acción de otro (entrega de un cierre, base), que no debe fallar.
 */
export async function obtenerJornada(db, { organizacionId, usuarioId, fecha = hoyBogota(), paraEscribir = false, alSiguienteDia = false }) {
  const { rows } = await db.query(
    `INSERT INTO jornadas (organizacion_id, usuario_id, fecha) VALUES ($1, $2, $3)
     ON CONFLICT (usuario_id, fecha) DO UPDATE SET usuario_id = EXCLUDED.usuario_id
     RETURNING id, estado, fecha`,
    [organizacionId, usuarioId, fecha]
  );
  const j = rows[0];
  if (!paraEscribir || j.estado === "abierta") return j;
  const hoy = hoyBogota();
  if (fecha < hoy) return obtenerJornada(db, { organizacionId, usuarioId, fecha: hoy, paraEscribir: true, alSiguienteDia });
  if (alSiguienteDia) return obtenerJornada(db, { organizacionId, usuarioId, fecha: sumarDias(fecha, 1), paraEscribir: true, alSiguienteDia });
  throw new ErrorApp(409, "La caja de hoy ya está cerrada. Habla con tu jefe para registrar este movimiento.", "dia_cerrado");
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
  // Reintento del mismo movimiento (modo sin señal): no se vuelve a evaluar ni a duplicar
  if (m.id) {
    const { rows: ya } = await db.query(`SELECT id, jornada_id FROM movimientos_caja WHERE id = $1`, [m.id]);
    if (ya[0]) return { id: ya[0].id, jornadaId: ya[0].jornada_id, duplicado: true };
  }
  let jornada;
  if (m.jornadaId) {
    const { rows: js } = await db.query(`SELECT id, estado FROM jornadas WHERE id = $1`, [m.jornadaId]);
    jornada = js[0]?.estado === "abierta" ? js[0] : await obtenerJornada(db, { organizacionId: m.organizacionId, usuarioId: m.usuarioId, paraEscribir: true, alSiguienteDia: m.alSiguienteDia });
  } else {
    jornada = await obtenerJornada(db, { organizacionId: m.organizacionId, usuarioId: m.usuarioId, fecha: m.fecha, paraEscribir: true, alSiguienteDia: m.alSiguienteDia });
  }
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
  const { rows } = await query(`SELECT id, organizacion_id, rol, nombre, estado, eliminado_en FROM usuarios WHERE id = $1`, [d.cobrador_id]);
  const cob = rows[0];
  if (!cob) throw new ErrorApp(404, "Cobrador no encontrado", "no_encontrado");
  await exigirVisible(yo, cob.id, cob.organizacion_id);
  // El dinero baja por la jerarquía: a supervisores y cobradores activos (nunca a otro dueño)
  if (!["supervisor", "cobrador"].includes(cob.rol) || cob.estado !== "activo" || cob.eliminado_en) {
    throw new ErrorApp(400, "Solo se entrega dinero a supervisores o cobradores activos", "destino_invalido");
  }
  const fecha = fechaDeOperacion(d.creado_en_dispositivo);

  return transaccion(async (db) => {
    const r = await registrarMovimiento(db, {
      id: d.id, organizacionId: yo.org, usuarioId: cob.id, tipo: "base", metodo: d.metodo, monto: d.monto, fecha,
      creadoEnDispositivo: d.creado_en_dispositivo, alSiguienteDia: true,
      descripcion: d.descripcion ?? `Base entregada por ${yo.nombre}`, contraparteId: yo.id, creadoPor: yo.id,
    });
    if (!r.duplicado) {
      // Lado del jefe: el dinero sale de su caja
      await registrarMovimiento(db, {
        organizacionId: yo.org, usuarioId: yo.id, tipo: "base_entregada", metodo: d.metodo, monto: -d.monto, fecha,
        descripcion: `Base para ${cob.nombre}`, contraparteId: cob.id, refTipo: "movimiento", refId: r.id, creadoPor: yo.id,
      });
      await auditoria.registrar(db, { organizacionId: yo.org, usuarioId: yo.id, accion: "caja.base", entidad: "movimiento", entidadId: r.id, datos: { cobrador: cob.id, monto: d.monto }, ip });
    }
    return { ...r, cobradorId: cob.id, cobradorNombre: cob.nombre };
  });
}

/**
 * El dueño registra el capital que mete al negocio (entra a su caja). Con eso su caja refleja
 * cuánto puso y cuánto ha repartido, en vez de quedar en negativo al entregar dinero.
 */
export async function registrarCapital(yo, d, ip) {
  if (yo.rol !== "dueno") throw new ErrorApp(403, "Solo el dueño registra capital", "prohibido");
  const fecha = fechaDeOperacion(d.creado_en_dispositivo);
  return transaccion(async (db) => {
    const r = await registrarMovimiento(db, {
      id: d.id, organizacionId: yo.org, usuarioId: yo.id, tipo: "base", metodo: d.metodo, monto: d.monto, fecha,
      categoria: "capital", descripcion: d.descripcion || "Aporte de capital", creadoPor: yo.id,
      creadoEnDispositivo: d.creado_en_dispositivo,
    });
    if (!r.duplicado) {
      await auditoria.registrar(db, { organizacionId: yo.org, usuarioId: yo.id, accion: "caja.capital", entidad: "movimiento", entidadId: r.id, datos: { monto: d.monto }, ip });
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
    `SELECT u.id, u.nombre, u.rol, j.nombre AS jefe_nombre, jo.estado AS jornada_estado,
            (SELECT ci.estado FROM cierres ci WHERE ci.jornada_id = jo.id) AS cierre_estado,
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
      GROUP BY u.id, j.nombre, jo.id
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

  const totales = { base: 0, cobro: 0, desembolso: 0, gasto: 0, entrega: 0, ajuste: 0, anulacion: 0, base_entregada: 0, recibido: 0 };
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
