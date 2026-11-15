import { manejar, ok } from "@/server/http";
import { exigirUsuario } from "@/server/auth/session";
import { ROLES_NEGOCIO } from "@/server/permisos";
import { resumen } from "@/server/services/tablero.service";

export const GET = manejar(async () => {
  const yo = await exigirUsuario(ROLES_NEGOCIO);
  return ok(await resumen(yo));
});