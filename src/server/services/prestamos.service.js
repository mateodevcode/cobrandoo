import "server-only";
import { query, transaccion } from "../db";
import { ErrorApp } from "../http";
import { filtroVisible, exigirVisible } from "../permisos";
import { idsVisibles } from "../jerarquia";
import { hoyBogota, diasEntre } from "@/lib/fechas";
import { METODOS } from "@/lib/prestamos/metodos";
import { simular } from "@/lib/prestamos/motor";
import { registrarMovimiento, fechaDeOperacion } from "./caja.service";
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
 * Recalcula cargos, aplicación de pagos y saldos de un préstamo hasta `hoy`.
 * Debe llamarse dentro de una transacción; bloquea la fila del préstamo.
 */
export async function recalcular(db, prestamoId, hoy = hoyBogota()) {
  const { rows } = await db.query(`SELECT * FROM prestamos WHERE id = $1 FOR UPDATE`, [prestamoId]);
  const p = rows[0];
  if (!p || p.estado === "anulado") return p;

  const { rows: pagos } = await db.query(
    `SELECT id, monto, fecha, creado_en FROM pagos
      WHERE prestamo_id = $1 AND anulado_en IS NULL ORDER BY fecha, creado_en`,
    [prestamoId]
  );
  const r = simular({
    prestamo: condiciones(p),
    pagos: pagos.map((x) => ({ id: x.id, monto: x.monto, fecha: x.fecha, orden: x.creado_en.toISOString() })),
    hasta: hoy,
  });

  await db.query(`DELETE FROM prestamo_cargos WHERE prestamo_id = $1`, [prestamoId]);
  if (r.cargos.length) {
    await db.query(
      `INSERT INTO prestamo_cargos (prestamo_id, tipo, monto, fecha, clave, descripcion)
       SELECT $1, * FROM unnest($2::text[], $3::bigint[], $4::date[], $5::text[], $6::text[])`,
      [prestamoId, r.cargos.map((c) => c.tipo), r.cargos.map((c) => c.monto), r.cargos.map((c) => c.fecha), r.cargos.map((c) => c.clave), r.cargos.map((c) => c.descripcion ?? null)]
    );
  }
  if (pagos.length) {
    const a = pagos.map((x) => r.aplicaciones[x.id] ?? { recargo: 0, interes: 0, capital: 0, sobrante: x.monto });
    await db.query(
      `UPDATE pagos SET aplicado_recargo = u.rec, aplicado_interes = u.int, aplicado_capital = u.cap, sobrante = u.sob
         FROM unnest($1::uuid[], $2::bigint[], $3::bigint[], $4::bigint[], $5::bigint[]) AS u(id, rec, int, cap, sob)
        WHERE pagos.id = u.id`,
      [pagos.map((x) => x.id), a.map((x) => x.recargo), a.map((x) => x.interes), a.map((x) => x.capital), a.map((x) => x.sobrante)]
    );
  }
  const { rows: act } = await db.query(
    `UPDATE prestamos
        SET estado = $2, total_cargado = $3, total_pagado = $4, saldo_capital = $5, saldo_interes = $6, saldo_recargo = $7,
            atraso = $8, dias_atraso = $9, sugerido_hoy = $10, proximo_corte = $11, procesado_hasta = $12, pagado_en = $13
      WHERE id = $1
      RETURNING *`,
    [prestamoId, r.estado, r.totalCargado, r.totalPagado, r.saldos.capital, r.saldos.interes, r.saldos.recargo,
     r.atraso, r.diasAtraso, r.sugeridoHoy, r.proximoCorte, hoy, r.fechaPagado]
  );
  return act[0];
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
    const parametros = { version: VERSION_MOTOR, ...terminos, id: undefined, notas: undefined, creado_en_dispositivo: undefined };

    const { rows } = await db.query(
      `INSERT INTO prestamos (id, organizacion_id, cliente_id, cobrador_id, metodo, parametros, capital, tasa, base_interes,
                             frecuencia, n_cuotas, valor_cuota, recargo_tipo, recargo_valor, metodo_desembolso,
                             fecha_inicio, fecha_vencimiento, proximo_corte, notas, creado_por)
       VALUES (COALESCE($1, gen_random_uuid()), $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20)
       RETURNING id`,
      [d.id ?? null, yo.org, cliente.id, cliente.cobrador_id, d.metodo, JSON.stringify(parametros), d.capital, d.tasa,
       d.base_interes, d.frecuencia, d.n_cuotas, plan.valor_cuota, d.recargo_tipo, d.recargo_valor, d.metodo_desembolso,
       fechaInicio, plan.fecha_vencimiento, plan.proximo_corte, d.notas, yo.id]
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
    if (d.registrar_desembolso) {
      await registrarMovimiento(db, {
        organizacionId: yo.org, usuarioId: yo.id, tipo: "desembolso", metodo: d.metodo_desembolso, monto: -d.capital,
        fecha: fechaDeOperacion(d.creado_en_dispositivo),
        descripcion: `Préstamo a ${cliente.nombre}`, refTipo: "prestamo", refId: id, creadoPor: yo.id,
        creadoEnDispositivo: d.creado_en_dispositivo,
      });
    }

    await recalcular(db, id, hoy);
    await auditoria.registrar(db, {
      organizacionId: yo.org, usuarioId: yo.id, accion: "prestamo.crear", entidad: "prestamo", entidadId: id,
      datos: { cliente: cliente.id, metodo: d.metodo, capital: d.capital, tasa: d.tasa }, ip,
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
              cr.nombre AS creado_por_nombre, an.nombre AS anulado_por_nombre
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
    await auditoria.registrar(db, { organizacionId: p.organizacion_id, usuarioId: yo.id, accion: "prestamo.anular", entidad: "prestamo", entidadId: id, datos: { motivo }, ip });
    return { id };
  });
}
