import Link from "next/link";
import { Suspense } from "react";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { z } from "zod";
import { exigirUsuarioPagina } from "@/server/auth/session";
import { ROLES_NEGOCIO } from "@/server/permisos";
import { resumenCaja } from "@/server/services/caja.service";
import { hoyBogota, esFecha, sumarDias } from "@/lib/fechas";
import { fecha } from "@/lib/formato";
import { VistaCaja } from "@/components/negocio/VistaCaja";
import { CajaLocal } from "./CajaLocal";

export const metadata = { title: "Caja" };

export default async function PaginaCaja({ searchParams }) {
  const yo = await exigirUsuarioPagina(ROLES_NEGOCIO);
  const sp = await searchParams;
  const hoy = hoyBogota();
  const otroUsuario = z.uuid().safeParse(sp.usuario).success && sp.usuario !== yo.id ? sp.usuario : null;
  const otroDia = esFecha(sp.fecha) && sp.fecha < hoy ? sp.fecha : null;

  // Mi caja de hoy: se calcula en el teléfono (abre al instante y funciona sin señal)
  if (!otroUsuario && !otroDia) {
    return (
      <div className="mx-auto flex max-w-3xl flex-col gap-4">
        <Suspense>
          <CajaLocal usuarioId={yo.id} />
        </Suspense>
      </div>
    );
  }

  // Otros días u otras personas: desde el servidor (necesita internet)
  const usuarioId = otroUsuario ?? yo.id;
  const dia = otroDia ?? hoy;
  const caja = await resumenCaja(yo, usuarioId, dia).catch(() => null);
  if (!caja) notFound();
  const propia = usuarioId === yo.id;
  const q = (f) => `/caja?${new URLSearchParams({ ...(propia ? {} : { usuario: usuarioId }), fecha: f })}`;

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-4">
      {!propia && (
        <Link href="/equipo" className="flex w-fit items-center gap-1 text-sm text-suave hover:text-texto">
          <ArrowLeft className="size-4" /> Equipo
        </Link>
      )}
      <VistaCaja
        caja={caja}
        propia={propia}
        titulo={propia ? "Mi caja" : `Caja de ${caja.usuario.nombre}`}
        navegacion={
          <>
            <Link href={q(sumarDias(dia, -1))} className="rounded-lg px-2 py-0.5 text-suave hover:bg-superficie" aria-label="Día anterior">
              ←
            </Link>
            <span className="font-medium">{dia === hoy ? "Hoy" : fecha(dia)}</span>
            {dia < hoy && (
              <Link href={sumarDias(dia, 1) === hoy && propia ? "/caja" : q(sumarDias(dia, 1))} className="rounded-lg px-2 py-0.5 text-suave hover:bg-superficie" aria-label="Día siguiente">
                →
              </Link>
            )}
          </>
        }
      />
    </div>
  );
}
