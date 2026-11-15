const pesos = new Intl.NumberFormat("es-CO", {
  style: "currency",
  currency: "COP",
  maximumFractionDigits: 0,
});

/** 1250000 → "$ 1.250.000" */
export const dinero = (n) => pesos.format(Number(n) || 0);

const fechaLarga = new Intl.DateTimeFormat("es-CO", {
  weekday: "long",
  day: "numeric",
  month: "long",
  year: "numeric",
  timeZone: "America/Bogota",
});
export const fechaHoy = (d = new Date()) => fechaLarga.format(d);

const fechaCorta = new Intl.DateTimeFormat("es-CO", {
  day: "2-digit",
  month: "short",
  year: "numeric",
  timeZone: "America/Bogota",
});
/** Fecha corta. Las fechas de negocio "YYYY-MM-DD" se leen al mediodía UTC para que no se corran de día en Colombia. */
export const fecha = (d) => {
  if (!d) return "—";
  const esSoloFecha = typeof d === "string" && /^\d{4}-\d{2}-\d{2}$/.test(d);
  return fechaCorta.format(esSoloFecha ? new Date(`${d}T12:00:00Z`) : new Date(d));
};

/** "María García" → "MG" */
export const iniciales = (nombre = "") =>
  nombre
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase() ?? "")
    .join("");

/** Saludo según la hora en Colombia */
export function saludo(d = new Date()) {
  const h = Number(new Intl.DateTimeFormat("es-CO", { hour: "numeric", hour12: false, timeZone: "America/Bogota" }).format(d));
  return h < 12 ? "Buenos días" : h < 19 ? "Buenas tardes" : "Buenas noches";
}
