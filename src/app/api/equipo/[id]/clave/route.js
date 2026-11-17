import { z } from "zod";
import { manejar, ok, leerJson, ipDe } from "@/server/http";
import { exigirUsuario } from "@/server/auth/session";
import { password } from "@/lib/validacion";
import { cambiarClaveComoDueno } from "@/server/services/admin.service";

// El dueño cambia la contraseña de alguien de su organización (otros dueños incluidos)
export const POST = manejar(async (req, { params }) => {
  const yo = await exigirUsuario(["dueno"]);
  const id = z.uuid().parse((await params).id);
  const datos = z.object({ password }).parse(await leerJson(req));
  return ok(await cambiarClaveComoDueno(yo, id, datos.password, ipDe(req)));
});
