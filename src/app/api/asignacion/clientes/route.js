import { z } from "zod";
import { manejar, ok, leerJson, ipDe } from "@/server/http";
import { exigirUsuario } from "@/server/auth/session";
import { moverClientes } from "@/server/services/asignacion.service";

const esquema = z.object({
  clientes: z.array(z.uuid()).min(1).max(500),
  cobrador_id: z.uuid(),
  ruta_id: z.uuid().nullish(),
});

// Pasa uno o varios clientes (con sus préstamos activos) a otro cobrador
export const POST = manejar(async (req) => {
  const yo = await exigirUsuario(["dueno", "supervisor"]);
  return ok(await moverClientes(yo, esquema.parse(await leerJson(req)), ipDe(req)));
});
