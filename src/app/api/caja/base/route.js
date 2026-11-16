import { after } from "next/server";
import { manejar, ok, leerJson, ipDe } from "@/server/http";
import { exigirUsuario } from "@/server/auth/session";
import { baseSchema } from "@/lib/validacion-negocio";
import { dinero } from "@/lib/formato";
import * as caja from "@/server/services/caja.service";
import { notificar } from "@/server/services/notificaciones.service";

export const POST = manejar(async (req) => {
  const yo = await exigirUsuario(["dueno", "supervisor"]);
  const datos = baseSchema.parse(await leerJson(req));
  const r = await caja.entregarBase(yo, datos, ipDe(req));
  if (!r.duplicado) {
    after(() =>
      notificar({
        organizacionId: yo.org,
        usuarioIds: [r.cobradorId],
        tipo: "caja.base",
        titulo: `Recibiste base de ${dinero(datos.monto)}`,
        cuerpo: `${yo.nombre} te entregó la base del día.`,
        url: "/caja",
      })
    );
  }
  return ok(r, { status: 201 });
});