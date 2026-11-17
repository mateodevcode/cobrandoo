// Aviso de la mañana (Vercel Cron, 7:00 a. m. Bogotá): clientes que entraron hoy en mora.
import { timingSafeEqual } from "node:crypto";
import { manejar, ok, fallo } from "@/server/http";
import { avisarNuevos } from "@/server/services/morosos.service";

export const maxDuration = 300;

function autorizado(req) {
  const secreto = process.env.CRON_SECRET;
  const recibido = req.headers.get("authorization") ?? "";
  const esperado = `Bearer ${secreto}`;
  return !!secreto && recibido.length === esperado.length && timingSafeEqual(Buffer.from(recibido), Buffer.from(esperado));
}

export const GET = manejar(async (req) => {
  if (!autorizado(req)) return fallo(401, "No autorizado", "no_autenticado");
  return ok(await avisarNuevos());
});
