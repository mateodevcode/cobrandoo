"use client";

import { CloudOff, Loader2 } from "lucide-react";
import { useSync } from "@/lib/offline/hooks";

/** Se muestra mientras el teléfono aún no tiene datos descargados. */
export function CargandoDatos() {
  const s = useSync();
  const sinSenal = s.listo && !s.enLinea && !s.datos;
  return (
    <div className="tarjeta flex flex-col items-center gap-3 p-10 text-center text-sm text-suave">
      {sinSenal ? <CloudOff className="size-6 text-alerta" /> : <Loader2 className="size-6 animate-spin text-primario" />}
      {sinSenal
        ? "Este teléfono todavía no tiene datos guardados. Conéctate a internet una vez para descargarlos."
        : "Descargando tus datos…"}
    </div>
  );
}
