// Motor de préstamos: a partir de las condiciones del préstamo y los pagos válidos,
// reconstruye día por día todos los cargos (capital, intereses, recargos) y cómo se aplicó cada pago.
// Es una función pura y determinista: misma entrada → mismo resultado. Por eso, si se anula un pago,
// basta con volver a simular y todo (intereses, recargos, saldos) queda corregido.
import { sumarDias, diasEntre } from "../fechas.js";
import { DIAS_PERIODO, BASES_INTERES } from "./constantes.js";
import { METODOS, interesDe } from "./metodos.js";

const NOMBRE_BASE = Object.fromEntries(BASES_INTERES.map((b) => [b.id, b.nombre.toLowerCase()]));

/**
 * @param {object} p
 * @param {object} p.prestamo  { metodo, capital, tasa, base_interes, fecha_inicio, n_cuotas, frecuencia, recargo_tipo, recargo_valor }
 * @param {Array}  p.pagos     pagos NO anulados: { id, monto, fecha, orden }  (orden = desempate dentro del día)
 * @param {string} p.hasta     fecha "YYYY-MM-DD" hasta la que se calcula (normalmente hoy)
 */
export function simular({ prestamo, pagos = [], hasta }) {
  const metodo = METODOS[prestamo.metodo];
  if (!metodo) throw new Error(`Método desconocido: ${prestamo.metodo}`);
  const tasa = Number(prestamo.tasa);
  const plan = metodo.generar({ ...prestamo, tasa });
  const { cuotas } = plan;

  const saldos = { capital: 0, interes: 0, recargo: 0 };
  const cargos = [];
  const aplicaciones = {};
  const total = () => saldos.capital + saldos.interes + saldos.recargo;
  const agregar = (c) => {
    cargos.push(c);
    saldos[c.tipo] += c.monto;
  };

  // Pagos agrupados por día, en orden de registro
  const pagosPorDia = new Map();
  for (const p of [...pagos].sort((a, b) => (a.fecha === b.fecha ? cmp(a.orden, b.orden) : a.fecha < b.fecha ? -1 : 1))) {
    if (!pagosPorDia.has(p.fecha)) pagosPorDia.set(p.fecha, []);
    pagosPorDia.get(p.fecha).push(p);
  }
  const ultimoPago = pagos.reduce((m, p) => (p.fecha > m ? p.fecha : m), prestamo.fecha_inicio);
  const fin = [hasta, ultimoPago].reduce((a, b) => (b > a ? b : a), prestamo.fecha_inicio);

  const recargo = prestamo.recargo_tipo ?? "ninguno";
  const valorRecargo = Number(prestamo.recargo_valor ?? 0);
  let proximoCorte = plan.proximo_corte;
  let aplicadoCI = 0; // pagado a capital + interés (lo que cubre cuotas)
  let sobrante = 0;
  let esperado = 0; // suma de cuotas con fecha <= día
  let idxCuota = 0;
  let fechaPagado = null;

  for (let d = prestamo.fecha_inicio; d <= fin; d = sumarDias(d, 1)) {
    // 1) Cargos iniciales
    if (d === prestamo.fecha_inicio) plan.cargos.forEach(agregar);

    // 2) Corte de interés (al empezar el día, con el saldo que traía)
    if (proximoCorte && d === proximoCorte) {
      if (total() > 0) {
        const base =
          prestamo.base_interes === "capital_original" ? prestamo.capital
          : prestamo.base_interes === "capital_pendiente" ? saldos.capital
          : total();
        const monto = interesDe(base, tasa);
        if (monto > 0) {
          agregar({ tipo: "interes", monto, fecha: d, clave: `interes:${d}`, descripcion: `Interés ${tasa} % ${NOMBRE_BASE[prestamo.base_interes] ?? ""}`.trim() });
        }
      }
      proximoCorte = sumarDias(proximoCorte, DIAS_PERIODO);
    }

    // 3) Pagos del día: recargos → intereses → capital
    for (const p of pagosPorDia.get(d) ?? []) {
      let resto = p.monto;
      const a = { recargo: 0, interes: 0, capital: 0, sobrante: 0 };
      for (const tipo of ["recargo", "interes", "capital"]) {
        a[tipo] = Math.min(resto, saldos[tipo]);
        saldos[tipo] -= a[tipo];
        resto -= a[tipo];
      }
      a.sobrante = resto;
      sobrante += resto;
      aplicadoCI += a.interes + a.capital;
      aplicaciones[p.id] = a;
    }

    // 4) Cuotas del día y recargos por mora. El recargo de un día solo se cobra cuando ese día
    //    ya terminó (d < hasta): mientras sea "hoy", el cliente todavía puede pagar.
    const diaCerrado = d < hasta;
    while (idxCuota < cuotas.length && cuotas[idxCuota].fecha <= d) {
      const c = cuotas[idxCuota];
      esperado += c.monto;
      if (recargo === "porcentaje_cuota" && diaCerrado && c.fecha === d && esperado > aplicadoCI && total() > 0) {
        const monto = Math.round((c.monto * valorRecargo) / 100);
        if (monto > 0) agregar({ tipo: "recargo", monto, fecha: d, clave: `recargo:cuota:${c.numero}`, descripcion: `Recargo cuota ${c.numero} no pagada` });
      }
      idxCuota++;
    }
    if (recargo === "fijo_diario" && diaCerrado && cuotas.length && d <= plan.fecha_vencimiento && esperado > aplicadoCI && total() > 0) {
      const monto = Math.round(valorRecargo);
      if (monto > 0) agregar({ tipo: "recargo", monto, fecha: d, clave: `recargo:${d}`, descripcion: "Recargo por día de atraso" });
    }

    // 5) ¿Terminó de pagar?
    if (total() === 0) {
      fechaPagado = d;
      break;
    }
  }

  // ===== Situación a la fecha `hasta` =====
  const vencidas = cuotas.filter((c) => c.fecha < hasta);
  const esperadoVencido = vencidas.reduce((s, c) => s + c.monto, 0);
  const vencido = plan.fecha_vencimiento && hasta > plan.fecha_vencimiento;
  let atraso = 0;
  let diasAtraso = 0;
  if (!fechaPagado && cuotas.length) {
    atraso = vencido ? total() : Math.max(0, Math.min(total(), esperadoVencido - aplicadoCI + saldos.recargo));
    // Primera cuota no cubierta
    let acum = 0;
    const primeraSinCubrir = cuotas.find((c) => (acum += c.monto) > aplicadoCI);
    if (primeraSinCubrir && primeraSinCubrir.fecha < hasta) diasAtraso = diasEntre(primeraSinCubrir.fecha, hasta);
  }
  if (!fechaPagado && !cuotas.length) {
    // Interés mensual: "en mora" si ya pasó al menos un corte sin terminar de pagar
    const cortes = cargos.filter((c) => c.tipo === "interes" && c.clave !== "interes:inicio").length;
    if (cortes > 0) diasAtraso = diasEntre(sumarDias(prestamo.fecha_inicio, DIAS_PERIODO), hasta);
  }

  let acum = 0;
  const cuotasCubiertas = cuotas.filter((c) => (acum += c.monto) <= aplicadoCI).length;
  const cuotaHoy = cuotas.find((c) => c.fecha === hasta)?.monto ?? 0;
  // Lo que falta para quedar al día hoy (cuotas hasta hoy inclusive + recargos), sin pasar del saldo
  const esperadoHoy = cuotas.filter((c) => c.fecha <= hasta).reduce((s, c) => s + c.monto, 0);
  const sugeridoHoy = fechaPagado
    ? 0
    : vencido
      ? total()
      : cuotas.length
        ? Math.min(total(), Math.max(0, esperadoHoy - aplicadoCI) + saldos.recargo)
        : 0;

  return {
    plan,
    cargos,
    aplicaciones,
    saldos: { ...saldos },
    saldo: total(),
    totalCargado: cargos.reduce((s, c) => s + c.monto, 0),
    totalPagado: pagos.reduce((s, p) => s + p.monto, 0),
    sobrante,
    estado: fechaPagado ? "pagado" : "activo",
    fechaPagado,
    proximoCorte: fechaPagado ? null : proximoCorte,
    atraso,
    diasAtraso,
    cuotaHoy,
    cuotasCubiertas,
    /** Lo que falta para quedar al día hoy (atrasado + cuota de hoy si no la ha pagado) */
    sugeridoHoy,
  };
}

const cmp = (a, b) => (a === b ? 0 : (a ?? "") < (b ?? "") ? -1 : 1);
