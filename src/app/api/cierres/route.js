import { z } from "zod";
import { manejar, ok, leerJson, ipDe } from "@/server/http";
import { exigirUsuario } from "@/server/auth/session";
import { ROLES_NEGOCIO } from "@/server/permisos";
import { cierreSchema } from "@/lib/validacion-negocio";
import * as cierres from "@/server/services/cierres.service";

const filtros = z.object({ estado: z.enum(["pendiente", "aprobado", "con_fallo", "resuelto", "abiertos"]).optional() });

export const GET = manejar(async (req) => {
  const yo = await exigirUsuario(ROLES_NEGOCIO);
  const f = filtros.parse(Object.fromEntries(req.nextUrl.searchParams));
  return ok({ cierres: await cierres.listar(yo, { estado: f.estado }) });
});

export const POST = manejar(async (req) => {
  const yo = await exigirUsuario(["cobrador", "supervisor"]);
  const datos = cierreSchema.parse(await leerJson(req));
  return ok({ cierre: await cierres.cerrarDia(yo, datos, ipDe(req)) }, { status: 201 });
});