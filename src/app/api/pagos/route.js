import { after } from "next/server";
import { manejar, ok, leerJson, ipDe } from "@/server/http";
import { exigirUsuario } from "@/server/auth/session";
import { ROLES_NEGOCIO } from "@/server/permisos";
import { pagoSchema } from "@/lib/validacion-negocio";
import * as pagos from "@/server/services/pagos.service";
import { avisarActividad } from "@/server/services/notificaciones.service";

export const POST = manejar(async (req) => {
  const yo = await exigirUsuario(ROLES_NEGOCIO);
  const datos = pagoSchema.parse(await leerJson(req));
  const pago = await pagos.registrar(yo, datos, ipDe(req));
  // Los jefes ven el cobro al instante (después de responder, sin demorar al cobrador)
  if (!pago.duplicado) after(() => avisarActividad(yo.org, yo.id, { que: "pago", monto: pago.monto, cliente: pago.cliente_nombre, de: yo.nombre }));
  return ok({ pago }, { status: pago.duplicado ? 200 : 201 });
});