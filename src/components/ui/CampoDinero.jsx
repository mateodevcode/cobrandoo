"use client";

import { useId } from "react";
import { cn } from "@/lib/cn";

const fmt = new Intl.NumberFormat("es-CO");

/** Input de pesos: muestra "1.250.000" mientras se escribe y entrega un número entero. */
export function CampoDinero({ etiqueta, valor, onCambio, error, ayuda, grande, className, autoFocus, name }) {
  const id = useId();
  return (
    <div className={cn("flex flex-col gap-1.5", className)}>
      {etiqueta && (
        <label htmlFor={id} className="text-xs font-semibold text-suave">
          {etiqueta}
        </label>
      )}
      <div className="relative">
        <span className={cn("pointer-events-none absolute top-1/2 left-3.5 -translate-y-1/2 font-semibold text-suave", grande && "text-2xl")}>$</span>
        <input
          id={id}
          name={name}
          inputMode="numeric"
          autoComplete="off"
          autoFocus={autoFocus}
          value={valor ? fmt.format(valor) : ""}
          onChange={(e) => onCambio(Number(e.target.value.replace(/\D/g, "")) || 0)}
          aria-invalid={error ? true : undefined}
          className={cn(
            "tabular w-full rounded-xl border border-borde bg-superficie pr-3.5 pl-8 font-semibold outline-none transition",
            "focus:border-primario focus:ring-4 focus:ring-primario/15 aria-[invalid=true]:border-peligro",
            grande ? "h-16 pl-10 text-3xl" : "h-11 text-base"
          )}
          placeholder="0"
        />
      </div>
      {(error || ayuda) && <p className={cn("text-xs", error ? "text-peligro" : "text-suave")}>{error || ayuda}</p>}
    </div>
  );
}
