import { manejar, ok } from "@/server/http";
import { logout } from "@/server/services/auth.service";
import { borrarCookiesSesion } from "@/server/auth/cookies";
import { COOKIE_REFRESH } from "@/server/auth/tokens";

export const POST = manejar(async (req) => {
  await logout(req.cookies.get(COOKIE_REFRESH)?.value);
  return borrarCookiesSesion(ok(null));
});
