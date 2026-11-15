import "server-only";
import { transaccion } from "../db";
import { ErrorApp } from "../http";
import { exigirVisible } from "../permisos";
import { hoyBogota } from "@/lib/fechas";
import { dinero } from "@/lib/formato";
import { recalcular } from "./prestamos.service";
import { obtenerJornada, registrarMovimiento, fechaDeOperacion } from "./caja.service";
import * as auditoria from "../repos/auditoria.repo";

/**
 * Registra un abono. Es idempotente por `id` (lo genera el teléfono): si llega dos veces
 * —por ejemplo al reintentar sin señal— solo se guarda una.
 */
export async function registrar(yo, d, ip) {
  const hoy = hoyBogota();
  return transaccion(async (db) => {
    const { rows: existe } = await db.query(`SELECT id, prestamo_id FROM pagos WHERE id = $1`, [d.id]);
    if (existe[0]) {
      if (existe[0].prestamo_id !== d.prestamo_id) throw new ErrorApp(409, "Identificador de pago repetido", "id_repetido");
      return resultado(db, d.id, true);
    }

    const { rows } = await db.query(`SELECT id, cobrador_id, organizacion_id, cliente_id, estado FROM prestamos WHERE id = $1`, [d.prestamo_id]);
    const p0 = rows[0];
    if (!p0) throw new ErrorApp(404, "Préstamo no encontrado", "no_encontrado");
    await exigirVisible(yo, p0.cobrador_id, p0.organizacion_id);
    if (p0.estado !== "activo") throw new ErrorApp(409, p0.estado === "pagado" ? "Este préstamo ya está pagado" : "Este préstamo está anulado", "prestamo_cerrado");

    // Saldo al día antes de aceptar el pago
    const p = await recalcular(db, p0.id, hoy);
    if (d.monto > p.saldo) {
      throw new ErrorApp(400, `El pago supera lo que debe (${dinero(p.saldo)})`, "pago_mayor_saldo");
    }

    // Si se cobró sin señal, el pago queda en el día en que realmente se hizo
    let fecha = fechaDeOperacion(d.creado_en_dispositivo);
    if (fecha < p.fecha_inicio) fecha = p.fecha_inicio;
    const jornada = await obtenerJornada(db, { organizacionId: yo.org, usuarioId: yo.id, fecha });
    await db.query(
      `INSERT INTO pagos (id, organizacion_id, prestamo_id, cliente_id, cobrador_id, jornada_id, monto, metodo, fecha, nota, creado_en_dispositivo)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)`,
      [d.id, p.organizacion_id, p.id, p.cliente_id, yo.id, jornada.id, d.monto, d.metodo, fecha, d.nota, d.creado_en_dispositivo ?? null]
    );
    await registrarMovimiento(db, {
      organizacionId: p.organizacion_id, usuarioId: yo.id, jornadaId: jornada.id, tipo: "cobro", metodo: d.metodo,
      monto: d.monto, refTipo: "pago", refId: d.id, creadoPor: yo.id, creadoEnDispositivo: d.creado_en_dispositivo,
    });
    await recalcular(db, p.id, hoy);
    await auditoria.registrar(db, { organizacionId: p.organizacion_id, usuarioId: yo.id, accion: "pago.registrar", entidad: "pago", entidadId: d.id, datos: { prestamo: p.id, monto: d.monto, metodo: d.metodo }, ip });
    return resultado(db, d.id, false);
  });
}

async function resultado(db, pagoId, duplicado) {
  const { rows } = await db.query(
    `SELECT pg.id, pg.monto, pg.metodo, pg.fecha, pg.aplicado_recargo, pg.aplicado_interes, pg.aplicado_capital, pg.sobrante,
            p.id AS prestamo_id, p.saldo, p.estado AS prestamo_estado, c.nombre AS cliente_nombre
       FROM pagos pg JOIN prestamos p ON p.id = pg.prestamo_id JOIN clientes c ON c.id = pg.cliente_id
      WHERE pg.id = $1`,
    [pagoId]
  );
  return { ...rows[0], duplicado };
}

export async function anular(yo, pagoId, motivo, ip) {
  return transaccion(async (db) => {
    const { rows } = await db.query(
      `SELECT pg.*, p.cobrador_id AS prestamo_cobrador FROM pagos pg JOIN prestamos p ON p.id = pg.prestamo_id
        WHERE pg.id = $1 FOR UPDATE OF pg`,
      [pagoId]
    );
    const pg = rows[0];
    if (!pg) throw new ErrorApp(404, "Pago no encontrado", "no_encontrado");
    await exigirVisible(yo, pg.prestamo_cobrador, pg.organizacion_id);
    if (pg.anulado_en) return { id: pagoId };
    if (yo.rol === "cobrador" && (pg.cobrador_id !== yo.id || pg.fecha !== hoyBogota())) {
      throw new ErrorApp(403, "Solo puedes anular tus cobros de hoy. Pídeselo a tu jefe.", "prohibido");
    }

    await db.query(`UPDATE pagos SET anulado_en = now(), anulado_por = $2, motivo_anulacion = $3 WHERE id = $1`, [pagoId, yo.id, motivo]);
    // Contramovimiento en la misma caja donde entró el dinero
    // (fase 4: si esa jornada ya está cerrada, irá como ajuste en la jornada actual)
    await registrarMovimiento(db, {
      organizacionId: pg.organizacion_id, usuarioId: pg.cobrador_id, jornadaId: pg.jornada_id, tipo: "anulacion",
      metodo: pg.metodo, monto: -pg.monto, descripcion: `Pago anulado: ${motivo}`, refTipo: "pago", refId: pagoId, creadoPor: yo.id,
    });
    // Si el préstamo estaba pagado, vuelve a quedar activo; recalcular lo decide
    await db.query(`UPDATE prestamos SET estado = 'activo', pagado_en = NULL WHERE id = $1 AND estado = 'pagado'`, [pg.prestamo_id]);
    await recalcular(db, pg.prestamo_id);
    await auditoria.registrar(db, { organizacionId: pg.organizacion_id, usuarioId: yo.id, accion: "pago.anular", entidad: "pago", entidadId: pagoId, datos: { motivo, monto: pg.monto }, ip });
    return { id: pagoId };
  });
}
