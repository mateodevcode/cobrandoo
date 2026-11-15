import { Suspense } from "react";
import { exigirUsuarioPagina } from "@/server/auth/session";
import { ROLES_NEGOCIO } from "@/server/permisos";
import { NuevoPrestamoLocal } from "./NuevoPrestamoLocal";

export const metadata = { title: "Nuevo préstamo" };

// Funciona sin señal: usa los clientes guardados en el teléfono (incluidos los aún no enviados).
export default async function NuevoPrestamo() {
  await exigirUsuarioPagina(ROLES_NEGOCIO);
  return (
    <Suspense>
      <NuevoPrestamoLocal />
    </Suspense>
  );
}
