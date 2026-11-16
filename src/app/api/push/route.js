// Suscripción a notificaciones push de este teléfono/navegador.
import { z } from "zod";
import { manejar, ok, leerJson } from "@/server/http";
import { exigirUsuario } from "@/server/auth/session";
import { guardarSuscripcion, borrarSuscripcion } from "@/server/push";

const suscripcion = z.object({
  endpoint: z.url().max(1000).refine((u) => u.startsWith("https://"), "Endpoint inválido"),
  keys: z.object({ p256dh: z.string().min(10).max(200), auth: z.string().min(8).max(100) }),
});

export const POST = manejar(async (req) => {
  const yo = await exigirUsuario();
  const sub = suscripcion.parse(await leerJson(req));
  await guardarSuscripcion(yo.id, sub, req.headers.get("user-agent"));
  return ok(null, { status: 201 });
});

export const DELETE = manejar(async (req) => {
  const yo = await exigirUsuario();
  const { endpoint } = z.object({ endpoint: z.string().max(1000) }).parse(await leerJson(req));
  await borrarSuscripcion(yo.id, endpoint);
  return ok(null);
});