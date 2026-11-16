import { manejar, ok, leerJson, ipDe } from "@/server/http";
import { exigirUsuario } from "@/server/auth/session";
import { capitalSchema } from "@/lib/validacion-negocio";
import * as caja from "@/server/services/caja.service";

// El dueño registra el capital que mete al negocio
export const POST = manejar(async (req) => {
  const yo = await exigirUsuario(["dueno"]);
  const datos = capitalSchema.parse(await leerJson(req));
  return ok(await caja.registrarCapital(yo, datos, ipDe(req)), { status: 201 });
});
