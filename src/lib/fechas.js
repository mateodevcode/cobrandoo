// Fechas de negocio como texto "YYYY-MM-DD" en hora de Colombia.
// Así un cobro de las 11:50 p. m. cae en el día correcto, sin líos de zona horaria.

const formato = new Intl.DateTimeFormat("en-CA", {
  timeZone: "America/Bogota",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

/** Fecha de hoy en Colombia: "2026-11-15" */
export const hoyBogota = (d = new Date()) => formato.format(d);

const aMs = (s) => {
  const [y, m, d] = s.split("-").map(Number);
  return Date.UTC(y, m - 1, d);
};

/** "2026-11-15" + 3 → "2026-11-18" */
export const sumarDias = (s, n) => new Date(aMs(s) + n * 86_400_000).toISOString().slice(0, 10);

/** Días de `a` a `b` (b − a). */
export const diasEntre = (a, b) => Math.round((aMs(b) - aMs(a)) / 86_400_000);

/** Lunes de la semana de `s` */
export function inicioSemana(s) {
  const dia = new Date(aMs(s)).getUTCDay(); // 0 = domingo
  return sumarDias(s, -((dia + 6) % 7));
}

export const esFecha = (s) => typeof s === "string" && /^\d{4}-\d{2}-\d{2}$/.test(s) && !Number.isNaN(aMs(s));
