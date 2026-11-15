import "server-only";
import { NextResponse } from "next/server";
import { ZodError } from "zod";

/** Error con código HTTP que se puede mostrar al usuario. */
export class ErrorApp extends Error {
  constructor(status, mensaje, codigo) {
    super(mensaje);
    this.status = status;
    this.codigo = codigo;
  }
}

export const ok = (data, init) => NextResponse.json({ ok: true, data }, init);

export function fallo(status, mensaje, codigo, extra) {
  return NextResponse.json({ ok: false, error: { mensaje, codigo, ...extra } }, { status });
}

/** Envuelve un route handler: convierte errores conocidos en respuestas JSON. */
export function manejar(handler) {
  return async (req, ctx) => {
    try {
      return await handler(req, ctx);
    } catch (err) {
      if (err instanceof ErrorApp) return fallo(err.status, err.message, err.codigo);
      if (err instanceof ZodError) {
        return fallo(400, "Datos inválidos", "validacion", {
          campos: err.issues.map((i) => ({ campo: i.path.join("."), mensaje: i.message })),
        });
      }
      if (err?.code === "23505") return fallo(409, "Ya existe un registro con esos datos", "duplicado");
      console.error("[api]", err);
      return fallo(500, "Error interno", "interno");
    }
  };
}

export async function leerJson(req) {
  try {
    return await req.json();
  } catch {
    throw new ErrorApp(400, "El cuerpo debe ser JSON", "json_invalido");
  }
}

export function ipDe(req) {
  return req.headers.get("x-forwarded-for")?.split(",")[0].trim() || req.headers.get("x-real-ip") || null;
}
