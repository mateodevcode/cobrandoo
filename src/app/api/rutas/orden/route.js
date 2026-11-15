import { manejar, ok, leerJson } from "@/server/http";
import { exigirUsuario } from "@/server/auth/session";
import { ROLES_NEGOCIO } from "@/server/permisos";
import { ordenRutaSchema } from "@/lib/validacion-negocio";
import * as clientes from "@/server/services/clientes.service";

export const POST = manejar(async (req) => {
  const yo = await exigirUsuario(ROLES_NEGOCIO);
  const datos = ordenRutaSchema.parse(await leerJson(req));
  return ok(await clientes.ordenarRuta(yo, datos));
});