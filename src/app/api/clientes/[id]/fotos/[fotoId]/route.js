import { z } from "zod";
import { manejar, ok, ipDe } from "@/server/http";
import { exigirUsuario } from "@/server/auth/session";
import { quitarFoto } from "@/server/services/fotos.service";

export const DELETE = manejar(async (req, { params }) => {
  const yo = await exigirUsuario(["dueno", "supervisor"]);
  const p = await params;
  return ok(await quitarFoto(yo, z.uuid().parse(p.id), z.uuid().parse(p.fotoId), ipDe(req)));
});
