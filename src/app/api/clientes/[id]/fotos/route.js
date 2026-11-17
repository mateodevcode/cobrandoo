import { z } from "zod";
import { manejar, ok, ipDe, ErrorApp } from "@/server/http";
import { exigirUsuario } from "@/server/auth/session";
import { ROLES_NEGOCIO } from "@/server/permisos";
import { subirFoto, TIPOS_FOTO } from "@/server/services/fotos.service";

const campos = z.object({ id: z.uuid(), tipo: z.enum(TIPOS_FOTO) });

// Sube una foto del cliente (multipart: id, tipo, archivo). La envía la cola del teléfono.
export const POST = manejar(async (req, { params }) => {
  const yo = await exigirUsuario(ROLES_NEGOCIO);
  const clienteId = z.uuid().parse((await params).id);
  const form = await req.formData().catch(() => {
    throw new ErrorApp(400, "Se esperaba un formulario con la foto", "formulario_invalido");
  });
  const datos = campos.parse({ id: form.get("id"), tipo: form.get("tipo") });
  const archivo = form.get("archivo");
  if (!archivo || typeof archivo === "string") throw new ErrorApp(400, "Falta la foto", "foto_requerida");
  return ok(await subirFoto(yo, clienteId, { ...datos, archivo }, ipDe(req)), { status: 201 });
});
