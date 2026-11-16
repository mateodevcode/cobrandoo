import "server-only";
import { transaccion } from "../db";
import { ErrorApp } from "../http";
import { exigirVisible } from "../permisos";
import { hoyBogota } from "@/lib/fechas";
import { dinero } from "@/lib/formato";
import { recalcular, cargarParaCalcular, calcular, guardarCalculo } from "./prestamos.service";
import { obtenerJornada, registrarMovimiento, fechaDeOperacion } from "./caja.service";
import * as auditoria from "../repos/auditoria.repo";

/**
 * Registra un abono. Es idempotente por `id` (lo genera el teléfono): si llega dos veces
 * —por ejemplo al reintentar sin señal— solo se guarda una.
 */
export async function registrar(yo, d, ip) {
  const hoy = hoyBogota();
  return transaccion(async (db) => {
    // 1) Préstamo + pagos + ¿este pago ya existe?  (una consulta, con bloqueo)
    const p = await cargarParaCalcular(db, d.prestamo_id, d.id);
    if (p?.pago_existente_de) {
      if (p.pago_existente_de !== d.prestamo_id) throw new ErrorApp(409, "Identificador de pago repetido", "id_repetido");
      return resultado(db, d.id, true);
    }
    if (!p) {
      const { rows } = await db.query(`SELECT 1 FROM pagos WHERE id = $1`, [d.id]);
      throw rows[0] ? new ErrorApp(409, "Identificador de pago repetido", "id_repetido") : new ErrorApp(404, "Préstamo no encontrado", "no_encontrado");
    }
    await exigirVisible(yo, p.cobrador_id, p.organizacion_id);
    if (p.estado !== "activo") throw new ErrorApp(409, p.estado === "pagado" ? "Este préstamo ya está pagado" : "Este préstamo está anulado", "prestamo_cerrado");

    // 2) Saldo al día (en memoria, con el motor) antes de aceptar el pago
    const antes = calcular(p, p.pagos_validos, hoy);
    if (d.monto > antes.saldo) {
      throw new ErrorApp(400, `El pago supera lo que debe (${dinero(antes.saldo)})`, "pago_mayor_saldo");
    }

    // Si se cobró sin señal, el pago queda en el día en que realmente se hizo
    // (se valida después del chequeo de duplicado: un reintento viejo ya guardado debe responder igual)
    const fechaDispositivo = fechaDeOperacion(d.creado_en_dispositivo);
    const fecha = fechaDispositivo < p.fecha_inicio ? p.fecha_inicio : fechaDispositivo;
    // 3) Caja del día (respeta días cerrados)
    const jornada = await obtenerJornada(db, { organizacionId: yo.org, usuarioId: yo.id, fecha, paraEscribir: true });

    // 4) Pago + movimiento de caja + auditoría  (una consulta)
    await db.query(
      `WITH pago AS (
         INSERT INTO pagos (id, organizacion_id, prestamo_id, cliente_id, cobrador_id, jornada_id, monto, metodo, fecha, nota, creado_en_dispositivo)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
         RETURNING id
       ),
       mov AS (
         INSERT INTO movimientos_caja (organizacion_id, usuario_id, jornada_id, tipo, metodo, monto, ref_tipo, ref_id, creado_por, creado_en_dispositivo)
         SELECT $2, $5, $6, 'cobro', $8, $7, 'pago', id, $5, $11 FROM pago
       )
       INSERT INTO auditoria (organizacion_id, usuario_id, accion, entidad, entidad_id, datos, ip)
       SELECT $2, $5, 'pago.registrar', 'pago', id, $12, $13 FROM pago`,
      [d.id, p.organizacion_id, p.id, p.cliente_id, yo.id, jornada.id, d.monto, d.metodo, fecha, d.nota, d.creado_en_dispositivo ?? null,
       JSON.stringify({ prestamo: p.id, monto: d.monto, metodo: d.metodo }), ip]
    );

    // 5) Recalcular con el pago nuevo (en memoria) y guardar  (una consulta)
    const pagos = [...p.pagos_validos, { id: d.id, monto: d.monto, fecha, orden: Number.MAX_SAFE_INTEGER }];
    const r = calcular(p, pagos, hoy);
    const actualizado = await guardarCalculo(db, p.id, r, pagos, hoy);
    const a = r.aplicaciones[d.id];
    return {
      id: d.id, monto: d.monto, metodo: d.metodo, fecha,
      aplicado_recargo: a.recargo, aplicado_interes: a.interes, aplicado_capital: a.capital, sobrante: a.sobrante,
      prestamo_id: p.id, saldo: actualizado.saldo, prestamo_estado: actualizado.estado, cliente_nombre: p.cliente_nombre,
      duplicado: false,
    };
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
