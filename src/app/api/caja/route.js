import { z } from "zod";
import { manejar, ok } from "@/server/http";
import { exigirUsuario } from "@/server/auth/session";
import { ROLES_NEGOCIO } from "@/server/permisos";
import { esFecha } from "@/lib/fechas";
import * as caja from "@/server/services/caja.service";

const filtros = z.object({
  usuario: z.uuid().optional(),
  fecha: z.string().refine(esFecha).optional(),
});

export const GET = manejar(async (req) => {
  const yo = await exigirUsuario(ROLES_NEGOCIO);
  const f = filtros.parse(Object.fromEntries(req.nextUrl.searchParams));
  return ok(await caja.resumenCaja(yo, f.usuario ?? yo.id, f.fecha));
});