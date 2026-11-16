"use client";

import { useEffect, useId, useRef, useSyncExternalStore } from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";
import { cn } from "@/lib/cn";

const sinSuscripcion = () => () => {};
/** true solo en el navegador ya montado (en el servidor y al hidratar: false). */
const useMontado = () => useSyncExternalStore(sinSuscripcion, () => true, () => false);

/**
 * Panel modal. Se dibuja en <body> (portal) para quedar SIEMPRE por encima de todo,
 * aunque se abra desde la barra lateral u otro contenedor con su propia capa.
 * - Por defecto: hoja inferior en celular, ventana centrada en escritorio.
 * - `centrado`: ventana pequeña centrada en todas las pantallas (confirmaciones).
 */
export function Hoja({ abierta, onCerrar, titulo, descripcion, children, className, centrado, rol = "dialog" }) {
  const montado = useMontado();
  const idTitulo = useId();
  const panel = useRef(null);
  const contenedor = useRef(null);

  useEffect(() => {
    if (!abierta) return;
    // Escape cierra solo el modal de más arriba (si hay uno abierto encima de otro)
    const onKey = (e) => {
      if (e.key !== "Escape") return;
      const abiertos = document.querySelectorAll('[aria-modal="true"]');
      if (abiertos[abiertos.length - 1] === contenedor.current) onCerrar();
    };
    document.addEventListener("keydown", onKey);
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    // Enfoca el primer control (o el panel) para que el teclado y lectores de pantalla entren al modal
    const t = setTimeout(() => {
      const el = panel.current;
      if (el && !el.contains(document.activeElement)) {
        (el.querySelector("[autofocus], [data-autofocus]") ?? el).focus();
      }
    }, 0);
    return () => {
      clearTimeout(t);
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = overflow;
    };
  }, [abierta, onCerrar]);

  if (!abierta || !montado) return null;
  return createPortal(
    <div
      ref={contenedor}
      className={cn("fixed inset-0 z-[100] flex justify-center", centrado ? "items-center p-4" : "items-end sm:items-center")}
      role={rol}
      aria-modal="true"
      aria-labelledby={idTitulo}
    >
      <button className="absolute inset-0 bg-marino-900/50 backdrop-blur-[2px]" onClick={onCerrar} aria-label="Cerrar" tabIndex={-1} />
      <div
        ref={panel}
        tabIndex={-1}
        className={cn(
          "relative max-h-[92dvh] w-full overflow-y-auto bg-superficie shadow-2xl outline-none",
          centrado
            ? "max-w-sm rounded-3xl p-6"
            : "rounded-t-3xl p-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] sm:max-w-lg sm:rounded-3xl sm:p-6",
          className
        )}
      >
        {!centrado && <div className="mx-auto mb-3 h-1.5 w-10 rounded-full bg-borde sm:hidden" />}
        <div className="mb-4 flex items-start gap-3">
          <div className="min-w-0 flex-1">
            <h2 id={idTitulo} className="text-lg font-bold">
              {titulo}
            </h2>
            {descripcion && <p className="mt-0.5 text-sm text-suave">{descripcion}</p>}
          </div>
          <button onClick={onCerrar} className="rounded-full p-1.5 text-suave hover:bg-fondo" aria-label="Cerrar">
            <X className="size-5" />
          </button>
        </div>
        {children}
      </div>
    </div>,
    document.body
  );
}
