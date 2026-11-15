import { cn } from "@/lib/cn";
import { iniciales } from "@/lib/formato";

const tonos = {
  exito: "bg-exito-suave text-exito",
  alerta: "bg-alerta-suave text-alerta",
  peligro: "bg-peligro-suave text-peligro",
  info: "bg-primario-suave text-primario",
  acento: "bg-acento-suave text-acento-oscuro",
  neutro: "bg-fondo text-suave",
};

export function Insignia({ tono = "neutro", className, children }) {
  return (
    <span className={cn("inline-flex items-center rounded-full px-2.5 py-0.5 text-[11px] font-semibold", tonos[tono], className)}>
      {children}
    </span>
  );
}

export function Avatar({ nombre, className }) {
  return (
    <span
      aria-hidden
      className={cn(
        "inline-flex size-10 shrink-0 items-center justify-center rounded-full bg-primario-suave text-xs font-bold text-primario",
        className
      )}
    >
      {iniciales(nombre)}
    </span>
  );
}
