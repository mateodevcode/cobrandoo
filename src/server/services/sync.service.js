import "server-only";
import { query } from "../db";
import { filtroVisible } from "../permisos";
import { hoyBogota } from "@/lib/fechas";
import { ponerAlDia } from "./prestamos.service";
import { cobradoresDisponibles } from "./clientes.service";

export const VERSION_DATOS = 1;
const LIMITE = 5000;

/**
 * Todo lo que el teléfono necesita para trabajar sin internet: clientes, rutas, préstamos activos
 * con sus condiciones y pagos (para recalcular saldos con el mismo motor), y la caja de hoy.
 */
export async function datosOffline(yo) {
  await ponerAlDia(yo);
  const hoy = hoyBogota();

  const pC = [];
  const fC = await filtroVisible(yo, "c.cobrador_id", "c.organizacion_id", pC);
  const pP = [];
  const fP = await filtroVisible(yo, "p.cobrador_id", "p.organizacion_id", pP);
  const pR = [];
  const fR = await filtroVisible(yo, "r.cobrador_id", "r.organizacion_id", pR);

  const [cobradores, rutas, clientes, prestamos, caja] = await Promise.all([
    cobradoresDisponibles(yo),
    query(`SELECT r.id, r.nombre, r.orden, r.cobrador_id FROM rutas r WHERE ${fR} AND r.activa ORDER BY r.orden, r.nombre`, pR),
    query(
      `SELECT c.id, c.cobrador_id, c.ruta_id, c.orden_ruta, c.nombre, c.cedula, c.telefono, c.direccion, c.barrio, c.ciudad, c.estado
         FROM clientes c WHERE ${fC} AND c.estado = 'activo' ORDER BY c.nombre LIMIT ${LIMITE}`,
      pC
    ),
    query(
      `SELECT p.id, p.cliente_id, p.cobrador_id, p.metodo, p.capital, p.tasa, p.base_interes, p.frecuencia, p.n_cuotas,
              p.valor_cuota, p.recargo_tipo, p.recargo_valor, p.fecha_inicio, p.fecha_vencimiento, p.metodo_desembolso,
              p.estado, p.creado_en
         FROM prestamos p WHERE ${fP} AND p.estado = 'activo' ORDER BY p.creado_en LIMIT ${LIMITE}`,
      pP
    ),
    query(
      `SELECT m.id, m.tipo, m.metodo, m.monto, m.categoria, m.descripcion, m.ref_tipo, m.ref_id, m.creado_en,
              cl.nombre AS cliente_nombre
         FROM movimientos_caja m
         JOIN jornadas j ON j.id = m.jornada_id
         LEFT JOIN pagos pg ON m.ref_tipo = 'pago' AND pg.id = m.ref_id
         LEFT JOIN prestamos pr ON m.ref_tipo = 'prestamo' AND pr.id = m.ref_id
         LEFT JOIN clientes cl ON cl.id = COALESCE(pg.cliente_id, pr.cliente_id)
        WHERE j.usuario_id = $1 AND j.fecha = $2
        ORDER BY m.creado_en DESC`,
      [yo.id, hoy]
    ),
  ]);

  const idsPrestamos = prestamos.rows.map((p) => p.id);
  const pagos = idsPrestamos.length
    ? (
        await query(
          `SELECT id, prestamo_id, cliente_id, cobrador_id, monto, metodo, fecha, creado_en
             FROM pagos WHERE prestamo_id = ANY($1::uuid[]) AND anulado_en IS NULL
            ORDER BY fecha, creado_en`,
          [idsPrestamos]
        )
      ).rows
    : [];

  return {
    version: VERSION_DATOS,
    usuario: { id: yo.id, nombre: yo.nombre, rol: yo.rol, org: yo.org },
    hoy,
    generado_en: new Date().toISOString(),
    cobradores,
    rutas: rutas.rows,
    clientes: clientes.rows,
    prestamos: prestamos.rows,
    pagos,
    caja: { fecha: hoy, movimientos: caja.rows },
  };
}
