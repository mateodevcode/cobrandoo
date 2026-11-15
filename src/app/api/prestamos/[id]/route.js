import { z } from "zod";
import { manejar, ok } from "@/server/http";
import { exigirUsuario } from "@/server/auth/session";
import { ROLES_NEGOCIO } from "@/server/permisos";
import * as prestamos from "@/server/services/prestamos.service";

export const GET = manejar(async (_req, { params }) => {
  const yo = await exigirUsuario(ROLES_NEGOCIO);
  const id = z.uuid().parse((await params).id);
  return ok(await prestamos.obtener(yo, id));
});