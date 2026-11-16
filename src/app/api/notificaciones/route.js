import { manejar, ok } from "@/server/http";
import { exigirUsuario } from "@/server/auth/session";
import * as notificaciones from "@/server/services/notificaciones.service";

export const GET = manejar(async () => {
  const yo = await exigirUsuario();
  return ok(await notificaciones.listar(yo));
});