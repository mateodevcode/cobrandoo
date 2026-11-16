import { Suspense } from "react";
import { exigirUsuarioPagina } from "@/server/auth/session";
import { reporte } from "@/server/services/reportes.service";
import { Filtros } from "@/components/negocio/Filtros";
import { Avatar, Insignia } from "@/components/ui/Insignia";
import { NOMBRE_ROL } from "@/lib/roles";
import { dinero, fecha } from "@/lib/formato";
import { cn } from "@/lib/cn";

export const metadata = { title: "Reportes" };

const PERIODOS = { 7: "7 días", 30: "30 días", 90: "90 días" };

export default async function PaginaReportes({ searchParams }) {
  const yo = await exigirUsuarioPagina(["dueno", "supervisor"]);
  const sp = await searchParams;
  const dias = [7, 30, 90].includes(Number(sp.dias)) ? Number(sp.dias) : 30;
  const r = await reporte(yo, dias);
  const pct = (v) => (r.dinero.total ? Math.round((v / r.dinero.total) * 100) : 0);

  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-6">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">Reportes</h1>
          <p className="text-sm text-suave">
            {yo.rol === "dueno" ? "Todo el negocio" : "Tu equipo"} · del {fecha(r.desde)} al {fecha(r.hoy)}
          </p>
        </div>
        <Suspense>
          <Filtros parametro="dias" opciones={[{ id: "30", nombre: "30 días" }, { id: "7", nombre: "7 días" }, { id: "90", nombre: "90 días" }]} />
        </Suspense>
      </header>

      {/* ===== ¿Dónde está el dinero? ===== */}
      <section className="rounded-tarjeta bg-gradient-to-br from-marino-800 to-primario p-6 text-white shadow-tarjeta">
        <p className="text-sm text-white/75">Dinero del negocio hoy</p>
        <p className="tabular text-4xl font-bold">{dinero(r.dinero.total)}</p>
        <p className="mt-1 text-xs text-white/70">Capital prestado que falta por cobrar + efectivo y digital en manos de cada persona.</p>
        <div className="mt-5 grid gap-3 sm:grid-cols-3">
          <Bloque titulo="Prestado en la calle (capital)" valor={r.dinero.capitalPrestado} pct={pct(r.dinero.capitalPrestado)} />
          <Bloque titulo="Efectivo en manos del equipo" valor={r.dinero.efectivo} pct={pct(r.dinero.efectivo)} />
          <Bloque titulo="Nequi / Daviplata / transferencias" valor={r.dinero.digital} pct={pct(r.dinero.digital)} />
        </div>
      </section>

      {/* ===== Período ===== */}
      <section className="flex flex-col gap-3">
        <h2 className="font-semibold">Últimos {PERIODOS[dias]}</h2>
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <Cifra titulo="Cobrado" valor={dinero(r.periodo.cobrado)} sub={`${r.periodo.abonos} abono(s)`} />
          <Cifra titulo="Prestado" valor={dinero(r.periodo.prestado)} sub={`${r.periodo.prestamos} préstamo(s) · ${r.periodo.clientesNuevos} cliente(s)`} />
          <Cifra titulo="Ganancia cobrada" valor={dinero(r.periodo.ganancia)} sub="Intereses y recargos cobrados" tono="text-exito" />
          <Cifra titulo="Gastos" valor={dinero(r.periodo.gastos)} sub={`Neto ${dinero(r.periodo.ganancia - r.periodo.gastos)}`} />
        </div>
        <GraficoCobros serie={r.serie} />
      </section>

      {/* ===== Cartera ===== */}
      <section className="flex flex-col gap-3">
        <h2 className="font-semibold">Cartera actual</h2>
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <Cifra titulo="Por cobrar" valor={dinero(r.cartera.saldo)} sub={`${r.cartera.prestamos} préstamo(s) · ${r.cartera.clientes} cliente(s)`} />
          <Cifra titulo="Capital pendiente" valor={dinero(r.cartera.capital)} />
          <Cifra titulo="Intereses y recargos pendientes" valor={dinero(r.cartera.intereses)} />
          <Cifra
            titulo="En mora"
            valor={dinero(r.cartera.en_mora)}
            sub={`${r.cartera.porcentajeMora} % de la cartera · ${r.cartera.prestamos_mora} préstamo(s)`}
            tono={r.cartera.en_mora > 0 ? "text-peligro" : undefined}
          />
        </div>
      </section>

      {/* ===== Por persona ===== */}
      <section className="flex flex-col gap-3">
        <h2 className="font-semibold">Por persona</h2>
        {r.personas.length === 0 ? (
          <div className="tarjeta p-8 text-center text-sm text-suave">No hay personas a cargo.</div>
        ) : (
          <div className="tarjeta overflow-x-auto">
            <table className="w-full min-w-[720px] text-sm">
              <thead className="border-b border-borde text-left text-xs text-suave">
                <tr>
                  <th className="px-4 py-3 font-semibold">Persona</th>
                  <th className="px-3 py-3 text-right font-semibold">Efectivo en mano</th>
                  <th className="px-3 py-3 text-right font-semibold">Cartera</th>
                  <th className="px-3 py-3 text-right font-semibold">Mora</th>
                  <th className="px-3 py-3 text-right font-semibold">Cobrado ({dias} d)</th>
                  <th className="px-3 py-3 text-right font-semibold">Prestado ({dias} d)</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-borde">
                {r.personas.map((u) => {
                  const mora = u.cartera ? Math.round((u.en_mora / u.cartera) * 100) : 0;
                  return (
                    <tr key={u.id}>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2.5">
                          <Avatar nombre={u.nombre} className="size-8" />
                          <div>
                            <p className="font-semibold">{u.nombre}</p>
                            <p className="text-xs text-suave">
                              {NOMBRE_ROL[u.rol]}
                              {u.fallos > 0 && (
                                <>
                                  {" · "}
                                  <Insignia tono="peligro">{u.fallos} cierre(s) con fallo</Insignia>
                                </>
                              )}
                            </p>
                          </div>
                        </div>
                      </td>
                      <td className={cn("tabular px-3 py-3 text-right", u.efectivo < 0 && "text-peligro")}>{dinero(u.efectivo)}</td>
                      <td className="tabular px-3 py-3 text-right">{u.rol === "cobrador" ? dinero(u.cartera) : "—"}</td>
                      <td className={cn("tabular px-3 py-3 text-right", mora > 15 && "font-semibold text-peligro")}>{u.rol === "cobrador" ? `${mora} %` : "—"}</td>
                      <td className="tabular px-3 py-3 text-right">{dinero(u.cobrado)}</td>
                      <td className="tabular px-3 py-3 text-right">{dinero(u.prestado)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
        <p className="text-xs text-suave">
          “Efectivo en mano” es lo que cada persona debería tener según sus movimientos. Para un cobrador que ya cerró el día, es la diferencia de su cuadre.
        </p>
      </section>
    </div>
  );
}

function Bloque({ titulo, valor, pct }) {
  return (
    <div className="rounded-xl bg-white/10 p-3">
      <p className="text-xs text-white/75">{titulo}</p>
      <p className="tabular text-lg font-bold">{dinero(valor)}</p>
      <div className="mt-2 h-1.5 rounded-full bg-white/15">
        <div className="h-full rounded-full bg-acento" style={{ width: `${Math.max(0, Math.min(100, pct))}%` }} />
      </div>
      <p className="mt-1 text-[11px] text-white/70">{pct} % del total</p>
    </div>
  );
}

function Cifra({ titulo, valor, sub, tono }) {
  return (
    <div className="tarjeta p-4">
      <p className="text-xs text-suave">{titulo}</p>
      <p className={cn("tabular mt-1 text-xl font-bold", tono)}>{valor}</p>
      {sub && <p className="text-[11px] text-suave">{sub}</p>}
    </div>
  );
}

/** Barras de cobrado por día (una sola serie: no necesita leyenda; tabla accesible debajo). */
function GraficoCobros({ serie }) {
  const max = Math.max(1, ...serie.map((d) => d.cobrado));
  const total = serie.reduce((s, d) => s + d.cobrado, 0);
  const cada = serie.length > 31 ? 15 : serie.length > 10 ? 5 : 1;
  return (
    <div className="tarjeta p-5">
      <div className="flex items-baseline justify-between">
        <h3 className="text-sm font-semibold">Cobrado por día</h3>
        <span className="tabular text-xs text-suave">Total {dinero(total)}</span>
      </div>
      <div className="mt-4 flex h-40 items-end gap-0.5" role="img" aria-label={`Cobrado por día, total ${dinero(total)}`}>
        {serie.map((d, i) => (
          <div key={d.fecha} className="group relative flex h-full flex-1 flex-col justify-end">
            <div
              className="w-full rounded-t-[4px] bg-primario/80 transition-colors group-hover:bg-primario"
              style={{ height: `${d.cobrado ? Math.max(2, (d.cobrado / max) * 100) : 0}%` }}
            />
            {/* Tooltip */}
            <div className="pointer-events-none absolute bottom-full left-1/2 z-10 mb-1 hidden -translate-x-1/2 rounded-lg bg-marino-900 px-2 py-1 text-[11px] whitespace-nowrap text-white group-hover:block">
              {fecha(d.fecha)}: {dinero(d.cobrado)}
              {d.prestado > 0 && ` · prestado ${dinero(d.prestado)}`}
            </div>
            {i % cada === 0 && <span className="mt-1 text-center text-[10px] text-suave">{d.fecha.slice(8)}</span>}
          </div>
        ))}
      </div>
      <details className="mt-3 text-sm">
        <summary className="cursor-pointer text-xs font-semibold text-primario">Ver como tabla</summary>
        <table className="mt-2 w-full text-xs">
          <thead className="text-left text-suave">
            <tr>
              <th className="py-1">Día</th>
              <th className="py-1 text-right">Cobrado</th>
              <th className="py-1 text-right">Prestado</th>
            </tr>
          </thead>
          <tbody>
            {serie.filter((d) => d.cobrado || d.prestado).map((d) => (
              <tr key={d.fecha} className="border-t border-borde">
                <td className="py-1">{fecha(d.fecha)}</td>
                <td className="tabular py-1 text-right">{dinero(d.cobrado)}</td>
                <td className="tabular py-1 text-right">{dinero(d.prestado)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </details>
    </div>
  );
}
