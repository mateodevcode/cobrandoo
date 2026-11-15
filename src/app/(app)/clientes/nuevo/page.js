import { exigirUsuarioPagina } from "@/server/auth/session";
import { ROLES_NEGOCIO } from "@/server/permisos";
import { NuevoClienteLocal } from "./NuevoClienteLocal";

export const metadata = { title: "Nuevo cliente" };

// Funciona sin señal: usa los cobradores y rutas guardados en el teléfono.
export default async function NuevoCliente() {
  const yo = await exigirUsuarioPagina(ROLES_NEGOCIO);
  return <NuevoClienteLocal usuarioId={yo.id} esJefe={yo.rol !== "cobrador"} />;
}
