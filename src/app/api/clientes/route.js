import { z } from "zod";
import { manejar, ok, leerJson, ipDe } from "@/server/http";
import { exigirUsuario } from "@/server/auth/session";
import { ROLES_NEGOCIO } from "@/server/permisos";
import { clienteSchema } from "@/lib/validacion-negocio";
import * as clientes from "@/server/services/clientes.service";

const filtros = z.object({
  q: z.string().max(80).optional(),
  estado: z.enum(["activo", "inactivo"]).optional(),
  ruta: z.union([z.uuid(), z.literal("sin")]).optional(),
  cobrador: z.uuid().optional(),
});

export const GET = manejar(async (req) => {
  const yo = await exigirUsuario(ROLES_NEGOCIO);
  const f = filtros.parse(Object.fromEntries(req.nextUrl.searchParams));
  return ok({ clientes: await clientes.listar(yo, { q: f.q, estado: f.estado, rutaId: f.ruta, cobradorId: f.cobrador }) });
});

export const POST = manejar(async (req) => {
  const yo = await exigirUsuario(ROLES_NEGOCIO);
  const datos = clienteSchema.parse(await leerJson(req));
  return ok({ cliente: await clientes.crear(yo, datos, ipDe(req)) }, { status: 201 });
});