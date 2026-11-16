import { z } from "zod";
import { manejar, ok, leerJson } from "@/server/http";
import { exigirUsuario } from "@/server/auth/session";
import * as notificaciones from "@/server/services/notificaciones.service";

const schema = z.object({ ids: z.array(z.uuid()).max(200).optional() });

export const POST = manejar(async (req) => {
  const yo = await exigirUsuario();
  const { ids } = schema.parse(await leerJson(req));
  await notificaciones.marcarLeidas(yo, ids);
  return ok(null);
});