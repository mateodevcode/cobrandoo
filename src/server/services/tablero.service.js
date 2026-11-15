import "server-only";
import { query } from "../db";
import { filtroVisible, exigirVisible } from "../permisos";
import { hoyBogota, sumarDias, inicioSemana } from "@/lib/fechas";
import { ponerAlDia } from "./prestamos.service";

/** Números del inicio para `yo` (su cartera, la de su equipo o la de toda la organización). */
export async function resumen(yo) {
  await ponerAlDia(yo);
  const hoy = hoyBogota();
  const desde7 = sumarDias(hoy, -6);
  const lunes = inicioSemana(hoy);

  const pP = [];
  const fP = await filtroVisible(yo, "p.cobrador_id", "p.organizacion_id", pP);
  const pG = [];
  const fG = await filtroVisible(yo, "pg.cobrador_id", "pg.organizacion_id", pG);

  const [cartera, cobros, prestado, recientes] = await Promise.all([
    query(
      `SELECT COALESCE(sum(p.saldo), 0)::bigint AS cartera,
              COALESCE(sum(p.sugerido_hoy), 0)::bigint AS pendiente_hoy,
              count(*) FILTER (WHERE p.dias_atraso > 0)::int AS prestamos_mora,
              count(DISTINCT p.cliente_id) FILTER (WHERE p.dias_atraso > 0)::int AS clientes_mora,
              count(*)::int AS prestamos_activos
         FROM prestamos p WHERE ${fP} AND p.estado = 'activo'`,
      pP
    ),
    query(
      `SELECT pg.fecha, sum(pg.monto)::bigint AS total
         FROM pagos pg
        WHERE ${fG} AND pg.anulado_en IS NULL AND pg.fecha BETWEEN $${pG.length + 1} AND $${pG.length + 2}
        GROUP BY pg.fecha`,
      [...pG, lunes < desde7 ? lunes : desde7, hoy]
    ),
    query(
      `SELECT COALESCE(sum(p.capital), 0)::bigint AS total FROM prestamos p
        WHERE ${fP} AND p.estado <> 'anulado' AND p.fecha_inicio >= $${pP.length + 1}`,
      [...pP, lunes]
    ),
    query(
      `SELECT * FROM (
         SELECT 'pago' AS tipo, pg.id, pg.monto, pg.metodo, pg.creado_en, c.nombre AS cliente_nombre, c.id AS cliente_id,
                pg.prestamo_id, (pg.anulado_en IS NOT NULL) AS anulado
           FROM pagos pg JOIN clientes c ON c.id = pg.cliente_id
          WHERE ${fG}
         UNION ALL
         SELECT 'prestamo', p.id, p.capital, p.metodo_desembolso, p.creado_en, c.nombre, c.id, p.id, (p.estado = 'anulado')
           FROM prestamos p JOIN clientes c ON c.id = p.cliente_id
          WHERE ${fP.replaceAll(/\$(\d+)/g, (_, n) => `$${Number(n) + pG.length}`)}
       ) x ORDER BY creado_en DESC LIMIT 8`,
      [...pG, ...pP]
    ),
  ]);

  const porDia = Object.fromEntries(cobros.rows.map((r) => [r.fecha, r.total]));
  const serie = Array.from({ length: 7 }, (_, i) => {
    const fecha = sumarDias(desde7, i);
    return { fecha, total: porDia[fecha] ?? 0 };
  });
  const cobradoHoy = porDia[hoy] ?? 0;
  const cobradoSemana = Object.entries(porDia).filter(([f]) => f >= lunes).reduce((s, [, t]) => s + t, 0);
  const c = cartera.rows[0];

  return {
    hoy,
    cobradoHoy,
    metaHoy: cobradoHoy + c.pendiente_hoy,
    pendienteHoy: c.pendiente_hoy,
    cobradoSemana,
    prestadoSemana: prestado.rows[0].total,
    cartera: c.cartera,
    prestamosActivos: c.prestamos_activos,
    clientesMora: c.clientes_mora,
    serie,
    recientes: recientes.rows,
  };
}

/**
 * Ruta del día de un cobrador: sus clientes activos con préstamos activos, en orden de visita,
 * con lo que debe pagar hoy y lo que ya pagó hoy.
 */
export async function rutaDelDia(yo, cobradorId = yo.id) {
  if (cobradorId !== yo.id) await exigirVisible(yo, cobradorId);
  await ponerAlDia(yo);
  const hoy = hoyBogota();
  const { rows } = await query(
    `SELECT c.id AS cliente_id, c.nombre, c.telefono, c.direccion, c.barrio, c.ruta_id, c.orden_ruta,
            r.nombre AS ruta_nombre, r.orden AS ruta_orden,
            json_agg(json_build_object(
              'id', p.id, 'metodo', p.metodo, 'saldo', p.saldo, 'sugerido_hoy', p.sugerido_hoy,
              'dias_atraso', p.dias_atraso, 'valor_cuota', p.valor_cuota, 'saldo_interes', p.saldo_interes
            ) ORDER BY p.creado_en) AS prestamos,
            COALESCE((SELECT sum(pg.monto) FROM pagos pg
                       WHERE pg.cliente_id = c.id AND pg.fecha = $2 AND pg.anulado_en IS NULL), 0)::bigint AS pagado_hoy
       FROM clientes c
       JOIN prestamos p ON p.cliente_id = c.id AND p.estado = 'activo'
       LEFT JOIN rutas r ON r.id = c.ruta_id
      WHERE c.cobrador_id = $1 AND c.estado = 'activo'
      GROUP BY c.id, r.id
      ORDER BY r.orden NULLS LAST, r.nombre, c.orden_ruta, c.nombre`,
    [cobradorId, hoy]
  );
  return rows.map((r) => ({
    ...r,
    saldo: r.prestamos.reduce((s, p) => s + Number(p.saldo), 0),
    sugerido_hoy: r.prestamos.reduce((s, p) => s + Number(p.sugerido_hoy), 0),
    dias_atraso: Math.max(...r.prestamos.map((p) => p.dias_atraso)),
  }));
}
