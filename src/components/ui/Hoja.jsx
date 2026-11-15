"use client";

import { useEffect } from "react";
import { X } from "lucide-react";
import { cn } from "@/lib/cn";

/** Panel modal: hoja inferior en celular, ventana centrada en escritorio. */
export function Hoja({ abierta, onCerrar, titulo, descripcion, children, className }) {
  useEffect(() => {
    if (!abierta) return;
    const onKey = (e) => e.key === "Escape" && onCerrar();
    document.addEventListener("keydown", onKey);
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = overflow;
    };
  }, [abierta, onCerrar]);

  if (!abierta) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center" role="dialog" aria-modal="true" aria-label={titulo}>
      <button className="absolute inset-0 bg-marino-900/50 backdrop-blur-[2px]" onClick={onCerrar} aria-label="Cerrar" tabIndex={-1} />
      <div
        className={cn(
          "relative max-h-[92dvh] w-full overflow-y-auto rounded-t-3xl bg-superficie p-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] shadow-2xl",
          "sm:max-w-lg sm:rounded-3xl sm:p-6",
          className
        )}
      >
        <div className="mx-auto mb-3 h-1.5 w-10 rounded-full bg-borde sm:hidden" />
        <div className="mb-4 flex items-start gap-3">
          <div className="min-w-0 flex-1">
            <h2 className="text-lg font-bold">{titulo}</h2>
            {descripcion && <p className="mt-0.5 text-sm text-suave">{descripcion}</p>}
          </div>
          <button onClick={onCerrar} className="rounded-full p-1.5 text-suave hover:bg-fondo" aria-label="Cerrar">
            <X className="size-5" />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}
