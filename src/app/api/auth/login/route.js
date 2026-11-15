import { manejar, ok, leerJson, ipDe } from "@/server/http";
import { loginSchema } from "@/lib/validacion";
import { login } from "@/server/services/auth.service";
import { ponerCookiesSesion } from "@/server/auth/cookies";

export const POST = manejar(async (req) => {
  const datos = loginSchema.parse(await leerJson(req));
  const { tokens, usuario } = await login({
    ...datos,
    userAgent: req.headers.get("user-agent"),
    ip: ipDe(req),
  });
  return ponerCookiesSesion(ok({ usuario }), tokens);
});
