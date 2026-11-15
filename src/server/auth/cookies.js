import "server-only";
import { ACCESS_TTL_SEG, REFRESH_TTL_SEG, COOKIE_ACCESS, COOKIE_REFRESH } from "./tokens";

const base = {
  httpOnly: true,
  secure: process.env.NODE_ENV === "production",
  sameSite: "lax",
};

/** Escribe las cookies de sesión en una NextResponse. */
export function ponerCookiesSesion(res, { access, refresh }) {
  res.cookies.set(COOKIE_ACCESS, access, { ...base, path: "/", maxAge: ACCESS_TTL_SEG });
  // El refresh solo viaja a /api/auth (refresh/logout), nunca al resto de peticiones.
  res.cookies.set(COOKIE_REFRESH, refresh, { ...base, path: "/api/auth", maxAge: REFRESH_TTL_SEG });
  return res;
}

export function borrarCookiesSesion(res) {
  res.cookies.set(COOKIE_ACCESS, "", { ...base, path: "/", maxAge: 0 });
  res.cookies.set(COOKIE_REFRESH, "", { ...base, path: "/api/auth", maxAge: 0 });
  return res;
}
