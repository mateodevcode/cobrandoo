// Entrega al navegador un JWT corto de socket-core (la API key nunca sale del servidor).
import { manejar, ok, fallo } from "@/server/http";
import { exigirUsuario } from "@/server/auth/session";
import { ROLES_NEGOCIO } from "@/server/permisos";
import { socketActivo, tokenPara } from "@/server/socket";

export const POST = manejar(async () => {
  const yo = await exigirUsuario(ROLES_NEGOCIO);
  if (!socketActivo()) return fallo(503, "Tiempo real no configurado", "sin_socket");
  const t = await tokenPara(yo.id, yo.org);
  const res = ok(t);
  res.headers.set("Cache-Control", "private, no-store");
  return res;
});