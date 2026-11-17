import { z } from "zod";
import { manejar, ok, leerJson, ipDe } from "@/server/http";
import { exigirUsuario } from "@/server/auth/session";
import { moverRuta } from "@/server/services/asignacion.service";

// Pasa una ruta completa (con todos sus clientes) a otro cobrador
export const POST = manejar(async (req) => {
  const yo = await exigirUsuario(["dueno", "supervisor"]);
  const datos = z.object({ ruta_id: z.uuid(), cobrador_id: z.uuid() }).parse(await leerJson(req));
  return ok(await moverRuta(yo, datos, ipDe(req)));
});
