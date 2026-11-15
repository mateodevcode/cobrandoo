import { z } from "zod";
import { manejar, ok, leerJson, ipDe } from "@/server/http";
import { exigirUsuario } from "@/server/auth/session";
import { ROLES_NEGOCIO } from "@/server/permisos";
import { rutaCambiosSchema } from "@/lib/validacion-negocio";
import * as clientes from "@/server/services/clientes.service";

export const PATCH = manejar(async (req, { params }) => {
  const yo = await exigirUsuario(ROLES_NEGOCIO);
  const id = z.uuid().parse((await params).id);
  const cambios = rutaCambiosSchema.parse(await leerJson(req));
  return ok({ ruta: await clientes.actualizarRuta(yo, id, cambios, ipDe(req)) });
});