import { z } from "zod";
import { manejar, ok, leerJson, ipDe } from "@/server/http";
import { exigirUsuario } from "@/server/auth/session";
import { ROLES_NEGOCIO } from "@/server/permisos";
import { prestamoSchema } from "@/lib/validacion-negocio";
import * as prestamos from "@/server/services/prestamos.service";

const filtros = z.object({
  estado: z.enum(["activo", "pagado", "anulado", "todos"]).optional(),
  cliente: z.uuid().optional(),
  cobrador: z.uuid().optional(),
  mora: z.enum(["1"]).optional(),
});

export const GET = manejar(async (req) => {
  const yo = await exigirUsuario(ROLES_NEGOCIO);
  const f = filtros.parse(Object.fromEntries(req.nextUrl.searchParams));
  return ok({ prestamos: await prestamos.listar(yo, { estado: f.estado, clienteId: f.cliente, cobradorId: f.cobrador, enMora: !!f.mora }) });
});

export const POST = manejar(async (req) => {
  const yo = await exigirUsuario(ROLES_NEGOCIO);
  const datos = prestamoSchema.parse(await leerJson(req));
  return ok({ prestamo: await prestamos.crear(yo, datos, ipDe(req)) }, { status: 201 });
});