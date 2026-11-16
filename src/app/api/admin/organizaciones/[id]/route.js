import { z } from "zod";
import { manejar, ok, leerJson, ipDe } from "@/server/http";
import { exigirUsuario } from "@/server/auth/session";
import { organizacionCambiosSchema } from "@/lib/validacion";
import { actualizarOrganizacion, eliminarOrganizacion } from "@/server/services/admin.service";

export const PATCH = manejar(async (req, { params }) => {
  const admin = await exigirUsuario(["super_admin"]);
  const id = z.uuid().parse((await params).id);
  const cambios = organizacionCambiosSchema.parse(await leerJson(req));
  return ok({ organizacion: await actualizarOrganizacion(admin, id, cambios, ipDe(req)) });
});

// Borra la organización y todo lo que tiene dentro. Exige escribir su nombre exacto.
export const DELETE = manejar(async (req, { params }) => {
  const admin = await exigirUsuario(["super_admin"]);
  const id = z.uuid().parse((await params).id);
  const { confirmacion } = z.object({ confirmacion: z.string().max(200) }).parse(await leerJson(req));
  return ok(await eliminarOrganizacion(admin, id, { confirmacion }, ipDe(req)));
});
