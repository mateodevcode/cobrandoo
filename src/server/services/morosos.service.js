import "server-only";
import { query } from "../db";
import { filtroVisible } from "../permisos";
import { destinatariosArriba } from "../jerarquia";
import { ponerAlDia, procesarPendientes } from "./prestamos.service";
import { notificar } from "./notificaciones.service";
import { dinero } from "@/lib/formato";

// Moroso: préstamo diario con 3 o más días de atraso; semanal, quincenal, mensual o sin cuotas
// (interés mensual), con al menos una cuota o un periodo vencido sin pagar.
const ES_MOROSO = `p.dias_atraso >= CASE WHEN p.frecuencia = 'diaria' THEN 3 ELSE 1 END`;
const ENTRO_HOY = `p.dias_atraso = CASE WHEN p.frecuencia = 'diaria' THEN 3 ELSE 1 END`;

/** Nivel de riesgo por días de atraso. */
export function nivel(dias) {
  if (dias >= 30) return "grave";
  if (dias >= 8) return "medio";
  return "leve";
}

/** Clientes en mora que `yo` puede ver, ordenados de mayor a menor riesgo. */
export async function listar(yo) {
  await ponerAlDia(yo);
  const params = [];
  const filtro = await filtroVisible(yo, "p.cobrador_id", "p.organizacion_id", params);
  const { rows } = await query(
    `SELECT c.id, c.nombre, c.telefono, c.barrio, c.direccion, c.latitud::float8 AS latitud, c.longitud::float8 AS longitud,
            u.id AS cobrador_id, u.nombre AS cobrador_nombre, r.nombre AS ruta_nombre,
            max(p.dias_atraso)::int AS dias_atraso,
            sum(p.atraso)::bigint AS atraso,
            sum(p.saldo)::bigint AS saldo,
            count(*)::int AS prestamos,
            (SELECT max(pg.fecha) FROM pagos pg
              WHERE pg.cliente_id = c.id AND pg.anulado_en IS NULL AND pg.metodo <> 'renovacion')::text AS ultimo_pago
       FROM prestamos p
       JOIN clientes c ON c.id = p.cliente_id
       JOIN usuarios u ON u.id = p.cobrador_id
       LEFT JOIN rutas r ON r.id = c.ruta_id
      WHERE ${filtro} AND p.estado = 'activo' AND ${ES_MOROSO}
      GROUP BY c.id, u.id, r.nombre
      ORDER BY max(p.dias_atraso) DESC, sum(p.atraso) DESC
      LIMIT 500`,
    params
  );
  return rows.map((m) => ({ ...m, nivel: nivel(m.dias_atraso) }));
}

/** Cuántos clientes en mora tiene `yo` a la vista (para insignias en el menú o el inicio). */
export async function contar(yo) {
  const params = [];
  const filtro = await filtroVisible(yo, "p.cobrador_id", "p.organizacion_id", params);
  const { rows } = await query(
    `SELECT count(DISTINCT p.cliente_id)::int AS n FROM prestamos p WHERE ${filtro} AND p.estado = 'activo' AND ${ES_MOROSO}`,
    params
  );
  return rows[0].n;
}

/**
 * Aviso de la mañana (cron): a cada cobrador con clientes que ENTRARON hoy en mora, y a sus jefes.
 * Solo avisa de los nuevos, para no repetir lo mismo cada día.
 */
export async function avisarNuevos() {
  for (let n = 1; n > 0; ) n = await procesarPendientes({ limite: 500 });
  const { rows } = await query(
    `SELECT p.organizacion_id, p.cobrador_id, u.nombre AS cobrador_nombre,
            count(DISTINCT p.cliente_id) FILTER (WHERE ${ENTRO_HOY})::int AS nuevos,
            count(DISTINCT p.cliente_id)::int AS total,
            sum(p.atraso)::bigint AS atraso,
            (array_agg(c.nombre ORDER BY p.atraso DESC) FILTER (WHERE ${ENTRO_HOY}))[1:3] AS nombres
       FROM prestamos p
       JOIN usuarios u ON u.id = p.cobrador_id AND u.estado = 'activo' AND u.eliminado_en IS NULL
       JOIN clientes c ON c.id = p.cliente_id
      WHERE p.estado = 'activo' AND ${ES_MOROSO}
      GROUP BY p.organizacion_id, p.cobrador_id, u.nombre
     HAVING count(*) FILTER (WHERE ${ENTRO_HOY}) > 0`
  );
  for (const r of rows) {
    const quienes = r.nombres.filter(Boolean).join(", ") + (r.nuevos > 3 ? ` y ${r.nuevos - 3} más` : "");
    await notificar({
      organizacionId: r.organizacion_id,
      usuarioIds: [r.cobrador_id],
      tipo: "morosos.nuevos",
      titulo: r.nuevos === 1 ? "Un cliente entró en mora" : `${r.nuevos} clientes entraron en mora`,
      cuerpo: `${quienes}. En total tienes ${r.total} en mora (${dinero(r.atraso)} atrasados).`,
      url: "/morosos",
    });
    await notificar({
      organizacionId: r.organizacion_id,
      usuarioIds: await destinatariosArriba(r.cobrador_id),
      tipo: "morosos.nuevos",
      titulo: `${r.cobrador_nombre}: ${r.nuevos} cliente${r.nuevos === 1 ? "" : "s"} nuevo${r.nuevos === 1 ? "" : "s"} en mora`,
      cuerpo: `${quienes}. Lleva ${r.total} en mora (${dinero(r.atraso)} atrasados).`,
      url: "/morosos",
    });
  }
  return { cobradores: rows.length, nuevos: rows.reduce((s, r) => s + r.nuevos, 0) };
}
