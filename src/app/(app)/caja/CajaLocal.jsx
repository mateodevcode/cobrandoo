"use client";

import Link from "next/link";
import { useVista } from "@/lib/offline/hooks";
import { cajaDe } from "@/lib/offline/vista";
import { sumarDias } from "@/lib/fechas";
import { VistaCaja } from "@/components/negocio/VistaCaja";
import { CargandoDatos } from "@/components/offline/CargandoDatos";
import { BotonGasto } from "./BotonGasto";
import { BotonCapital } from "./BotonCapital";
import { CierreDia } from "./CierreDia";

export function CajaLocal({ usuarioId, rol }) {
  const vista = useVista();
  const caja = cajaDe(vista, usuarioId);
  if (!caja) return <CargandoDatos />;
  const cierraDia = rol === "cobrador" || rol === "supervisor";
  return (
    <>
      <VistaCaja
        caja={caja}
        propia
        rol={rol}
        titulo="Mi caja"
        navegacion={
          <>
            <Link href={`/caja?fecha=${sumarDias(caja.fecha, -1)}`} className="rounded-lg px-2 py-0.5 text-suave hover:bg-superficie" aria-label="Día anterior">
              ←
            </Link>
            <span className="font-medium">Hoy</span>
            {cierraDia && (
              <Link href="/caja/cierres" className="ml-2 text-xs font-semibold text-primario">
                Mis cierres
              </Link>
            )}
          </>
        }
        accion={
          caja.cerrada ? null : (
            <div className="flex flex-wrap gap-2">
              {rol === "dueno" && <BotonCapital />}
              <BotonGasto />
            </div>
          )
        }
      />
      {cierraDia && <CierreDia rol={rol} />}
    </>
  );
}
