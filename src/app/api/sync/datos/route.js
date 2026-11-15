import { manejar, ok } from "@/server/http";
import { exigirUsuario } from "@/server/auth/session";
import { ROLES_NEGOCIO } from "@/server/permisos";
import { datosOffline } from "@/server/services/sync.service";

// Datos para el modo sin internet. Nunca se guarda en caché compartida.
export const GET = manejar(async () => {
  const yo = await exigirUsuario(ROLES_NEGOCIO);
  const res = ok(await datosOffline(yo));
  res.headers.set("Cache-Control", "private, no-store");
  return res;
});
