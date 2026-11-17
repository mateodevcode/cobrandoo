import "server-only";
import { query, transaccion } from "../db";
import { ErrorApp } from "../http";
import { filtroVisible, exigirVisible } from "../permisos";
import { idsVisibles } from "../jerarquia";
import { hoyBogota, diasEntre } from "@/lib/fechas";
import { dinero } from "@/lib/formato";
import { METODOS } from "@/lib/prestamos/metodos";
import { simular } from "@/lib/prestamos/motor";
import { registrarMovimiento, fechaDeOperacion, obtenerJornada } from "./caja.service";
import * as auditoria from "../repos/auditoria.repo";

const VERSION_MOTOR = 1;

/** Condiciones del préstamo en el formato que espera el motor. */
const condiciones = (p) => ({
  metodo: p.metodo,
  capital: p.capital,
  tasa: Number(p.tasa),
  base_interes: p.base_interes,
  fecha_inicio: p.fecha_inicio,
  n_cuotas: p.n_cuotas,
  frecuencia: p.frecuencia,
  recargo_tipo: p.recargo_tipo,
  recargo_valor: Number(p.recargo_valor),
});

/**
 * Carga y bloquea un préstamo junto con sus pagos válidos, en UNA consulta.
 * Con `pagoId` indica además si ese pago ya existe (reintentos sin señal).
 */
export async function cargarParaCalcular(db, prestamoId, pagoId = null) {
  const { rows } = await db.query(
    `SELECT p.*,
            COALESCE((SELECT json_agg(json_build_object('id', x.id, 'monto', x.monto, 'fecha', x.fecha,
                                                        'orden', (extract(epoch FROM x.creado_en) * 1000000)::bigint)
                                      ORDER BY x.fecha, x.creado_en)
                        FROM pagos x WHERE x.prestamo_id = p.id AND x.anulado_en IS NULL), '[]'::json) AS pagos_validos,
            (SELECT prestamo_id FROM pagos WHERE id = $2) AS pago_existente_de,
            (SELECT nombre FROM clientes WHERE id = p.cliente_id) AS cliente_nombre
       FROM prestamos p WHERE p.id = $1
        FOR UPDATE OF p`,
    [prestamoId, pagoId]
  );
  const p = rows[0];
  if (p) p.pagos_validos = p.pagos_validos.map((x) => ({ ...x, monto: Number(x.monto), orden: Number(x.orden) }));
  return p ?? null;
}

/** Corre el motor sobre un préstamo cargado (sin tocar la base). */
export const calcular = (p, pagos, hoy = hoyBogota()) => simular({ prestamo: condiciones(p), pagos, hasta: hoy });

/**
 * Guarda el resultado del motor en UNA consulta: cargos (solo los que cambian), aplicación
 * de cada pago y saldos del préstamo.
 */
export async function guardarCalculo(db, prestamoId, r, pagos, hoy = hoyBogota()) {
  const a = pagos.map((x) => r.aplicaciones[x.id] ?? { recargo: 0, interes: 0, capital: 0, sobrante: x.monto });
  const { rows } = await db.query(
    `WITH nuevos AS (
       SELECT * FROM unnest($2::text[], $3::bigint[], $4::date[], $5::text[], $6::text[]) AS n(tipo, monto, fecha, clave, descripcion)
     ),
     borrados AS (
       DELETE FROM prestamo_cargos WHERE prestamo_id = $1 AND NOT (clave = ANY($5::text[]))
     ),
     cargos AS (
       INSERT INTO prestamo_cargos (prestamo_id, tipo, monto, fecha, clave, descripcion)
       SELECT $1, tipo, monto, fecha, clave, descripcion FROM nuevos
       ON CONFLICT (prestamo_id, clave) DO UPDATE
          SET tipo = EXCLUDED.tipo, monto = EXCLUDED.monto, fecha = EXCLUDED.fecha, descripcion = EXCLUDED.descripcion
        WHERE (prestamo_cargos.tipo, prestamo_cargos.monto, prestamo_cargos.fecha, prestamo_cargos.descripcion)
              IS DISTINCT FROM (EXCLUDED.tipo, EXCLUDED.monto, EXCLUDED.fecha, EXCLUDED.descripcion)
     ),
     aplicados AS (
       UPDATE pagos SET aplicado_recargo = u.rec, aplicado_interes = u.int, aplicado_capital = u.cap, sobrante = u.sob
         FROM unnest($7::uuid[], $8::bigint[], $9::bigint[], $10::bigint[], $11::bigint[]) AS u(id, rec, int, cap, sob)
        WHERE pagos.id = u.id
          AND (pagos.aplicado_recargo, pagos.aplicado_interes, pagos.aplicado_capital, pagos.sobrante)
              IS DISTINCT FROM (u.rec, u.int, u.cap, u.sob)
     )
     UPDATE prestamos
        SET estado = $12, total_cargado = $13, total_pagado = $14, saldo_capital = $15, saldo_interes = $16, saldo_recargo = $17,
            atraso = $18, dias_atraso = $19, sugerido_hoy = $20, proximo_corte = $21, procesado_hasta = $22, pagado_en = $23
      WHERE id = $1
      RETURNING *`,
    [
      prestamoId,
      r.cargos.map((c) => c.tipo), r.cargos.map((c) => c.monto), r.cargos.map((c) => c.fecha), r.cargos.map((c) => c.clave), r.cargos.map((c) => c.descripcion ?? null),
      pagos.map((x) => x.id), a.map((x) => x.recargo), a.map((x) => x.interes), a.map((x) => x.capital), a.map((x) => x.sobrante),
      r.estado, r.totalCargado, r.totalPagado, r.saldos.capital, r.saldos.interes, r.saldos.recargo,
      r.atraso, r.diasAtraso, r.sugeridoHoy, r.proximoCorte, hoy, r.fechaPagado,
    ]
  );
  return rows[0];
}

/**
 * Recalcula cargos, aplicación de pagos y saldos de un préstamo hasta `hoy` (2 consultas).
 * Debe llamarse dentro de una transacción; bloquea la fila del préstamo.
 */
export async function recalcular(db, prestamoId, hoy = hoyBogota()) {
  const p = await cargarParaCalcular(db, prestamoId);
  if (!p || p.estado === "anulado") return p;
  return guardarCalculo(db, prestamoId, calcular(p, p.pagos_validos, hoy), p.pagos_validos, hoy);
}

/** Recalcula los préstamos activos que no se han procesado hoy (cron diario y pantallas). */
export async function procesarPendientes({ hoy = hoyBogota(), cobradorIds, organizacionId, limite = 500 } = {}) {
  const params = [hoy];
  const where = [`estado = 'activo'`, `(procesado_hasta IS NULL OR procesado_hasta < $1)`];
  if (cobradorIds) {
    params.push(cobradorIds);
    where.push(`cobrador_id = ANY($${params.length}::uuid[])`);
  }
  if (organizacionId) {
    params.push(organizacionId);
    where.push(`organizacion_id = $${params.length}`);
  }
  params.push(limite);
  const { rows } = await query(`SELECT id FROM prestamos WHERE ${where.join(" AND ")} LIMIT $${params.length}`, params);
  for (const { id } of rows) {
    await transaccion((db) => recalcular(db, id, hoy));
  }
  return rows.length;
}

/** Al abrir una pantalla: procesa lo pendiente de lo que `yo` puede ver. */
export async function ponerAlDia(yo) {
  if (yo.rol === "dueno") return procesarPendientes({ organizacionId: yo.org, limite: 300 });
  return procesarPendientes({ cobradorIds: await idsVisibles(yo), limite: 300 });
}

export async function crear(yo, d, ip) {
  const hoy = hoyBogota();
  // Préstamo hecho sin señal: cuenta desde el día en que se hizo en el teléfono
  const fechaInicio = d.fecha_inicio ? (d.fecha_inicio > hoy ? hoy : d.fecha_inicio) : fechaDeOperacion(d.creado_en_dispositivo);
  if (d.registrar_desembolso) fechaDeOperacion(d.creado_en_dispositivo); // valida que no sea demasiado antigua
  if (diasEntre(fechaInicio, hoy) > 730) throw new ErrorApp(400, "La fecha de inicio es demasiado antigua", "fecha_invalida");

  return transaccion(async (db) => {
    if (d.id) {
      const { rows } = await db.query(`SELECT id FROM prestamos WHERE id = $1`, [d.id]);
      if (rows[0]) return { id: d.id, duplicado: true };
    }
    const { rows: cs } = await db.query(`SELECT id, cobrador_id, organizacion_id, estado, nombre FROM clientes WHERE id = $1`, [d.cliente_id]);
    const cliente = cs[0];
    if (!cliente) throw new ErrorApp(404, "Cliente no encontrado", "no_encontrado");
    await exigirVisible(yo, cliente.cobrador_id, cliente.organizacion_id);
    if (cliente.estado !== "activo") throw new ErrorApp(400, "El cliente está inactivo", "cliente_inactivo");

    const terminos = { ...d, fecha_inicio: fechaInicio };
    const plan = METODOS[d.metodo].generar(terminos);
    const parametros = { version: VERSION_MOTOR, ...terminos, id: undefined, notas: undefined, creado_en_dispositivo: undefined, renueva_a: undefined };

    // Renovación: el saldo de hoy del préstamo anterior se descuenta de lo que se entrega
    let renovado = null;
    if (d.renueva_a) {
      if (!d.registrar_desembolso || fechaInicio !== hoy) throw new ErrorApp(400, "Una renovación se hace con fecha de hoy y saliendo de la caja", "renovacion_invalida");
      const v = await cargarParaCalcular(db, d.renueva_a);
      if (!v || v.cliente_id !== cliente.id) throw new ErrorApp(400, "El préstamo a renovar no es de este cliente", "renovacion_invalida");
      if (v.estado !== "activo") throw new ErrorApp(409, "Ese préstamo ya no está activo", "prestamo_cerrado");
      const saldo = calcular(v, v.pagos_validos, hoy).saldo;
      if (saldo > plan.entregado) throw new ErrorApp(400, `Para renovar, el préstamo nuevo debe entregar al menos ${dinero(saldo)} (lo que debe hoy)`, "renovacion_insuficiente");
      renovado = { v, saldo };
    }

    const { rows } = await db.query(
      `INSERT INTO prestamos (id, organizacion_id, cliente_id, cobrador_id, metodo, parametros, capital, tasa, base_interes,
                             frecuencia, n_cuotas, valor_cuota, recargo_tipo, recargo_valor, metodo_desembolso,
                             fecha_inicio, fecha_vencimiento, proximo_corte, notas, creado_por, monto_entregado, renueva_a, saldo_renovado)
       VALUES (COALESCE($1, gen_random_uuid()), $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22, $23)
       RETURNING id`,
      [d.id ?? null, yo.org, cliente.id, cliente.cobrador_id, d.metodo, JSON.stringify(parametros), d.capital, d.tasa,
       d.base_interes, d.frecuencia, d.n_cuotas, plan.valor_cuota, d.recargo_tipo, d.recargo_valor, d.metodo_desembolso,
       fechaInicio, plan.fecha_vencimiento, plan.proximo_corte, d.notas, yo.id, plan.entregado, renovado?.v.id ?? null, renovado?.saldo ?? 0]
    );
    const id = rows[0].id;

    if (plan.cuotas.length) {
      await db.query(
        `INSERT INTO cuotas (prestamo_id, numero, fecha, monto)
         SELECT $1, * FROM unnest($2::int[], $3::date[], $4::bigint[])`,
        [id, plan.cuotas.map((c) => c.numero), plan.cuotas.map((c) => c.fecha), plan.cuotas.map((c) => c.monto)]
      );
    }

    // El dinero sale de la caja de quien presta (hoy). Un préstamo antiguo que se está
    // registrando en el sistema puede marcarse para no mover la caja.
    // (Con interés descontado sale de caja menos que el capital.)
    if (renovado && renovado.saldo > 0) {
      // Se salda el préstamo anterior con lo que debía (sin dinero en mano: no toca la caja)
      const jornada = await obtenerJornada(db, { organizacionId: yo.org, usuarioId: yo.id, paraEscribir: true });
      await db.query(
        `INSERT INTO pagos (id, organizacion_id, prestamo_id, cliente_id, cobrador_id, jornada_id, monto, metodo, fecha, nota)
         VALUES (gen_random_uuid(), $1, $2, $3, $4, $5, $6, 'renovacion', $7, $8)`,
        [yo.org, renovado.v.id, cliente.id, yo.id, jornada.id, renovado.saldo, hoy, "Saldado al renovar"]
      );
      await recalcular(db, renovado.v.id, hoy);
    }
    const sale = plan.entregado - (renovado?.saldo ?? 0);
    if (d.registrar_desembolso && sale > 0) {
      await registrarMovimiento(db, {
        organizacionId: yo.org, usuarioId: yo.id, tipo: "desembolso", metodo: d.metodo_desembolso, monto: -sale,
        fecha: fechaDeOperacion(d.creado_en_dispositivo),
        descripcion: renovado ? `Renovación a ${cliente.nombre}` : `Préstamo a ${cliente.nombre}`, refTipo: "prestamo", refId: id, creadoPor: yo.id,
        creadoEnDispositivo: d.creado_en_dispositivo,
      });
    }

    await recalcular(db, id, hoy);
    await auditoria.registrar(db, {
      organizacionId: yo.org, usuarioId: yo.id, accion: "prestamo.crear", entidad: "prestamo", entidadId: id,
      datos: { cliente: cliente.id, metodo: d.metodo, capital: d.capital, tasa: d.tasa, renueva_a: renovado?.v.id, saldo_renovado: renovado?.saldo }, ip,
    });
    return { id };
  });
}

const COLS_LISTA = `p.id, p.cliente_id, p.cobrador_id, p.metodo, p.capital, p.tasa, p.frecuencia, p.n_cuotas, p.valor_cuota,
  p.fecha_inicio, p.fecha_vencimiento, p.estado, p.total_cargado, p.total_pagado, p.saldo, p.saldo_capital, p.saldo_interes,
  p.saldo_recargo, p.atraso, p.dias_atraso, p.sugerido_hoy, p.proximo_corte, p.pagado_en, p.creado_en`;

export async function listar(yo, { estado = "activo", clienteId, enMora, cobradorId } = {}) {
  await ponerAlDia(yo);
  const params = [];
  const where = [await filtroVisible(yo, "p.cobrador_id", "p.organizacion_id", params)];
  if (estado && estado !== "todos") {
    params.push(estado);
    where.push(`p.estado = $${params.length}`);
  }
  if (clienteId) {
    params.push(clienteId);
    where.push(`p.cliente_id = $${params.length}`);
  }
  if (cobradorId) {
    params.push(cobradorId);
    where.push(`p.cobrador_id = $${params.length}`);
  }
  if (enMora) where.push(`p.dias_atraso > 0`);
  const { rows } = await query(
    `SELECT ${COLS_LISTA}, c.nombre AS cliente_nombre, u.nombre AS cobrador_nombre
       FROM prestamos p
       JOIN clientes c ON c.id = p.cliente_id
       JOIN usuarios u ON u.id = p.cobrador_id
      WHERE ${where.join(" AND ")}
      ORDER BY p.dias_atraso DESC, p.creado_en DESC
      LIMIT 500`,
    params
  );
  return rows;
}

/** Detalle completo: condiciones, cuotas (con estado), cargos y pagos. */
export async function obtener(yo, id) {
  const { rows: base } = await query(`SELECT id, cobrador_id, organizacion_id, estado, procesado_hasta FROM prestamos WHERE id = $1`, [id]);
  if (!base[0]) throw new ErrorApp(404, "Préstamo no encontrado", "no_encontrado");
  await exigirVisible(yo, base[0].cobrador_id, base[0].organizacion_id);

  const hoy = hoyBogota();
  if (base[0].estado === "activo" && base[0].procesado_hasta !== hoy) {
    await transaccion((db) => recalcular(db, id, hoy));
  }

  const [{ rows: ps }, { rows: cuotas }, { rows: cargos }, { rows: pagos }] = await Promise.all([
    query(
      `SELECT p.*, c.nombre AS cliente_nombre, c.telefono AS cliente_telefono, u.nombre AS cobrador_nombre,
              cr.nombre AS creado_por_nombre, an.nombre AS anulado_por_nombre,
              (SELECT r.id FROM prestamos r WHERE r.renueva_a = p.id AND r.estado <> 'anulado' LIMIT 1) AS renovado_por
         FROM prestamos p
         JOIN clientes c ON c.id = p.cliente_id
         JOIN usuarios u ON u.id = p.cobrador_id
         LEFT JOIN usuarios cr ON cr.id = p.creado_por
         LEFT JOIN usuarios an ON an.id = p.anulado_por
        WHERE p.id = $1`,
      [id]
    ),
    query(`SELECT numero, fecha, monto FROM cuotas WHERE prestamo_id = $1 ORDER BY numero`, [id]),
    query(`SELECT tipo, monto, fecha, clave, descripcion FROM prestamo_cargos WHERE prestamo_id = $1 ORDER BY fecha, id`, [id]),
    query(
      `SELECT pg.id, pg.monto, pg.metodo, pg.fecha, pg.aplicado_recargo, pg.aplicado_interes, pg.aplicado_capital, pg.sobrante,
              pg.nota, pg.creado_en, pg.anulado_en, pg.motivo_anulacion, pg.cobrador_id,
              u.nombre AS cobrado_por, an.nombre AS anulado_por_nombre
         FROM pagos pg
         JOIN usuarios u ON u.id = pg.cobrador_id
         LEFT JOIN usuarios an ON an.id = pg.anulado_por
        WHERE pg.prestamo_id = $1
        ORDER BY pg.fecha DESC, pg.creado_en DESC`,
      [id]
    ),
  ]);

  // Estado de cada cuota según lo abonado a capital + interés
  const prestamo = ps[0];
  let cubierto = pagos.filter((x) => !x.anulado_en).reduce((s, x) => s + x.aplicado_capital + x.aplicado_interes, 0);
  const cuotasConEstado = cuotas.map((c) => {
    const pagado = Math.min(c.monto, Math.max(0, cubierto));
    cubierto -= c.monto;
    const estado = pagado >= c.monto ? "pagada" : c.fecha < hoy ? "vencida" : c.fecha === hoy ? "hoy" : pagado > 0 ? "parcial" : "pendiente";
    return { ...c, pagado, estado: pagado > 0 && pagado < c.monto && c.fecha >= hoy ? "parcial" : estado };
  });

  return { prestamo, cuotas: cuotasConEstado, cargos, pagos };
}

export async function anular(yo, id, motivo, ip) {
  return transaccion(async (db) => {
    const { rows } = await db.query(`SELECT * FROM prestamos WHERE id = $1 FOR UPDATE`, [id]);
    const p = rows[0];
    if (!p) throw new ErrorApp(404, "Préstamo no encontrado", "no_encontrado");
    await exigirVisible(yo, p.cobrador_id, p.organizacion_id);
    if (p.estado === "anulado") return { id };
    // El cobrador solo puede anular lo que él mismo creó hoy; lo demás lo anula su jefe
    if (yo.rol === "cobrador" && (p.creado_por !== yo.id || hoyBogota(p.creado_en) !== hoyBogota())) {
      throw new ErrorApp(403, "Solo tu jefe puede anular este préstamo", "prohibido");
    }
    const { rows: pg } = await db.query(`SELECT count(*)::int AS n FROM pagos WHERE prestamo_id = $1 AND anulado_en IS NULL`, [id]);
    if (pg[0].n > 0) throw new ErrorApp(409, "Tiene pagos registrados. Anula primero los pagos.", "tiene_pagos");

    await db.query(
      `UPDATE prestamos SET estado = 'anulado', anulado_en = now(), anulado_por = $2, motivo_anulacion = $3 WHERE id = $1`,
      [id, yo.id, motivo]
    );
    // Devuelve a la caja el dinero del desembolso (si salió de caja)
    const { rows: mov } = await db.query(
      `SELECT usuario_id, metodo, monto, jornada_id FROM movimientos_caja WHERE ref_tipo = 'prestamo' AND ref_id = $1 AND tipo = 'desembolso'`,
      [id]
    );
    for (const m of mov) {
      await registrarMovimiento(db, {
        organizacionId: p.organizacion_id, usuarioId: m.usuario_id, jornadaId: m.jornada_id, tipo: "anulacion",
        metodo: m.metodo, monto: -m.monto, descripcion: `Anulación de préstamo: ${motivo}`, refTipo: "prestamo", refId: id, creadoPor: yo.id,
      });
    }
    // Si era una renovación, el préstamo anterior vuelve a quedar como estaba
    if (p.renueva_a) {
      await db.query(
        `UPDATE pagos SET anulado_en = now(), anulado_por = $2, motivo_anulacion = $3
          WHERE prestamo_id = $1 AND metodo = 'renovacion' AND anulado_en IS NULL`,
        [p.renueva_a, yo.id, "Se anuló la renovación"]
      );
      await db.query(`UPDATE prestamos SET estado = 'activo', pagado_en = NULL WHERE id = $1 AND estado = 'pagado'`, [p.renueva_a]);
      await recalcular(db, p.renueva_a);
    }
    await auditoria.registrar(db, { organizacionId: p.organizacion_id, usuarioId: yo.id, accion: "prestamo.anular", entidad: "prestamo", entidadId: id, datos: { motivo }, ip });
    return { id };
  });
}
