import { Loader2 } from "lucide-react";
import { cn } from "@/lib/cn";

const variantes = {
  primario: "bg-primario text-white hover:bg-primario-oscuro shadow-sm",
  secundario: "bg-superficie text-texto border border-borde hover:bg-fondo",
  acento: "bg-acento-oscuro text-white hover:bg-acento-oscuro/90",
  peligro: "bg-peligro text-white hover:bg-peligro/90",
  fantasma: "text-suave hover:bg-fondo hover:text-texto",
};

const tamanos = {
  sm: "h-8 px-3 text-xs",
  md: "h-10 px-4 text-sm",
  lg: "h-12 px-5 text-base",
};

export function Boton({ variante = "primario", tamano = "md", cargando, className, children, disabled, ...props }) {
  return (
    <button
      className={cn(
        "inline-flex items-center justify-center gap-2 rounded-xl font-semibold transition-colors",
        "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primario",
        "disabled:pointer-events-none disabled:opacity-60",
        variantes[variante],
        tamanos[tamano],
        className
      )}
      disabled={disabled || cargando}
      {...props}
    >
      {cargando && <Loader2 className="size-4 animate-spin" aria-hidden />}
      {children}
    </button>
  );
}
