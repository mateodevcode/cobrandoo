import { z } from "zod";
import { manejar, ok, leerJson, ipDe } from "@/server/http";
import { exigirUsuario } from "@/server/auth/session";
import { ROLES_NEGOCIO } from "@/server/permisos";
import { rutaSchema } from "@/lib/validacion-negocio";
import * as clientes from "@/server/services/clientes.service";

export const GET = manejar(async (req) => {
  const yo = await exigirUsuario(ROLES_NEGOCIO);
  const cobrador = z.uuid().optional().parse(req.nextUrl.searchParams.get("cobrador") ?? undefined);
  return ok({ rutas: await clientes.listarRutas(yo, cobrador) });
});

export const POST = manejar(async (req) => {
  const yo = await exigirUsuario(ROLES_NEGOCIO);
  const datos = rutaSchema.parse(await leerJson(req));
  return ok({ ruta: await clientes.crearRuta(yo, datos, ipDe(req)) }, { status: 201 });
});