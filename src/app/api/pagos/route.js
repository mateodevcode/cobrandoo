import { manejar, ok, leerJson, ipDe } from "@/server/http";
import { exigirUsuario } from "@/server/auth/session";
import { ROLES_NEGOCIO } from "@/server/permisos";
import { pagoSchema } from "@/lib/validacion-negocio";
import * as pagos from "@/server/services/pagos.service";

export const POST = manejar(async (req) => {
  const yo = await exigirUsuario(ROLES_NEGOCIO);
  const datos = pagoSchema.parse(await leerJson(req));
  const pago = await pagos.registrar(yo, datos, ipDe(req));
  return ok({ pago }, { status: pago.duplicado ? 200 : 201 });
});