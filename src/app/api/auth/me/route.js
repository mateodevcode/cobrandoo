import { manejar, ok, ErrorApp } from "@/server/http";
import { exigirUsuario } from "@/server/auth/session";
import * as usuariosRepo from "@/server/repos/usuarios.repo";

export const GET = manejar(async () => {
  const yo = await exigirUsuario();
  const u = await usuariosRepo.buscarPorId(yo.id);
  if (!u) throw new ErrorApp(401, "Sesión expirada", "no_autenticado");
  return ok({ usuario: u });
});
