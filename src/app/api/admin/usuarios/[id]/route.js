import { z } from "zod";
import { manejar, ok, leerJson, ipDe } from "@/server/http";
import { exigirUsuario } from "@/server/auth/session";
import { usuarioCambiosSchema } from "@/lib/validacion";
import { actualizarUsuario } from "@/server/services/admin.service";

export const PATCH = manejar(async (req, { params }) => {
  const admin = await exigirUsuario(["super_admin"]);
  const id = z.uuid().parse((await params).id);
  const cambios = usuarioCambiosSchema.parse(await leerJson(req));
  return ok({ usuario: await actualizarUsuario(admin, id, cambios, ipDe(req)) });
});
