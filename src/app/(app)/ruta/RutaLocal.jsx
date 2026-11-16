"use client";

import { useMemo } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useSync, useVista } from "@/lib/offline/hooks";
import { rutaDe } from "@/lib/offline/vista";
import { fechaHoy } from "@/lib/formato";
import { CargandoDatos } from "@/components/offline/CargandoDatos";
import { ListaRuta } from "./ListaRuta";

export function RutaLocal({ usuario }) {
  const params = useSearchParams();
  const { datos } = useSync();
  const vista = useVista();
  const esCobrador = usuario.rol === "cobrador";
  const cobradores = datos?.cobradores ?? [];
  const cobradorId = esCobrador ? usuario.id : cobradores.find((c) => c.id === params.get("cobrador"))?.id;
  const clientes = useMemo(() => (cobradorId ? rutaDe(vista, cobradorId) : []), [vista, cobradorId]);
  const nombreCobrador = !esCobrador && cobradores.find((c) => c.id === cobradorId)?.nombre;

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-4">
      <header>
        <p className="text-sm text-suave first-letter:uppercase">{fechaHoy()}</p>
        <h1 className="text-2xl font-bold">Ruta de hoy{nombreCobrador && ` · ${nombreCobrador}`}</h1>
      </header>

      {esCobrador && datos?.caja?.cerrada && datos.caja.fecha === vista?.hoy && (
        <p className="rounded-2xl bg-fondo p-3 text-sm text-suave">🔒 Ya cerraste el día. Los cobros de hoy quedaron entregados a tu jefe.</p>
      )}
      {!vista ? (
        <CargandoDatos />
      ) : (
        <>
          {!esCobrador && (
            <div className="flex gap-2 overflow-x-auto pb-1 [scrollbar-width:none]">
              {cobradores.length === 0 && <p className="text-sm text-suave">No tienes cobradores a cargo.</p>}
              {cobradores.map((c) => (
                <Link
                  key={c.id}
                  href={`/ruta?cobrador=${c.id}`}
                  className={`shrink-0 rounded-full border px-3.5 py-1.5 text-sm font-medium ${c.id === cobradorId ? "border-primario bg-primario text-white" : "border-borde bg-superficie"}`}
                >
                  {c.nombre}
                </Link>
              ))}
            </div>
          )}
          {cobradorId ? (
            <ListaRuta clientes={clientes} puedeOrdenar />
          ) : (
            <div className="tarjeta p-10 text-center text-sm text-suave">Elige un cobrador para ver su ruta.</div>
          )}
        </>
      )}
    </div>
  );
}
