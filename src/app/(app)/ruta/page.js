import { Suspense } from "react";
import { exigirUsuarioPagina } from "@/server/auth/session";
import { ROLES_NEGOCIO } from "@/server/permisos";
import { RutaLocal } from "./RutaLocal";

export const metadata = { title: "Ruta de hoy" };

// La ruta se arma en el teléfono con los datos guardados: abre al instante y funciona sin señal.
export default async function PaginaRuta() {
  const yo = await exigirUsuarioPagina(ROLES_NEGOCIO);
  return (
    <Suspense>
      <RutaLocal usuario={{ id: yo.id, rol: yo.rol }} />
    </Suspense>
  );
}
