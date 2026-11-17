import "server-only";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { verificarAcceso, COOKIE_ACCESS } from "./tokens";
import { ErrorApp } from "../http";
import { query } from "../db";

// El JWT de acceso dura 15 min y no se puede "revocar". Para que una persona eliminada o
// desactivada (o de una organización desactivada) pierda el acceso de inmediato, se confirma
// en la base que la cuenta sigue vigente. Se recuerda 60 s por servidor para no frenar cada petición.
const VIGENCIA_MS = 60_000;
const vigencia = new Map();

async function sigueVigente(u) {
  const c = vigencia.get(u.id);
  const valeToken = (v) => v.ok && (!v.desde || (u.iat ?? 0) >= v.desde);
  if (c && c.hasta > Date.now()) return valeToken(c);
  const { rows } = await query(
    `SELECT u.estado = 'activo' AND u.eliminado_en IS NULL AND COALESCE(o.activa, true) AS ok,
            floor(extract(epoch FROM u.sesiones_desde))::bigint AS desde
       FROM usuarios u LEFT JOIN organizaciones o ON o.id = u.organizacion_id
      WHERE u.id = $1`,
    [u.id]
  );
  const v = { ok: !!rows[0]?.ok, desde: rows[0]?.desde ? Number(rows[0].desde) : null, hasta: Date.now() + VIGENCIA_MS };
  vigencia.set(u.id, v);
  if (vigencia.size > 10_000) vigencia.clear();
  return valeToken(v);
}

/** Olvida lo recordado (al eliminar o desactivar personas u organizaciones). Sin id: todo. */
export function olvidarVigencia(usuarioId) {
  if (usuarioId) vigencia.delete(usuarioId);
  else vigencia.clear();
}

/** Usuario del JWT de acceso actual, o null. No toca la base de datos. */
export async function usuarioActual() {
  const jar = await cookies();
  return verificarAcceso(jar.get(COOKIE_ACCESS)?.value);
}

/** Para route handlers: exige sesión vigente (y opcionalmente ciertos roles). Lanza 401/403. */
export async function exigirUsuario(roles) {
  const u = await usuarioActual();
  if (!u || !(await sigueVigente(u))) throw new ErrorApp(401, "Sesión expirada", "no_autenticado");
  if (roles && !roles.includes(u.rol)) throw new ErrorApp(403, "No tienes permiso para esto", "prohibido");
  return u;
}

/** Para páginas (server components): redirige si no hay sesión vigente o rol. */
export async function exigirUsuarioPagina(roles) {
  const u = await usuarioActual();
  if (!u || !(await sigueVigente(u))) redirect("/login");
  if (roles && !roles.includes(u.rol)) redirect(u.rol === "super_admin" ? "/admin" : "/inicio");
  return u;
}
