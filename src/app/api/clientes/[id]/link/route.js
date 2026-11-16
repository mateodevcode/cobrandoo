import { z } from "zod";
import { manejar, ok, ipDe } from "@/server/http";
import { exigirUsuario } from "@/server/auth/session";
import { ROLES_NEGOCIO } from "@/server/permisos";
import { regenerarToken } from "@/server/services/publico.service";

// Genera un link nuevo para el cliente; el anterior deja de funcionar.
export const POST = manejar(async (req, { params }) => {
  const yo = await exigirUsuario(ROLES_NEGOCIO);
  const id = z.uuid().parse((await params).id);
  return ok(await regenerarToken(yo, id, ipDe(req)));
});
