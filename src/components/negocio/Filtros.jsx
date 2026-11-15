"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { cn } from "@/lib/cn";

/** Pestañas de filtro que escriben un parámetro en la URL. */
export function Filtros({ parametro, opciones }) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const actual = params.get(parametro) ?? opciones[0].id;

  function elegir(id) {
    const p = new URLSearchParams(params);
    if (id === opciones[0].id) p.delete(parametro);
    else p.set(parametro, id);
    router.replace(`${pathname}?${p}`, { scroll: false });
  }

  return (
    <div className="flex gap-1 overflow-x-auto rounded-xl bg-superficie p-1 shadow-tarjeta [scrollbar-width:none]">
      {opciones.map((o) => (
        <button
          key={o.id}
          onClick={() => elegir(o.id)}
          className={cn(
            "shrink-0 rounded-lg px-3 py-1.5 text-sm font-medium transition-colors",
            actual === o.id ? "bg-primario text-white" : "text-suave hover:text-texto"
          )}
        >
          {o.nombre}
          {o.n !== undefined && <span className="ml-1 opacity-70">{o.n}</span>}
        </button>
      ))}
    </div>
  );
}
