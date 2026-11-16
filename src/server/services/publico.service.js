import "server-only";
import { randomBytes } from "node:crypto";
import { query, transaccion } from "../db";
import { ErrorApp } from "../http";
import { exigirVisible } from "../permisos";
import { hoyBogota } from "@/lib/fechas";
import { recalcular } from "./prestamos.service";
import * as auditoria from "../repos/auditoria.repo";

const FORMATO_TOKEN = /^[A-Za-z0-9_-]{24,64}$/;

/**
 * Historial que ve el cliente con su link secreto (/c/{token}). Solo lectura y solo lo suyo:
 * sin cédula, teléfono ni datos internos del negocio.
 */
export async function historialPorToken(token) {
  if (!FORMATO_TOKEN.test(token ?? "")) return null;
  const { rows: cs } = await query(
    `SELECT c.id, c.nombre, o.nombre AS organizacion, split_part(u.nombre, ' ', 1) AS cobrador
       FROM clientes c
       JOIN organizaciones o ON o.id = c.organizacion_id AND o.activa
       JOIN usuarios u ON u.id = c.cobrador_id
      WHERE c.token_publico = $1`,
    [token]
  );
  const cliente = cs[0];
  if (!cliente) return null;

  // Saldos al día de hoy antes de mostrarlos
  const hoy = hoyBogota();
  const { rows: pendientes } = await query(
    `SELECT id FROM prestamos WHERE cliente_id = $1 AND estado = 'activo' AND (procesado_hasta IS NULL OR procesado_hasta < $2)`,
    [cliente.id, hoy]
  );
  for (const { id } of pendientes) await transaccion((db) => recalcular(db, id, hoy));

  const [{ rows: prestamos }, { rows: cuotas }, { rows: pagos }] = await Promise.all([
    query(
      `SELECT id, metodo, capital, monto_entregado, tasa, frecuencia, n_cuotas, valor_cuota, fecha_inicio, fecha_vencimiento,
              estado, total_cargado, total_pagado, saldo, saldo_recargo, sugerido_hoy, dias_atraso, proximo_corte, pagado_en
         FROM prestamos WHERE cliente_id = $1 AND estado <> 'anulado'
        ORDER BY (estado = 'activo') DESC, fecha_inicio DESC LIMIT 20`,
      [cliente.id]
    ),
    query(
      `SELECT q.prestamo_id, q.numero, q.fecha, q.monto
         FROM cuotas q JOIN prestamos p ON p.id = q.prestamo_id
        WHERE p.cliente_id = $1 AND p.estado = 'activo' ORDER BY q.prestamo_id, q.numero`,
      [cliente.id]
    ),
    query(
      `SELECT pg.prestamo_id, pg.monto, pg.metodo, pg.fecha, pg.aplicado_capital, pg.aplicado_interes
         FROM pagos pg WHERE pg.cliente_id = $1 AND pg.anulado_en IS NULL
        ORDER BY pg.fecha DESC, pg.creado_en DESC LIMIT 300`,
      [cliente.id]
    ),
  ]);

  // Estado de cada cuota según lo abonado a capital + interés
  for (const p of prestamos) {
    let cubierto = pagos.filter((x) => x.prestamo_id === p.id).reduce((s, x) => s + x.aplicado_capital + x.aplicado_interes, 0);
    p.cuotas = cuotas
      .filter((c) => c.prestamo_id === p.id)
      .map((c) => {
        const pagado = Math.min(c.monto, Math.max(0, cubierto));
        cubierto -= c.monto;
        return { numero: c.numero, fecha: c.fecha, monto: c.monto, estado: pagado >= c.monto ? "pagada" : c.fecha < hoy ? "vencida" : c.fecha === hoy ? "hoy" : pagado > 0 ? "parcial" : "pendiente" };
      });
    p.pagos = pagos.filter((x) => x.prestamo_id === p.id).map(({ monto, metodo, fecha }) => ({ monto, metodo, fecha }));
    p.proxima = p.cuotas.find((c) => c.estado !== "pagada") ?? null;
  }
  return { cliente: { nombre: cliente.nombre, organizacion: cliente.organizacion, cobrador: cliente.cobrador }, prestamos, hoy };
}

/** Cambia el link del cliente (el anterior deja de funcionar al instante). */
export async function regenerarToken(yo, clienteId, ip) {
  const { rows } = await query(`SELECT id, cobrador_id, organizacion_id FROM clientes WHERE id = $1`, [clienteId]);
  if (!rows[0]) throw new ErrorApp(404, "Cliente no encontrado", "no_encontrado");
  await exigirVisible(yo, rows[0].cobrador_id, rows[0].organizacion_id);
  const token = randomBytes(24).toString("base64url");
  await query(`UPDATE clientes SET token_publico = $2 WHERE id = $1`, [clienteId, token]);
  await auditoria.registrar(undefined, { organizacionId: rows[0].organizacion_id, usuarioId: yo.id, accion: "cliente.regenerar_link", entidad: "cliente", entidadId: clienteId, ip });
  return { token };
}

// Límite simple por IP para el link público (por instancia del servidor)
const visitas = new Map();
export function limiteVisitas(ip, maxPorMinuto = 30) {
  const ahora = Date.now();
  const v = visitas.get(ip);
  if (!v || ahora > v.reinicio) {
    visitas.set(ip, { n: 1, reinicio: ahora + 60_000 });
    if (visitas.size > 5000) for (const [k, x] of visitas) if (ahora > x.reinicio) visitas.delete(k);
    return true;
  }
  v.n++;
  return v.n <= maxPorMinuto;
}
