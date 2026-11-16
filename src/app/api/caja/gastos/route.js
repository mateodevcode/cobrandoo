import { after } from "next/server";
import { manejar, ok, leerJson, ipDe } from "@/server/http";
import { exigirUsuario } from "@/server/auth/session";
import { ROLES_NEGOCIO } from "@/server/permisos";
import { gastoSchema } from "@/lib/validacion-negocio";
import * as caja from "@/server/services/caja.service";
import { avisarActividad } from "@/server/services/notificaciones.service";

export const POST = manejar(async (req) => {
  const yo = await exigirUsuario(ROLES_NEGOCIO);
  const datos = gastoSchema.parse(await leerJson(req));
  const r = await caja.registrarGasto(yo, datos, ipDe(req));
  if (!r.duplicado) after(() => avisarActividad(yo.org, yo.id, { que: "gasto", monto: datos.monto, de: yo.nombre }));
  return ok(r, { status: 201 });
});