import { z } from "zod";
import { manejar, ok } from "@/server/http";
import { exigirUsuario } from "@/server/auth/session";
import { ROLES_NEGOCIO } from "@/server/permisos";
import { rutaDelDia } from "@/server/services/tablero.service";

export const GET = manejar(async (req) => {
  const yo = await exigirUsuario(ROLES_NEGOCIO);
  const cobrador = z.uuid().optional().parse(req.nextUrl.searchParams.get("cobrador") ?? undefined);
  return ok({ clientes: await rutaDelDia(yo, cobrador ?? yo.id) });
});