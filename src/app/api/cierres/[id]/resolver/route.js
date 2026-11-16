import { z } from "zod";
import { manejar, ok, leerJson, ipDe } from "@/server/http";
import { exigirUsuario } from "@/server/auth/session";
import { resolucionSchema } from "@/lib/validacion-negocio";
import * as cierres from "@/server/services/cierres.service";

export const POST = manejar(async (req, { params }) => {
  const yo = await exigirUsuario(["dueno", "supervisor"]);
  const id = z.uuid().parse((await params).id);
  const datos = resolucionSchema.parse(await leerJson(req));
  return ok(await cierres.resolver(yo, id, datos, ipDe(req)));
});