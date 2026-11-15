import "server-only";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { verificarAcceso, COOKIE_ACCESS } from "./tokens";
import { ErrorApp } from "../http";

/** Usuario del JWT de acceso actual, o null. No toca la base de datos. */
export async function usuarioActual() {
  const jar = await cookies();
  return verificarAcceso(jar.get(COOKIE_ACCESS)?.value);
}

/** Para route handlers: exige sesión (y opcionalmente ciertos roles). Lanza 401/403. */
export async function exigirUsuario(roles) {
  const u = await usuarioActual();
  if (!u) throw new ErrorApp(401, "Sesión expirada", "no_autenticado");
  if (roles && !roles.includes(u.rol)) throw new ErrorApp(403, "No tienes permiso para esto", "prohibido");
  return u;
}

/** Para páginas (server components): redirige si no hay sesión o rol. */
export async function exigirUsuarioPagina(roles) {
  const u = await usuarioActual();
  if (!u) redirect("/login");
  if (roles && !roles.includes(u.rol)) redirect(u.rol === "super_admin" ? "/admin" : "/inicio");
  return u;
}
