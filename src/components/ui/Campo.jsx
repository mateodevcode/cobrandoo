"use client";

import { useId } from "react";
import { cn } from "@/lib/cn";

const control =
  "h-11 w-full rounded-xl border border-borde bg-superficie px-3.5 text-sm text-texto placeholder:text-suave/70 " +
  "outline-none transition focus:border-primario focus:ring-4 focus:ring-primario/15 " +
  "aria-[invalid=true]:border-peligro aria-[invalid=true]:ring-peligro/15 disabled:bg-fondo";

/** Input con etiqueta, ayuda y error. */
export function Campo({ etiqueta, error, ayuda, className, as = "input", children, ...props }) {
  const id = useId();
  const Control = as;
  return (
    <div className={cn("flex flex-col gap-1.5", className)}>
      {etiqueta && (
        <label htmlFor={id} className="text-xs font-semibold text-suave">
          {etiqueta}
        </label>
      )}
      <Control
        id={id}
        aria-invalid={error ? true : undefined}
        aria-describedby={error || ayuda ? `${id}-ayuda` : undefined}
        className={control}
        {...props}
      >
        {children}
      </Control>
      {(error || ayuda) && (
        <p id={`${id}-ayuda`} className={cn("text-xs", error ? "text-peligro" : "text-suave")}>
          {error || ayuda}
        </p>
      )}
    </div>
  );
}
