import { manejar, ok } from "@/server/http";
import { exigirUsuario } from "@/server/auth/session";
import { ROLES_NEGOCIO } from "@/server/permisos";
import { esFecha } from "@/lib/fechas";
import * as cierres from "@/server/services/cierres.service";

export const GET = manejar(async (req) => {
  const yo = await exigirUsuario(ROLES_NEGOCIO);
  const f = req.nextUrl.searchParams.get("fecha");
  return ok(await cierres.estado(yo, esFecha(f) ? f : undefined));
});