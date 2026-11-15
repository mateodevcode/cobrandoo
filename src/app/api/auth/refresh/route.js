import { manejar, ok, ipDe, ErrorApp, fallo } from "@/server/http";
import { refrescar } from "@/server/services/auth.service";
import { ponerCookiesSesion, borrarCookiesSesion } from "@/server/auth/cookies";
import { COOKIE_REFRESH } from "@/server/auth/tokens";

export const POST = manejar(async (req) => {
  try {
    const { tokens, usuario } = await refrescar({
      refresh: req.cookies.get(COOKIE_REFRESH)?.value,
      userAgent: req.headers.get("user-agent"),
      ip: ipDe(req),
    });
    return ponerCookiesSesion(ok({ usuario }), tokens);
  } catch (err) {
    // Sesión muerta: limpia cookies para que el cliente vaya al login.
    if (err instanceof ErrorApp && err.status === 401) {
      return borrarCookiesSesion(fallo(401, err.message, err.codigo));
    }
    throw err;
  }
});
