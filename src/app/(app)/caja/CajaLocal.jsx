"use client";

import Link from "next/link";
import { useVista } from "@/lib/offline/hooks";
import { cajaDe } from "@/lib/offline/vista";
import { sumarDias } from "@/lib/fechas";
import { VistaCaja } from "@/components/negocio/VistaCaja";
import { CargandoDatos } from "@/components/offline/CargandoDatos";
import { BotonGasto } from "./BotonGasto";
import { CierreDia } from "./CierreDia";

export function CajaLocal({ usuarioId, esCobrador }) {
  const vista = useVista();
  const caja = cajaDe(vista, usuarioId);
  if (!caja) return <CargandoDatos />;
  return (
    <>
      <VistaCaja
        caja={caja}
        propia
        titulo="Mi caja"
        navegacion={
          <>
            <Link href={`/caja?fecha=${sumarDias(caja.fecha, -1)}`} className="rounded-lg px-2 py-0.5 text-suave hover:bg-superficie" aria-label="Día anterior">
              ←
            </Link>
            <span className="font-medium">Hoy</span>
            {esCobrador && (
              <Link href="/caja/cierres" className="ml-2 text-xs font-semibold text-primario">
                Mis cierres
              </Link>
            )}
          </>
        }
        accion={caja.cerrada ? null : <BotonGasto />}
      />
      {esCobrador && <CierreDia />}
    </>
  );
}
