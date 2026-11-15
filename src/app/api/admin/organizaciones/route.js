import { manejar, ok, leerJson, ipDe } from "@/server/http";
import { exigirUsuario } from "@/server/auth/session";
import { organizacionSchema } from "@/lib/validacion";
import * as orgRepo from "@/server/repos/organizaciones.repo";
import { crearOrganizacion } from "@/server/services/admin.service";

export const GET = manejar(async () => {
  await exigirUsuario(["super_admin"]);
  return ok({ organizaciones: await orgRepo.listar() });
});

export const POST = manejar(async (req) => {
  const admin = await exigirUsuario(["super_admin"]);
  const { nombre } = organizacionSchema.parse(await leerJson(req));
  return ok({ organizacion: await crearOrganizacion(admin, nombre, ipDe(req)) }, { status: 201 });
});
