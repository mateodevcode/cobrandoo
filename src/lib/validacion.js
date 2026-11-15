// Esquemas Zod compartidos (cliente y servidor).
import { z } from "zod";
import { ESTADOS_USUARIO, ROLES_ORG } from "./roles";

// Mensajes de error de Zod en español
z.config(z.locales.es());

const texto = (max = 120) => z.string().trim().max(max);
const opcional = (max) =>
  texto(max)
    .optional()
    .nullable()
    .transform((v) => (v ? v : null));

// En PATCH: undefined = no tocar; "" o null = borrar.
const opcionalCambio = (max) =>
  texto(max)
    .nullable()
    .optional()
    .transform((v) => (v === undefined ? undefined : v || null));

export const password = z
  .string()
  .min(8, "Mínimo 8 caracteres")
  .max(72, "Máximo 72 caracteres");

/** Correo normalizado a minúsculas. */
export const correo = z.string().trim().toLowerCase().max(120).pipe(z.email("Correo inválido"));

export const loginSchema = z.object({
  email: correo,
  password: z.string().min(1, "Escribe tu contraseña").max(72),
});

export const organizacionSchema = z.object({
  nombre: texto(80).min(2, "Mínimo 2 caracteres"),
});

export const organizacionCambiosSchema = z.object({
  nombre: texto(80).min(2).optional(),
  activa: z.boolean().optional(),
});

export const usuarioNuevoSchema = z.object({
  organizacion_id: z.uuid("Organización inválida"),
  rol: z.enum(ROLES_ORG, { error: "Rol inválido" }),
  jefe_id: z.uuid().optional().nullable().transform((v) => v ?? null),
  email: correo,
  nombre: texto(100).min(2, "Mínimo 2 caracteres"),
  cedula: opcional(20),
  telefono: opcional(20),
  password,
});

export const usuarioCambiosSchema = z.object({
  jefe_id: z.uuid().nullable().optional(),
  nombre: texto(100).min(2).optional(),
  cedula: opcionalCambio(20),
  telefono: opcionalCambio(20),
  email: correo.optional(),
  estado: z.enum(ESTADOS_USUARIO).optional(),
  password: password.optional(),
});
