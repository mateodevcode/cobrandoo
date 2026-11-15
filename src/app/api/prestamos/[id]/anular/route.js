import { z } from "zod";
import { manejar, ok, leerJson, ipDe } from "@/server/http";
import { exigirUsuario } from "@/server/auth/session";
import { ROLES_NEGOCIO } from "@/server/permisos";
import { anulacionSchema } from "@/lib/validacion-negocio";
import * as prestamos from "@/server/services/prestamos.service";

export const POST = manejar(async (req, { params }) => {
  const yo = await exigirUsuario(ROLES_NEGOCIO);
  const id = z.uuid().parse((await params).id);
  const { motivo } = anulacionSchema.parse(await leerJson(req));
  return ok(await prestamos.anular(yo, id, motivo, ipDe(req)));
});