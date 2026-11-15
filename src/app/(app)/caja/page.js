import Link from "next/link";
import { Suspense } from "react";
import { notFound } from "next/navigation";
import { ArrowLeft, ArrowDownLeft, ArrowUpRight } from "lucide-react";
import { z } from "zod";
import { exigirUsuarioPagina } from "@/server/auth/session";
import { ROLES_NEGOCIO } from "@/server/permisos";
import { resumenCaja } from "@/server/services/caja.service";
import { hoyBogota, esFecha, sumarDias } from "@/lib/fechas";
import { dinero, fecha } from "@/lib/formato";
import { NOMBRE_METODO_PAGO, CATEGORIAS_GASTO } from "@/lib/prestamos/constantes";
import { cn } from "@/lib/cn";
import { BotonGasto } from "./BotonGasto";

export const metadata = { title: "Caja" };

const NOMBRE_TIPO = {
  base: "Base recibida",
  cobro: "Cobro",
  desembolso: "Préstamo entregado",
  gasto: "Gasto",
  entrega: "Entrega al jefe",
  ajuste: "Ajuste",
  anulacion: "Anulación",
};
const NOMBRE_CATEGORIA = Object.fromEntries(CATEGORIAS_GASTO.map((c) => [c.id, c.nombre]));

export default async function PaginaCaja({ searchParams }) {
  const yo = await exigirUsuarioPagina(ROLES_NEGOCIO);
  const sp = await searchParams;
  const usuarioId = z.uuid().safeParse(sp.usuario).success ? sp.usuario : yo.id;
  const hoy = hoyBogota();
  const dia = esFecha(sp.fecha) && sp.fecha <= hoy ? sp.fecha : hoy;
  const caja = await resumenCaja(yo, usuarioId, dia).catch(() => null);
  if (!caja) notFound();
  const propia = usuarioId === yo.id;
  const t = caja.totales;
  const q = (f) => `/caja?${new URLSearchParams({ ...(propia ? {} : { usuario: usuarioId }), fecha: f })}`;

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-4">
      {!propia && (
        <Link href="/equipo" className="flex w-fit items-center gap-1 text-sm text-suave hover:text-texto">
          <ArrowLeft className="size-4" /> Equipo
        </Link>
      )}
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">{propia ? "Mi caja" : `Caja de ${caja.usuario.nombre}`}</h1>
          <div className="mt-1 flex items-center gap-2 text-sm">
            <Link href={q(sumarDias(dia, -1))} className="rounded-lg px-2 py-0.5 text-suave hover:bg-superficie" aria-label="Día anterior">
              ←
            </Link>
            <span className="font-medium">{dia === hoy ? "Hoy" : fecha(dia)}</span>
            {dia < hoy && (
              <Link href={q(sumarDias(dia, 1))} className="rounded-lg px-2 py-0.5 text-suave hover:bg-superficie" aria-label="Día siguiente">
                →
              </Link>
            )}
          </div>
        </div>
        {propia && dia === hoy && (
          <Suspense>
            <BotonGasto />
          </Suspense>
        )}
      </header>

      <section className="rounded-tarjeta bg-gradient-to-br from-marino-800 to-primario p-5 text-white shadow-tarjeta">
        <p className="text-sm text-white/75">Efectivo que debería tener</p>
        <p className="tabular text-4xl font-bold">{dinero(caja.efectivoEsperado)}</p>
        <p className="mt-1 text-xs text-white/75">Base + cobros en efectivo − préstamos entregados − gastos. Lo digital va aparte.</p>
        {caja.efectivoEsperado < 0 && (
          <p className="mt-3 rounded-xl bg-white/15 px-3 py-2 text-sm">
            La caja está en negativo: se prestó más efectivo del que había. {propia ? "Pídele la base del día a tu jefe." : "Entrégale la base del día."}
          </p>
        )}
        {caja.digital !== 0 && <p className="mt-3 text-sm">Digital (Nequi, Daviplata, transferencias): <span className="tabular font-semibold">{dinero(caja.digital)}</span></p>}
      </section>

      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <Cifra titulo="Base recibida" valor={t.base} />
        <Cifra titulo="Cobros" valor={t.cobro + t.anulacion} positivo />
        <Cifra titulo="Prestado" valor={t.desembolso} />
        <Cifra titulo="Gastos" valor={t.gasto} />
      </div>

      <section className="tarjeta p-5">
        <h2 className="mb-3 font-semibold">Movimientos</h2>
        {caja.movimientos.length === 0 ? (
          <p className="text-sm text-suave">Sin movimientos este día.</p>
        ) : (
          <ul className="divide-y divide-borde">
            {caja.movimientos.map((m) => (
              <li key={m.id} className="flex items-center gap-3 py-2.5">
                <span className={cn("flex size-9 shrink-0 items-center justify-center rounded-full", m.monto > 0 ? "bg-exito-suave text-exito" : "bg-peligro-suave text-peligro")}>
                  {m.monto > 0 ? <ArrowDownLeft className="size-4" /> : <ArrowUpRight className="size-4" />}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">
                    {NOMBRE_TIPO[m.tipo]}
                    {m.cliente_nombre && ` · ${m.cliente_nombre}`}
                    {m.categoria && ` · ${NOMBRE_CATEGORIA[m.categoria] ?? m.categoria}`}
                  </p>
                  <p className="truncate text-xs text-suave">
                    {new Date(m.creado_en).toLocaleTimeString("es-CO", { hour: "numeric", minute: "2-digit", timeZone: "America/Bogota" })} · {NOMBRE_METODO_PAGO[m.metodo]}
                    {m.descripcion && ` · ${m.descripcion}`}
                  </p>
                </div>
                <span className={cn("tabular text-sm font-bold", m.monto > 0 ? "text-exito" : "text-texto")}>
                  {m.monto > 0 ? "+" : "−"}
                  {dinero(Math.abs(m.monto))}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>
      <p className="text-center text-xs text-suave">El cierre del día y el cuadre con el supervisor llegan en la fase 4.</p>
    </div>
  );
}

function Cifra({ titulo, valor, positivo }) {
  return (
    <div className="tarjeta p-3">
      <p className="text-[11px] text-suave">{titulo}</p>
      <p className={cn("tabular font-bold", positivo && valor > 0 && "text-exito")}>{dinero(Math.abs(valor))}</p>
    </div>
  );
}
