"use client";

import { useEffect, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Search } from "lucide-react";

/** Búsqueda que se refleja en la URL (?q=) con una pequeña espera al escribir. */
export function Buscador({ placeholder = "Buscar…" }) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const [q, setQ] = useState(params.get("q") ?? "");

  useEffect(() => {
    const t = setTimeout(() => {
      const actual = params.get("q") ?? "";
      if (q === actual) return;
      const p = new URLSearchParams(params);
      if (q) p.set("q", q);
      else p.delete("q");
      router.replace(`${pathname}?${p}`, { scroll: false });
    }, 300);
    return () => clearTimeout(t);
  }, [q, params, pathname, router]);

  return (
    <label className="relative block">
      <Search className="pointer-events-none absolute top-1/2 left-3.5 size-4 -translate-y-1/2 text-suave" />
      <input
        type="search"
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder={placeholder}
        className="h-11 w-full rounded-xl border border-borde bg-superficie pr-3 pl-10 text-sm outline-none focus:border-primario focus:ring-4 focus:ring-primario/15"
      />
    </label>
  );
}
