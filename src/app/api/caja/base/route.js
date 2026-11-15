import { manejar, ok, leerJson, ipDe } from "@/server/http";
import { exigirUsuario } from "@/server/auth/session";
import { baseSchema } from "@/lib/validacion-negocio";
import * as caja from "@/server/services/caja.service";

export const POST = manejar(async (req) => {
  const yo = await exigirUsuario(["dueno", "supervisor"]);
  const datos = baseSchema.parse(await leerJson(req));
  return ok(await caja.entregarBase(yo, datos, ipDe(req)), { status: 201 });
});