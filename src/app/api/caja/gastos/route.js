import { manejar, ok, leerJson, ipDe } from "@/server/http";
import { exigirUsuario } from "@/server/auth/session";
import { ROLES_NEGOCIO } from "@/server/permisos";
import { gastoSchema } from "@/lib/validacion-negocio";
import * as caja from "@/server/services/caja.service";

export const POST = manejar(async (req) => {
  const yo = await exigirUsuario(ROLES_NEGOCIO);
  const datos = gastoSchema.parse(await leerJson(req));
  return ok(await caja.registrarGasto(yo, datos, ipDe(req)), { status: 201 });
});