// Métodos de préstamo. Cada uno es un objeto con la misma forma; para agregar uno nuevo
// basta con sumarlo a METODOS (y a la lista del CHECK de la tabla prestamos).
import { sumarDias } from "../fechas.js";
import { DIAS_FRECUENCIA, DIAS_PERIODO } from "./constantes.js";
import { dinero } from "../formato.js";

/** Redondea hacia arriba al mil más cercano. */
export const redondearMil = (n) => Math.ceil(n / 1000) * 1000;

/** % de una base, en pesos enteros. */
export const interesDe = (base, tasa) => Math.round((base * tasa) / 100);

/**
 * Reparte `total` en `n` cuotas redondeadas a miles; la última ajusta para que el total cuadre exacto.
 * @returns {{ valorCuota: number, montos: number[] }}
 */
export function planCuotas(total, n) {
  if (n <= 1) return { valorCuota: total, montos: [total] };
  let valor = redondearMil(total / n);
  if (total - valor * (n - 1) <= 0) valor = Math.max(1000, Math.floor(total / n / 1000) * 1000);
  if (total - valor * (n - 1) <= 0) valor = Math.floor(total / n); // montos muy pequeños
  const ultima = total - valor * (n - 1);
  return { valorCuota: valor, montos: [...Array(n - 1).fill(valor), ultima] };
}

export const METODOS = {
  interes_mensual: {
    id: "interes_mensual",
    nombre: "Interés mensual acumulado",
    resumen: "Debe el capital más el % desde el primer día. Cada 30 días que siga debiendo, se le suma otra vez el %.",
    usaCuotas: false,
    usaRecargo: false,
    explicacion: [
      "Al prestar, el cliente queda debiendo el capital más el interés del primer mes.",
      "No tiene cuotas fijas: abona lo que pueda, cuando pueda.",
      "Cada 30 días, si todavía debe algo, se le suma de nuevo el % sobre la base que elijas (lo que debe hoy, el capital que falta o el préstamo original).",
      "Cada abono paga primero recargos, luego intereses y al final capital.",
    ],
    ejemplo: "Presta $1.000.000 al 10 %: debe $1.100.000. Si al mes no ha terminado de pagar, se le suma otro 10 % y así cada mes.",

    generar({ capital, tasa, fecha_inicio }) {
      const interes = interesDe(capital, tasa);
      return {
        cargos: cargosIniciales(capital, interes, tasa, fecha_inicio),
        cuotas: [],
        valor_cuota: null,
        fecha_vencimiento: null,
        proximo_corte: sumarDias(fecha_inicio, DIAS_PERIODO),
        total_inicial: capital + interes,
        entregado: capital,
      };
    },
  },

  cuotas_fijas: {
    id: "cuotas_fijas",
    nombre: "Cuotas fijas (gota a gota)",
    resumen: "Debe el capital más el % repartido en N cuotas. Si no termina en el plazo, empieza a sumar interés mensual.",
    usaCuotas: true,
    usaRecargo: true,
    explicacion: [
      "Al prestar, el total (capital + %) se reparte en cuotas iguales, redondeadas a miles. La última cuota ajusta para que el total cuadre exacto.",
      "Las cuotas diarias cuentan todos los días, incluidos domingos y festivos.",
      "Si se atrasa, puede generarse un recargo por mora (opcional): un valor fijo por día de atraso o un % de cada cuota atrasada.",
      "Si se acaba el plazo y todavía debe, al día siguiente se le suma el % sobre la base elegida, y de ahí cada 30 días mientras siga debiendo.",
      "Cada abono paga primero recargos, luego intereses y al final capital.",
    ],
    ejemplo: "Presta $1.000.000 al 10 % en 30 cuotas diarias: debe $1.100.000, cuotas de $37.000 (la última de $27.000).",

    generar({ capital, tasa, fecha_inicio, n_cuotas, frecuencia }) {
      const interes = interesDe(capital, tasa);
      const total = capital + interes;
      const paso = DIAS_FRECUENCIA[frecuencia];
      const { valorCuota, montos } = planCuotas(total, n_cuotas);
      const cuotas = montos.map((monto, i) => ({ numero: i + 1, fecha: sumarDias(fecha_inicio, paso * (i + 1)), monto }));
      const fecha_vencimiento = cuotas.at(-1).fecha;
      return {
        cargos: cargosIniciales(capital, interes, tasa, fecha_inicio),
        cuotas,
        valor_cuota: valorCuota,
        fecha_vencimiento,
        proximo_corte: sumarDias(fecha_vencimiento, 1),
        total_inicial: total,
        entregado: capital,
      };
    },
  },

  solo_interes: {
    id: "solo_interes",
    nombre: "Solo interés",
    resumen: "En cada cuota paga solo el interés del período; el capital completo se devuelve en la última.",
    usaCuotas: true,
    usaRecargo: true,
    explicacion: [
      "Cada período (por ejemplo cada mes) el cliente paga solo el % de interés sobre el capital.",
      "En la última cuota devuelve el capital completo junto con el último interés.",
      "Sirve para clientes que quieren el dinero por más tiempo y pueden pagar el interés con regularidad.",
      "Si se acaba el plazo y todavía debe, se le suma el % sobre la base elegida cada 30 días.",
      "Cada abono paga primero recargos, luego intereses y al final capital.",
    ],
    ejemplo: "Presta $1.000.000 al 10 % mensual por 3 meses: paga $100.000 el mes 1, $100.000 el mes 2 y $1.100.000 el mes 3.",

    generar({ capital, tasa, fecha_inicio, n_cuotas, frecuencia }) {
      const interesPeriodo = interesDe(capital, tasa);
      const interesTotal = interesPeriodo * n_cuotas;
      const paso = DIAS_FRECUENCIA[frecuencia];
      const cuotas = Array.from({ length: n_cuotas }, (_, i) => ({
        numero: i + 1,
        fecha: sumarDias(fecha_inicio, paso * (i + 1)),
        monto: interesPeriodo + (i === n_cuotas - 1 ? capital : 0),
      })).filter((c) => c.monto > 0);
      const fecha_vencimiento = cuotas.at(-1).fecha;
      const cargos = [{ tipo: "capital", monto: capital, fecha: fecha_inicio, clave: "capital", descripcion: "Capital prestado" }];
      if (interesTotal > 0) {
        cargos.push({ tipo: "interes", monto: interesTotal, fecha: fecha_inicio, clave: "interes:inicio", descripcion: `Interés ${tasa} % × ${n_cuotas} período(s)` });
      }
      return {
        cargos,
        cuotas,
        valor_cuota: interesPeriodo || capital,
        fecha_vencimiento,
        proximo_corte: sumarDias(fecha_vencimiento, 1),
        total_inicial: capital + interesTotal,
        entregado: capital,
      };
    },
  },

  descuento_anticipado: {
    id: "descuento_anticipado",
    nombre: "Interés descontado al entregar",
    resumen: "El interés se descuenta del dinero que se entrega; el cliente devuelve el monto completo en N cuotas.",
    usaCuotas: true,
    usaRecargo: true,
    explicacion: [
      "Al prestar, el interés se queda en caja: el cliente recibe el monto menos el %.",
      "El cliente devuelve el monto completo repartido en cuotas iguales, redondeadas a miles.",
      "Como el interés ya se cobró al entregar, cada abono va directo al capital (después de recargos).",
      "Si se acaba el plazo y todavía debe, se le suma el % sobre la base elegida cada 30 días.",
    ],
    ejemplo: "Presta $1.000.000 al 10 % en 20 cuotas diarias: se le entregan $900.000 y paga 20 cuotas de $50.000.",

    generar({ capital, tasa, fecha_inicio, n_cuotas, frecuencia }) {
      const descuento = Math.min(capital, interesDe(capital, tasa));
      const paso = DIAS_FRECUENCIA[frecuencia];
      const { valorCuota, montos } = planCuotas(capital, n_cuotas);
      const cuotas = montos.map((monto, i) => ({ numero: i + 1, fecha: sumarDias(fecha_inicio, paso * (i + 1)), monto }));
      const fecha_vencimiento = cuotas.at(-1).fecha;
      return {
        cargos: [{ tipo: "capital", monto: capital, fecha: fecha_inicio, clave: "capital", descripcion: `Capital (se entregaron ${dinero(capital - descuento)}; ${dinero(descuento)} de interés descontado)` }],
        cuotas,
        valor_cuota: valorCuota,
        fecha_vencimiento,
        proximo_corte: sumarDias(fecha_vencimiento, 1),
        total_inicial: capital,
        entregado: capital - descuento,
        descuento,
      };
    },
  },
};

/** Atajos comunes: llenan el formulario con un clic (se pueden ajustar después). */
export const PRESETS = [
  { id: "d20-24", nombre: "Diario 20 % · 24 días", metodo: "cuotas_fijas", tasa: 20, n_cuotas: 24, frecuencia: "diaria" },
  { id: "d20-30", nombre: "Diario 20 % · 30 días", metodo: "cuotas_fijas", tasa: 20, n_cuotas: 30, frecuencia: "diaria" },
  { id: "d10-20", nombre: "Diario 10 % · 20 días", metodo: "cuotas_fijas", tasa: 10, n_cuotas: 20, frecuencia: "diaria" },
  { id: "s20-4", nombre: "Semanal 20 % · 4 semanas", metodo: "cuotas_fijas", tasa: 20, n_cuotas: 4, frecuencia: "semanal" },
  { id: "m10", nombre: "Mensual 10 % acumulado", metodo: "interes_mensual", tasa: 10 },
  { id: "si10-3", nombre: "Solo interés 10 % · 3 meses", metodo: "solo_interes", tasa: 10, n_cuotas: 3, frecuencia: "mensual" },
];

export const LISTA_METODOS = Object.values(METODOS);
export const IDS_METODOS = Object.keys(METODOS);

function cargosIniciales(capital, interes, tasa, fecha) {
  const cargos = [{ tipo: "capital", monto: capital, fecha, clave: "capital", descripcion: "Capital prestado" }];
  if (interes > 0) cargos.push({ tipo: "interes", monto: interes, fecha, clave: "interes:inicio", descripcion: `Interés inicial ${tasa} %` });
  return cargos;
}
