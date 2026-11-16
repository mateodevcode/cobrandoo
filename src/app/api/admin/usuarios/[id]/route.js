import { z } from "zod";
import { manejar, ok, leerJson, ipDe } from "@/server/http";
import { exigirUsuario } from "@/server/auth/session";
import { usuarioCambiosSchema } from "@/lib/validacion";
import { actualizarUsuario, eliminarUsuario } from "@/server/services/admin.service";

export const PATCH = manejar(async (req, { params }) => {
  const admin = await exigirUsuario(["super_admin"]);
  const id = z.uuid().parse((await params).id);
  const cambios = usuarioCambiosSchema.parse(await leerJson(req));
  return ok({ usuario: await actualizarUsuario(admin, id, cambios, ipDe(req)) });
});

// Elimina a la persona conservando su historial (sus clientes pasan a `reasignar_a`)
export const DELETE = manejar(async (req, { params }) => {
  const admin = await exigirUsuario(["super_admin"]);
  const id = z.uuid().parse((await params).id);
  const cuerpo = await req.json().catch(() => ({}));
  const datos = z.object({ reasignar_a: z.uuid().nullish() }).parse(cuerpo ?? {});
  return ok(await eliminarUsuario(admin, id, datos, ipDe(req)));
});
