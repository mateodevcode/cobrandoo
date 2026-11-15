import { z } from "zod";
import { manejar, ok, leerJson, ipDe } from "@/server/http";
import { exigirUsuario } from "@/server/auth/session";
import { ROLES_NEGOCIO } from "@/server/permisos";
import { clienteCambiosSchema } from "@/lib/validacion-negocio";
import * as clientes from "@/server/services/clientes.service";

export const GET = manejar(async (_req, { params }) => {
  const yo = await exigirUsuario(ROLES_NEGOCIO);
  const id = z.uuid().parse((await params).id);
  return ok({ cliente: await clientes.obtener(yo, id) });
});

export const PATCH = manejar(async (req, { params }) => {
  const yo = await exigirUsuario(ROLES_NEGOCIO);
  const id = z.uuid().parse((await params).id);
  const cambios = clienteCambiosSchema.parse(await leerJson(req));
  return ok({ cliente: await clientes.actualizar(yo, id, cambios, ipDe(req)) });
});