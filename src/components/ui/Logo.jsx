import { cn } from "@/lib/cn";

/** Marca de Cobrandoo: el mismo dibujo del ícono de la app (cuadro turquesa con la "C"). */
export function Logo({ className }) {
  return (
    <svg viewBox="96 96 320 320" className={cn("size-8 shrink-0", className)} aria-hidden="true" focusable="false">
      <rect x="96" y="96" width="320" height="320" rx="88" fill="#14b8a6" />
      <path d="M318 206a78 78 0 1 0 0 100" fill="none" stroke="#0b1b33" strokeWidth="44" strokeLinecap="round" />
    </svg>
  );
}
