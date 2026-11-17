// Catálogos de préstamos y pagos (compartidos cliente/servidor).

export const DIAS_PERIODO = 30; // un "mes" = 30 días desde la fecha del préstamo
export const TASA_POR_DEFECTO = 10;

export const METODOS_PAGO = [
  { id: "efectivo", nombre: "Efectivo" },
  { id: "nequi", nombre: "Nequi" },
  { id: "daviplata", nombre: "Daviplata" },
  { id: "transferencia", nombre: "Transferencia" },
];
export const IDS_METODOS_PAGO = METODOS_PAGO.map((m) => m.id);
export const NOMBRE_METODO_PAGO = { ...Object.fromEntries(METODOS_PAGO.map((m) => [m.id, m.nombre])), renovacion: "Renovación" };

export const BASES_INTERES = [
  {
    id: "saldo_total",
    nombre: "Sobre lo que debe hoy",
    explicacion:
      "El % se calcula sobre todo lo que debe en ese momento, incluidos intereses y recargos anteriores. Es la opción que más cobra.",
  },
  {
    id: "capital_pendiente",
    nombre: "Sobre el capital que falta",
    explicacion: "El % se calcula solo sobre la parte del préstamo que aún no ha pagado, sin contar intereses.",
  },
  {
    id: "capital_original",
    nombre: "Sobre el préstamo original",
    explicacion: "Siempre el mismo % del monto prestado, aunque ya haya abonado. Es la más fácil de explicarle al cliente.",
  },
];
export const IDS_BASES = BASES_INTERES.map((b) => b.id);

export const FRECUENCIAS = [
  { id: "diaria", nombre: "Diaria", dias: 1 },
  { id: "semanal", nombre: "Semanal", dias: 7 },
  { id: "quincenal", nombre: "Quincenal", dias: 15 },
  { id: "mensual", nombre: "Mensual", dias: 30 },
];
export const DIAS_FRECUENCIA = Object.fromEntries(FRECUENCIAS.map((f) => [f.id, f.dias]));

export const RECARGOS = [
  { id: "ninguno", nombre: "Sin recargo" },
  { id: "fijo_diario", nombre: "Valor fijo por día de atraso", explicacion: "Cada día que tenga cuotas atrasadas se le suma este valor." },
  { id: "porcentaje_cuota", nombre: "% de cada cuota atrasada", explicacion: "Cada cuota que no pague en su día genera un recargo de este % sobre la cuota." },
];
export const IDS_RECARGOS = RECARGOS.map((r) => r.id);

export const CATEGORIAS_GASTO = [
  { id: "transporte", nombre: "Transporte / gasolina" },
  { id: "alimentacion", nombre: "Alimentación" },
  { id: "celular", nombre: "Celular / recargas" },
  { id: "papeleria", nombre: "Papelería" },
  { id: "otro", nombre: "Otro" },
];
export const IDS_CATEGORIAS_GASTO = CATEGORIAS_GASTO.map((c) => c.id);
