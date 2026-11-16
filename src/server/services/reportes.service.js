import "server-only";
import { query } from "../db";
import { filtroVisible } from "../permisos";
import { hoyBogota, sumarDias } from "@/lib/fechas";
import { ponerAlDia } from "./prestamos.service";

/** Re-numera $1, $2… de un fragmento SQL para unirlo después de otros parámetros. */
const desplazar = (sql, n) => sql.replaceAll(/\$(\d+)/g, (_, i) => `$${Number(i) + n}`);

/**
 * Reporte para dueños y supervisores sobre lo que pueden ver.
 * @param {number} dias  período hacia atrás (7, 30, 90…)
 */
export async function reporte(yo, dias = 30) {
  await ponerAlDia(yo);
  const hoy = hoyBogota();
  const desde = sumarDias(hoy, -(dias - 1));

  const pP = [];
  const fP = await filtroVisible(yo, "p.cobrador_id", "p.organizacion_id", pP);
  const pG = [];
  const fG = await filtroVisible(yo, "pg.cobrador_id", "pg.organizacion_id", pG);
  const pU = [];
  const fU = await filtroVisible(yo, "u.id", "u.organizacion_id", pU);

  const [periodo, prestado, serie, cartera, personas, gastos] = await Promise.all([
    // Cobros del período y lo que fue ganancia (intereses + recargos cobrados)
    query(
      `SELECT COALESCE(sum(pg.monto), 0)::bigint AS cobrado,
              COALESCE(sum(pg.aplicado_interes + pg.aplicado_recargo), 0)::bigint AS ganancia_cobrada,
              count(*)::int AS abonos
         FROM pagos pg
        WHERE ${fG} AND pg.anulado_en IS NULL AND pg.fecha BETWEEN $${pG.length + 1} AND $${pG.length + 2}`,
      [...pG, desde, hoy]
    ),
    // Préstamos nuevos del período (lo que salió de caja y el interés descontado al entregar)
    query(
      `SELECT COALESCE(sum(p.monto_entregado), 0)::bigint AS entregado,
              COALESCE(sum(p.capital - p.monto_entregado), 0)::bigint AS descontado,
              count(*)::int AS prestamos,
              count(DISTINCT p.cliente_id)::int AS clientes
         FROM prestamos p
        WHERE ${fP} AND p.estado <> 'anulado' AND p.fecha_inicio BETWEEN $${pP.length + 1} AND $${pP.length + 2}`,
      [...pP, desde, hoy]
    ),
    // Cobrado y prestado por día
    query(
      `SELECT d::date::text AS fecha,
              COALESCE((SELECT sum(pg.monto) FROM pagos pg WHERE ${fG} AND pg.anulado_en IS NULL AND pg.fecha = d::date), 0)::bigint AS cobrado,
              COALESCE((SELECT sum(p.monto_entregado) FROM prestamos p WHERE ${desplazar(fP, pG.length)} AND p.estado <> 'anulado' AND p.fecha_inicio = d::date), 0)::bigint AS prestado
         FROM generate_series($${pG.length + pP.length + 1}::date, $${pG.length + pP.length + 2}::date, interval '1 day') d
        ORDER BY d`,
      [...pG, ...pP, desde, hoy]
    ),
    // Cartera actual
    query(
      `SELECT COALESCE(sum(p.saldo), 0)::bigint AS saldo,
              COALESCE(sum(p.saldo_capital), 0)::bigint AS capital,
              COALESCE(sum(p.saldo_interes + p.saldo_recargo), 0)::bigint AS intereses,
              COALESCE(sum(p.saldo) FILTER (WHERE p.dias_atraso > 0), 0)::bigint AS en_mora,
              count(*)::int AS prestamos,
              count(*) FILTER (WHERE p.dias_atraso > 0)::int AS prestamos_mora,
              count(DISTINCT p.cliente_id)::int AS clientes
         FROM prestamos p WHERE ${fP} AND p.estado = 'activo'`,
      pP
    ),
    // Cómo está repartido el dinero: efectivo y digital en manos de cada persona + capital prestado por cobrador
    query(
      `SELECT u.id, u.nombre, u.rol,
              COALESCE((SELECT sum(m.monto) FROM movimientos_caja m WHERE m.usuario_id = u.id AND m.metodo = 'efectivo'), 0)::bigint AS efectivo,
              COALESCE((SELECT sum(m.monto) FROM movimientos_caja m WHERE m.usuario_id = u.id AND m.metodo <> 'efectivo'), 0)::bigint AS digital,
              COALESCE((SELECT sum(p.saldo_capital) FROM prestamos p WHERE p.cobrador_id = u.id AND p.estado = 'activo'), 0)::bigint AS capital_prestado,
              COALESCE((SELECT sum(p.saldo) FROM prestamos p WHERE p.cobrador_id = u.id AND p.estado = 'activo'), 0)::bigint AS cartera,
              COALESCE((SELECT sum(p.saldo) FROM prestamos p WHERE p.cobrador_id = u.id AND p.estado = 'activo' AND p.dias_atraso > 0), 0)::bigint AS en_mora,
              COALESCE((SELECT sum(pg.monto) FROM pagos pg WHERE pg.cobrador_id = u.id AND pg.anulado_en IS NULL AND pg.fecha BETWEEN $${pU.length + 1} AND $${pU.length + 2}), 0)::bigint AS cobrado,
              COALESCE((SELECT sum(p.monto_entregado) FROM prestamos p WHERE p.creado_por = u.id AND p.estado <> 'anulado' AND p.fecha_inicio BETWEEN $${pU.length + 1} AND $${pU.length + 2}), 0)::bigint AS prestado,
              (SELECT count(*) FROM cierres c WHERE c.usuario_id = u.id AND c.estado = 'con_fallo')::int AS fallos
         FROM usuarios u
        WHERE ${fU} AND u.estado = 'activo'
        ORDER BY array_position(ARRAY['dueno','supervisor','cobrador'], u.rol), u.nombre`,
      [...pU, desde, hoy]
    ),
    // Gastos del período
    query(
      `SELECT COALESCE(-sum(m.monto), 0)::bigint AS total
         FROM movimientos_caja m JOIN usuarios u ON u.id = m.usuario_id JOIN jornadas j ON j.id = m.jornada_id
        WHERE ${fU} AND m.tipo = 'gasto' AND j.fecha BETWEEN $${pU.length + 1} AND $${pU.length + 2}`,
      [...pU, desde, hoy]
    ),
  ]);

  const c = cartera.rows[0];
  const gente = personas.rows;
  const efectivo = gente.reduce((s, u) => s + u.efectivo, 0);
  const digital = gente.reduce((s, u) => s + u.digital, 0);
  const pe = periodo.rows[0];
  const pr = prestado.rows[0];

  return {
    dias,
    desde,
    hoy,
    periodo: {
      cobrado: pe.cobrado,
      abonos: pe.abonos,
      prestado: pr.entregado,
      prestamos: pr.prestamos,
      clientesNuevos: pr.clientes,
      // Ganancia del período: intereses y recargos cobrados + interés descontado al entregar
      ganancia: pe.ganancia_cobrada + pr.descontado,
      gastos: gastos.rows[0].total,
    },
    serie: serie.rows,
    cartera: {
      ...c,
      porcentajeMora: c.saldo ? Math.round((c.en_mora / c.saldo) * 1000) / 10 : 0,
    },
    dinero: {
      efectivo,
      digital,
      capitalPrestado: c.capital,
      total: efectivo + digital + c.capital,
    },
    personas: gente,
  };
}
