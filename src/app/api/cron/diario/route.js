// Tarea diaria (Vercel Cron): suma intereses y recargos vencidos a todos los préstamos activos.
// Vercel la llama con "Authorization: Bearer <CRON_SECRET>".
import { timingSafeEqual } from "node:crypto";
import { manejar, ok, fallo } from "@/server/http";
import { procesarPendientes } from "@/server/services/prestamos.service";

export const maxDuration = 300;

function autorizado(req) {
  const secreto = process.env.CRON_SECRET;
  const recibido = req.headers.get("authorization") ?? "";
  const esperado = `Bearer ${secreto}`;
  return !!secreto && recibido.length === esperado.length && timingSafeEqual(Buffer.from(recibido), Buffer.from(esperado));
}

export const GET = manejar(async (req) => {
  if (!autorizado(req)) return fallo(401, "No autorizado", "no_autenticado");
  let total = 0;
  for (let n = 1; n > 0; total += n) n = await procesarPendientes({ limite: 500 });
  return ok({ procesados: total });
});