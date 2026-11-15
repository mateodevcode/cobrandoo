"use client";

import { cn } from "@/lib/cn";

/** Selector de una opción con botones tipo "chip". */
export function Chips({ opciones, valor, onCambio, etiqueta, className }) {
  return (
    <div className={cn("flex flex-col gap-1.5", className)}>
      {etiqueta && <span className="text-xs font-semibold text-suave">{etiqueta}</span>}
      <div className="flex flex-wrap gap-2" role="radiogroup" aria-label={etiqueta}>
        {opciones.map((o) => (
          <button
            key={o.id}
            type="button"
            role="radio"
            aria-checked={valor === o.id}
            onClick={() => onCambio(o.id)}
            className={cn(
              "rounded-full border px-3.5 py-1.5 text-sm font-medium transition-colors",
              valor === o.id ? "border-primario bg-primario text-white" : "border-borde bg-superficie text-texto hover:bg-fondo"
            )}
          >
            {o.nombre}
          </button>
        ))}
      </div>
    </div>
  );
}
