import { z } from "zod";
import { manejar, ok, leerJson, ipDe } from "@/server/http";
import { exigirUsuario } from "@/server/auth/session";
import { usuarioNuevoSchema } from "@/lib/validacion";
import * as usuariosRepo from "@/server/repos/usuarios.repo";
import { crearUsuario } from "@/server/services/admin.service";

const filtrosSchema = z.object({
  organizacion: z.uuid().optional(),
  rol: z.enum(["dueno", "supervisor", "cobrador"]).optional(),
});

export const GET = manejar(async (req) => {
  await exigirUsuario(["super_admin"]);
  const f = filtrosSchema.parse(Object.fromEntries(req.nextUrl.searchParams));
  return ok({ usuarios: await usuariosRepo.listar({ organizacionId: f.organizacion, rol: f.rol }) });
});

export const POST = manejar(async (req) => {
  const admin = await exigirUsuario(["super_admin"]);
  const datos = usuarioNuevoSchema.parse(await leerJson(req));
  return ok({ usuario: await crearUsuario(admin, datos, ipDe(req)) }, { status: 201 });
});
