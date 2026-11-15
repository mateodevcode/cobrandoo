// JWT de acceso (corto) firmado con jose. Este archivo NO importa nada de Node
// para que también lo pueda usar src/proxy.js.
import { SignJWT, jwtVerify } from "jose";

export const ACCESS_TTL_SEG = 15 * 60; // 15 min
export const REFRESH_TTL_SEG = 30 * 24 * 60 * 60; // 30 días (permite trabajar offline y sincronizar luego)
export const COOKIE_ACCESS = "cb_at";
export const COOKIE_REFRESH = "cb_rt";

const ISSUER = "cobrandoo";
const AUDIENCE = "cobrandoo-app";

function secreto() {
  const s = process.env.JWT_SECRET;
  if (!s || s.length < 32) throw new Error("JWT_SECRET falta o es muy corto (mínimo 32 caracteres)");
  return new TextEncoder().encode(s);
}

/** @param {{id:string, rol:string, organizacion_id:string|null, nombre:string}} u */
export function firmarAcceso(u) {
  return new SignJWT({ rol: u.rol, org: u.organizacion_id, nombre: u.nombre })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(u.id)
    .setIssuer(ISSUER)
    .setAudience(AUDIENCE)
    .setIssuedAt()
    .setExpirationTime(`${ACCESS_TTL_SEG}s`)
    .sign(secreto());
}

/** Devuelve {id, rol, org, nombre} o null si el token no es válido / expiró. */
export async function verificarAcceso(token) {
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, secreto(), {
      issuer: ISSUER,
      audience: AUDIENCE,
      algorithms: ["HS256"],
    });
    return { id: payload.sub, rol: payload.rol, org: payload.org ?? null, nombre: payload.nombre };
  } catch {
    return null;
  }
}
