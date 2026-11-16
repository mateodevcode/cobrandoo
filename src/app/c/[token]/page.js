import { headers } from "next/headers";
import { notFound } from "next/navigation";
import { CheckCircle2, Clock } from "lucide-react";
import { historialPorToken, limiteVisitas } from "@/server/services/publico.service";
import { METODOS } from "@/lib/prestamos/metodos";
import { NOMBRE_METODO_PAGO } from "@/lib/prestamos/constantes";
import { dinero, fecha } from "@/lib/formato";
import { cn } from "@/lib/cn";

export const metadata = {
  title: "Mi historial",
  robots: { index: false, follow: false },
};

const TONO = {
  pagada: "bg-exito-suave text-exito",
  vencida: "bg-peligro-suave text-peligro",
  hoy: "bg-alerta-suave text-alerta ring-2 ring-alerta/40",
  parcial: "bg-primario-suave text-primario",
  pendiente: "bg-fondo text-suave",
};

// Página pública (sin cuenta): el cliente ve sus préstamos y abonos con su link secreto.
export default async function HistorialCliente({ params }) {
  const h = await headers();
  const ip = h.get("x-forwarded-for")?.split(",")[0].trim() ?? "local";
  if (!limiteVisitas(ip)) {
    return <Mensaje titulo="Demasiadas visitas" texto="Espera un minuto y vuelve a intentar." />;
  }
  const { token } = await params;
  const datos = await historialPorToken(token);
  if (!datos) notFound();
  const { cliente, prestamos } = datos;
  const activos = prestamos.filter((p) => p.estado === "activo");
  const debe = activos.reduce((s, p) => s + p.saldo, 0);

  return (
    <main className="mx-auto flex min-h-dvh max-w-xl flex-col gap-4 px-4 py-6">
      <header className="flex items-center gap-2.5">
        <span className="size-7 rounded-lg bg-acento" />
        <span className="font-bold">{cliente.organizacion}</span>
      </header>

      <section className="rounded-tarjeta bg-gradient-to-br from-marino-800 to-primario p-5 text-white shadow-tarjeta">
        <p className="text-sm text-white/75">Hola, {cliente.nombre.split(" ")[0]}</p>
        <p className="mt-2 text-sm text-white/75">{activos.length ? "Debes en total" : "No tienes deudas pendientes"}</p>
        <p className="tabular text-4xl font-bold">{dinero(debe)}</p>
        {activos.some((p) => p.sugerido_hoy > 0) && (
          <p className="mt-2 text-sm">
            Para quedar al día hoy: <span className="tabular font-semibold">{dinero(activos.reduce((s, p) => s + p.sugerido_hoy, 0))}</span>
          </p>
        )}
        <p className="mt-3 text-xs text-white/60">
          Tu cobrador: {cliente.cobrador}. Datos actualizados al {fecha(datos.hoy)}.
        </p>
      </section>

      {prestamos.length === 0 && (
        <div className="tarjeta p-8 text-center text-sm text-suave">Aún no tienes préstamos registrados.</div>
      )}

      {prestamos.map((p) => {
        const avance = p.total_cargado ? Math.min(100, Math.round((p.total_pagado / p.total_cargado) * 100)) : 0;
        return (
          <section key={p.id} className="tarjeta flex flex-col gap-4 p-5">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h2 className="font-bold">Préstamo de {dinero(p.capital)}</h2>
                <p className="text-xs text-suave">
                  {METODOS[p.metodo]?.nombre} · {Number(p.tasa)} % · desde {fecha(p.fecha_inicio)}
                </p>
              </div>
              {p.estado === "pagado" ? (
                <span className="flex items-center gap-1 rounded-full bg-exito-suave px-2.5 py-1 text-xs font-semibold text-exito">
                  <CheckCircle2 className="size-3.5" /> Pagado
                </span>
              ) : p.dias_atraso > 0 ? (
                <span className="rounded-full bg-peligro-suave px-2.5 py-1 text-xs font-semibold text-peligro">{p.dias_atraso} días de atraso</span>
              ) : (
                <span className="rounded-full bg-primario-suave px-2.5 py-1 text-xs font-semibold text-primario">Al día</span>
              )}
            </div>

            <div>
              <div className="flex justify-between text-sm">
                <span className="text-suave">Has pagado {dinero(p.total_pagado)}</span>
                {p.estado === "activo" && <span className="tabular font-semibold">Debes {dinero(p.saldo)}</span>}
              </div>
              <div className="mt-2 h-2 rounded-full bg-fondo">
                <div className="h-full rounded-full bg-acento" style={{ width: `${avance}%` }} />
              </div>
            </div>

            {p.proxima && p.estado === "activo" && (
              <p className={cn("flex items-center gap-2 rounded-xl p-3 text-sm", p.proxima.fecha < datos.hoy ? "bg-peligro-suave text-peligro" : "bg-fondo")}>
                <Clock className="size-4 shrink-0" />
                {p.proxima.fecha < datos.hoy ? (
                  <span>
                    Tienes cuotas atrasadas desde el <span className="font-semibold">{fecha(p.proxima.fecha)}</span>.
                  </span>
                ) : (
                  <span>
                    Próxima cuota: <span className="font-semibold">{dinero(p.proxima.monto)}</span> el {fecha(p.proxima.fecha)}
                  </span>
                )}
              </p>
            )}
            {p.saldo_recargo > 0 && p.estado === "activo" && (
              <p className="text-xs text-peligro">Incluye {dinero(p.saldo_recargo)} de recargos por atraso.</p>
            )}

            {p.cuotas.length > 0 && (
              <ul className="grid grid-cols-5 gap-1.5 sm:grid-cols-8" aria-label="Cuotas">
                {p.cuotas.map((c) => (
                  <li key={c.numero} className={cn("rounded-lg py-1.5 text-center", TONO[c.estado])} title={`${fecha(c.fecha)} · ${dinero(c.monto)}`}>
                    <p className="text-[10px] opacity-80">#{c.numero}</p>
                    <p className="text-[11px] font-bold">
                      {c.fecha.slice(8)}/{c.fecha.slice(5, 7)}
                    </p>
                  </li>
                ))}
              </ul>
            )}

            {p.pagos.length > 0 && (
              <details className="text-sm">
                <summary className="cursor-pointer font-semibold text-primario">Ver mis abonos ({p.pagos.length})</summary>
                <ul className="mt-2 divide-y divide-borde">
                  {p.pagos.map((x, i) => (
                    <li key={i} className="flex justify-between py-2">
                      <span className="text-suave">
                        {fecha(x.fecha)} · {NOMBRE_METODO_PAGO[x.metodo]}
                      </span>
                      <span className="tabular font-semibold">{dinero(x.monto)}</span>
                    </li>
                  ))}
                </ul>
              </details>
            )}
          </section>
        );
      })}

      <p className="mt-auto pt-4 text-center text-xs text-suave">
        Este link es personal. No lo compartas. Si crees que alguien más lo tiene, pídele a tu cobrador uno nuevo.
      </p>
    </main>
  );
}

function Mensaje({ titulo, texto }) {
  return (
    <main className="flex min-h-dvh items-center justify-center px-4">
      <div className="tarjeta max-w-sm p-8 text-center">
        <h1 className="text-lg font-bold">{titulo}</h1>
        <p className="mt-2 text-sm text-suave">{texto}</p>
      </div>
    </main>
  );
}
