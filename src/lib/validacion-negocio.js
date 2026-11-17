// Esquemas Zod de clientes, rutas, préstamos, pagos y caja (cliente y servidor).
import { z } from "zod";
import { IDS_METODOS, METODOS } from "./prestamos/metodos.js";
import { IDS_BASES, IDS_METODOS_PAGO, IDS_RECARGOS, IDS_CATEGORIAS_GASTO, FRECUENCIAS, TASA_POR_DEFECTO } from "./prestamos/constantes.js";
import { esFecha } from "./fechas.js";

z.config(z.locales.es());

const texto = (max) => z.string().trim().max(max);
/** Texto opcional: "" → null */
const opcional = (max) =>
  texto(max)
    .nullish()
    .transform((v) => (v ? v : null));
/** En cambios: undefined = no tocar, "" = borrar */
const opcionalCambio = (max) =>
  texto(max)
    .nullish()
    .transform((v) => (v === undefined ? undefined : v || null));

/** Pesos enteros (acepta "1.250.000" o 1250000) */
const pesos = (min, max, nombre = "El valor") =>
  z
    .union([z.number(), z.string()])
    .transform((v) => (typeof v === "string" ? Number(v.replace(/[^\d]/g, "")) : Math.round(v)))
    .pipe(
      z
        .number()
        .int()
        .min(min, `${nombre} debe ser al menos $${min.toLocaleString("es-CO")}`)
        .max(max, `${nombre} es demasiado alto`)
    );

const fecha = z.string().refine(esFecha, "Fecha inválida");

// ===== Clientes =====
export const clienteSchema = z.object({
  id: z.uuid().optional(),
  cobrador_id: z.uuid().optional(),
  ruta_id: z.uuid().nullish().transform((v) => v ?? null),
  nombre: texto(100).min(2, "Escribe el nombre"),
  cedula: opcional(20),
  telefono: opcional(20),
  direccion: opcional(160),
  barrio: opcional(80),
  ciudad: opcional(80),
  referencia: opcional(100),
  notas: opcional(500),
  latitud: z.number().min(-90).max(90).nullish(),
  longitud: z.number().min(-180).max(180).nullish(),
  ubicacion_precision: z.number().int().min(0).max(100000).nullish(),
});

export const clienteCambiosSchema = z.object({
  cobrador_id: z.uuid().optional(),
  ruta_id: z.uuid().nullish(),
  nombre: texto(100).min(2).optional(),
  cedula: opcionalCambio(20),
  telefono: opcionalCambio(20),
  direccion: opcionalCambio(160),
  barrio: opcionalCambio(80),
  ciudad: opcionalCambio(80),
  referencia: opcionalCambio(100),
  notas: opcionalCambio(500),
  estado: z.enum(["activo", "inactivo"]).optional(),
  latitud: z.number().min(-90).max(90).nullish(),
  longitud: z.number().min(-180).max(180).nullish(),
  ubicacion_precision: z.number().int().min(0).max(100000).nullish(),
});

// ===== Rutas =====
export const rutaSchema = z.object({
  nombre: texto(60).min(2, "Escribe el nombre de la ruta"),
  cobrador_id: z.uuid().optional(),
});

export const rutaCambiosSchema = z.object({
  nombre: texto(60).min(2).optional(),
  activa: z.boolean().optional(),
});

export const ordenRutaSchema = z.object({
  ruta_id: z.uuid().nullable(),
  clientes: z.array(z.uuid()).max(1000),
});

// ===== Préstamos =====
export const prestamoSchema = z
  .object({
    id: z.uuid().optional(),
    cliente_id: z.uuid(),
    metodo: z.enum(IDS_METODOS),
    capital: pesos(10_000, 10_000_000_000, "El monto"),
    tasa: z.coerce.number().min(0, "Mínimo 0 %").max(100, "Máximo 100 %").default(TASA_POR_DEFECTO),
    base_interes: z.enum(IDS_BASES).default("saldo_total"),
    frecuencia: z.enum(FRECUENCIAS.map((f) => f.id)).nullish(),
    n_cuotas: z.coerce.number().int().min(1).max(365).nullish(),
    recargo_tipo: z.enum(IDS_RECARGOS).default("ninguno"),
    recargo_valor: z.coerce.number().min(0).max(100_000_000).default(0),
    metodo_desembolso: z.enum(IDS_METODOS_PAGO).default("efectivo"),
    fecha_inicio: fecha.optional(),
    registrar_desembolso: z.boolean().default(true),
    renueva_a: z.uuid().nullish(),
    notas: opcional(500),
    creado_en_dispositivo: z.iso.datetime({ offset: true }).optional(),
  })
  .superRefine((d, ctx) => {
    if (METODOS[d.metodo].usaCuotas) {
      if (!d.frecuencia) ctx.addIssue({ code: "custom", path: ["frecuencia"], message: "Elige cada cuánto paga" });
      if (!d.n_cuotas) ctx.addIssue({ code: "custom", path: ["n_cuotas"], message: "Indica el número de cuotas" });
    }
    if (d.recargo_tipo === "porcentaje_cuota" && d.recargo_valor > 100) {
      ctx.addIssue({ code: "custom", path: ["recargo_valor"], message: "Máximo 100 %" });
    }
    if (d.recargo_tipo !== "ninguno" && d.recargo_valor <= 0) {
      ctx.addIssue({ code: "custom", path: ["recargo_valor"], message: "Indica el valor del recargo" });
    }
  })
  .transform((d) => ({
    ...d,
    ...(METODOS[d.metodo].usaCuotas ? {} : { frecuencia: null, n_cuotas: null }),
    ...(METODOS[d.metodo].usaRecargo ? {} : { recargo_tipo: "ninguno", recargo_valor: 0 }),
  }));

// ===== Pagos =====
export const pagoSchema = z.object({
  id: z.uuid("Falta el identificador del pago"),
  prestamo_id: z.uuid(),
  monto: pesos(100, 10_000_000_000, "El pago"),
  metodo: z.enum(IDS_METODOS_PAGO).default("efectivo"),
  nota: opcional(300),
  creado_en_dispositivo: z.iso.datetime({ offset: true }).optional(),
});

export const anulacionSchema = z.object({
  motivo: texto(300).min(3, "Explica brevemente el motivo"),
});

// ===== Cierre del día =====
export const cierreSchema = z.object({
  efectivo_contado: pesos(0, 10_000_000_000, "El efectivo contado"),
  observacion: opcional(500),
  fecha: fecha.optional(),
});

export const revisionSchema = z
  .object({
    decision: z.enum(["aprobar", "rechazar"]),
    comentario: opcional(500),
  })
  .refine((d) => d.decision === "aprobar" || (d.comentario && d.comentario.length >= 3), {
    path: ["comentario"],
    message: "Explica qué falló",
  });

export const resolucionSchema = z.object({
  comentario: texto(500).min(3, "Explica cómo se resolvió"),
});

// ===== Caja =====
export const gastoSchema = z.object({
  id: z.uuid().optional(),
  monto: pesos(100, 100_000_000, "El gasto"),
  categoria: z.enum(IDS_CATEGORIAS_GASTO),
  descripcion: opcional(200),
  metodo: z.enum(IDS_METODOS_PAGO).default("efectivo"),
  creado_en_dispositivo: z.iso.datetime({ offset: true }).optional(),
});

export const capitalSchema = z.object({
  id: z.uuid().optional(),
  monto: pesos(1_000, 100_000_000_000, "El capital"),
  metodo: z.enum(IDS_METODOS_PAGO).default("efectivo"),
  descripcion: opcional(200),
  creado_en_dispositivo: z.iso.datetime({ offset: true }).optional(),
});

export const baseSchema = z.object({
  id: z.uuid().optional(),
  cobrador_id: z.uuid(),
  monto: pesos(1_000, 10_000_000_000, "La base"),
  metodo: z.enum(IDS_METODOS_PAGO).default("efectivo"),
  descripcion: opcional(200),
  creado_en_dispositivo: z.iso.datetime({ offset: true }).optional(),
});
