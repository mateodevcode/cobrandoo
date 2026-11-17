import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, RefreshCw } from "lucide-react";
import { z } from "zod";
import { exigirUsuarioPagina } from "@/server/auth/session";
import { ROLES_NEGOCIO } from "@/server/permisos";
import * as prestamos from "@/server/services/prestamos.service";
import { Insignia } from "@/components/ui/Insignia";
import { BotonCobrar } from "@/components/negocio/BotonCobrar";
import { BotonAnular } from "@/components/negocio/BotonAnular";
import { METODOS } from "@/lib/prestamos/metodos";
import { BASES_INTERES, FRECUENCIAS, NOMBRE_METODO_PAGO, RECARGOS } from "@/lib/prestamos/constantes";
import { dinero, fecha } from "@/lib/formato";
import { hoyBogota } from "@/lib/fechas";
import { cn } from "@/lib/cn";

export const metadata = { title: "Préstamo" };

const TONO_ESTADO = { activo: "info", pagado: "exito", anulado: "neutro" };
const TONO_CUOTA = {
  pagada: "bg-exito-suave text-exito",
  vencida: "bg-peligro-suave text-peligro",
  hoy: "bg-alerta-suave text-alerta ring-2 ring-alerta/40",
  parcial: "bg-primario-suave text-primario",
  pendiente: "bg-fondo text-suave",
};

export default async function PaginaPrestamo({ params }) {
  const yo = await exigirUsuarioPagina(ROLES_NEGOCIO);
  const { id } = await params;
  if (!z.uuid().safeParse(id).success) notFound();
  const datos = await prestamos.obtener(yo, id).catch(() => null);
  if (!datos) notFound();
  const { prestamo: p, cuotas, cargos, pagos } = datos;
  const hoy = hoyBogota();
  const avance = p.total_cargado ? Math.min(100, Math.round((p.total_pagado / p.total_cargado) * 100)) : 0;
  const interesesExtra = cargos.filter((c) => c.tipo === "interes" && c.clave !== "interes:inicio");
  const recargos = cargos.filter((c) => c.tipo === "recargo");
  const esJefe = yo.rol !== "cobrador";
  const puedeAnularPrestamo = p.estado === "activo" && pagos.every((x) => x.anulado_en) && (esJefe || (p.creado_por === yo.id && hoyBogota(new Date(p.creado_en)) === hoy));

  return (
    <div className="mx-auto flex max-w-5xl flex-col gap-5">
      <Link href={`/clientes/${p.cliente_id}`} className="flex w-fit items-center gap-1 text-sm text-suave hover:text-texto">
        <ArrowLeft className="size-4" /> {p.cliente_nombre}
      </Link>

      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-2xl font-bold">Préstamo de {dinero(p.capital)}</h1>
            <Insignia tono={TONO_ESTADO[p.estado]}>{p.estado}</Insignia>
            {p.estado === "activo" && p.dias_atraso > 0 && <Insignia tono="peligro">{p.dias_atraso} días de atraso</Insignia>}
          </div>
          <p className="text-sm text-suave">
            {METODOS[p.metodo]?.nombre} · {Number(p.tasa)} % · desde {fecha(p.fecha_inicio)}
            {esJefe && ` · ${p.cobrador_nombre}`}
          </p>
        </div>
        {p.estado === "activo" && (
          <div className="flex flex-wrap gap-2">
            <Link
              href={`/prestamos/nuevo?cliente=${p.cliente_id}&renueva=${p.id}`}
              className="inline-flex h-11 items-center gap-2 rounded-xl border border-borde px-4 text-sm font-semibold hover:bg-fondo"
            >
              <RefreshCw className="size-4" /> Renovar
            </Link>
            <BotonCobrar clienteId={p.cliente_id} cliente={p.cliente_nombre} prestamos={[{ id: p.id, metodo: p.metodo, saldo: p.saldo, sugerido_hoy: p.sugerido_hoy, valor_cuota: p.valor_cuota }]} />
          </div>
        )}
      </header>

      {p.renueva_a && (
        <p className="rounded-xl bg-primario-suave p-3 text-sm text-primario">
          Es una renovación: se descontaron <span className="tabular font-semibold">{dinero(p.saldo_renovado)}</span> que debía del{" "}
          <Link href={`/prestamos/${p.renueva_a}`} className="font-semibold underline">
            préstamo anterior
          </Link>
          {p.saldo_renovado > 0 && <>; en mano recibió {dinero(p.monto_entregado - p.saldo_renovado)}</>}.
        </p>
      )}
      {p.renovado_por && (
        <p className="rounded-xl bg-exito-suave p-3 text-sm text-exito">
          Se saldó al renovarlo con un{" "}
          <Link href={`/prestamos/${p.renovado_por}`} className="font-semibold underline">
            préstamo nuevo
          </Link>
          .
        </p>
      )}

      {p.estado === "anulado" && (
        <p className="rounded-xl bg-fondo p-3 text-sm text-suave">
          Anulado por {p.anulado_por_nombre} el {fecha(p.anulado_en)}: {p.motivo_anulacion}
        </p>
      )}

      {/* Saldos */}
      <section className="grid gap-3 lg:grid-cols-[1.2fr_1fr]">
        <div className="rounded-tarjeta bg-gradient-to-br from-marino-800 to-primario p-5 text-white shadow-tarjeta">
          <p className="text-sm text-white/75">Debe hoy</p>
          <p className="tabular text-4xl font-bold">{dinero(p.saldo)}</p>
          <div className="mt-4 h-2 rounded-full bg-white/20">
            <div className="h-full rounded-full bg-acento" style={{ width: `${avance}%` }} />
          </div>
          <div className="mt-2 flex justify-between text-xs text-white/75">
            <span>Pagado {dinero(p.total_pagado)} ({avance} %)</span>
            <span>Total cargado {dinero(p.total_cargado)}</span>
          </div>
        </div>
        <div className="tarjeta grid grid-cols-2 gap-3 p-5 text-sm">
          <Dato titulo="Capital pendiente" valor={dinero(p.saldo_capital)} />
          <Dato titulo="Interés pendiente" valor={dinero(p.saldo_interes)} />
          <Dato titulo="Recargos pendientes" valor={dinero(p.saldo_recargo)} tono={p.saldo_recargo > 0 && "text-peligro"} />
          <Dato titulo="Para quedar al día" valor={dinero(p.sugerido_hoy)} tono={p.sugerido_hoy > 0 && "text-primario"} />
          {p.proximo_corte && <Dato titulo="Próximo interés" valor={fecha(p.proximo_corte)} />}
          {p.pagado_en && <Dato titulo="Pagado el" valor={fecha(p.pagado_en)} />}
        </div>
      </section>

      {/* Condiciones */}
      <section className="tarjeta grid gap-3 p-5 text-sm sm:grid-cols-3">
        <Dato titulo="Método" valor={METODOS[p.metodo]?.nombre} />
        {p.valor_cuota && <Dato titulo="Cuotas" valor={`${p.n_cuotas} ${FRECUENCIAS.find((f) => f.id === p.frecuencia)?.nombre.toLowerCase()}s de ${dinero(p.valor_cuota)}`} />}
        {p.fecha_vencimiento && <Dato titulo="Vence" valor={fecha(p.fecha_vencimiento)} />}
        <Dato titulo="Interés acumulado" valor={BASES_INTERES.find((b) => b.id === p.base_interes)?.nombre} />
        {p.recargo_tipo !== "ninguno" && (
          <Dato titulo="Recargo" valor={`${RECARGOS.find((r) => r.id === p.recargo_tipo)?.nombre}: ${p.recargo_tipo === "fijo_diario" ? dinero(p.recargo_valor) : `${Number(p.recargo_valor)} %`}`} />
        )}
        <Dato titulo="Entregado en" valor={`${NOMBRE_METODO_PAGO[p.metodo_desembolso]} por ${p.creado_por_nombre ?? "—"}`} />
        {p.notas && <p className="text-suave sm:col-span-3">{p.notas}</p>}
      </section>

      {/* Cuotas */}
      {cuotas.length > 0 && (
        <section className="tarjeta p-5">
          <h2 className="mb-3 font-semibold">Cuotas</h2>
          <ul className="grid grid-cols-4 gap-1.5 sm:grid-cols-6 lg:grid-cols-10">
            {cuotas.map((c) => (
              <li key={c.numero} className={cn("rounded-lg px-1.5 py-1.5 text-center", TONO_CUOTA[c.estado])} title={`${fecha(c.fecha)} · ${dinero(c.monto)} · ${c.estado}`}>
                <p className="text-[10px] font-semibold opacity-80">#{c.numero}</p>
                <p className="text-[11px] font-bold">{c.fecha.slice(8)}/{c.fecha.slice(5, 7)}</p>
              </li>
            ))}
          </ul>
          <div className="mt-3 flex flex-wrap gap-3 text-[11px] text-suave">
            {[["pagada", "Pagada"], ["parcial", "Abono parcial"], ["hoy", "Hoy"], ["vencida", "Vencida"], ["pendiente", "Pendiente"]].map(([k, n]) => (
              <span key={k} className="flex items-center gap-1">
                <span className={cn("size-3 rounded", TONO_CUOTA[k])} /> {n}
              </span>
            ))}
          </div>
        </section>
      )}

      <div className="grid gap-5 lg:grid-cols-2">
        {/* Pagos */}
        <section className="tarjeta p-5">
          <h2 className="mb-3 font-semibold">Abonos ({pagos.filter((x) => !x.anulado_en).length})</h2>
          {pagos.length === 0 ? (
            <p className="text-sm text-suave">Aún no ha abonado.</p>
          ) : (
            <ul className="divide-y divide-borde">
              {pagos.map((x) => {
                // El saldo pagado por renovación se deshace anulando el préstamo nuevo, no aquí
                const puedeAnular = !x.anulado_en && x.metodo !== "renovacion" && (esJefe || (x.cobrador_id === yo.id && x.fecha === hoy));
                return (
                  <li key={x.id} className={cn("py-2.5", x.anulado_en && "opacity-55")}>
                    <div className="flex items-center justify-between gap-2">
                      <div>
                        <p className={cn("tabular font-semibold", x.anulado_en && "line-through")}>{dinero(x.monto)}</p>
                        <p className="text-xs text-suave">
                          {fecha(x.fecha)} · {NOMBRE_METODO_PAGO[x.metodo]} · {x.cobrado_por}
                        </p>
                      </div>
                      {puedeAnular && <BotonAnular url={`/api/pagos/${x.id}/anular`} titulo="Anular abono" descripcion={`${dinero(x.monto)} del ${fecha(x.fecha)}`} />}
                    </div>
                    {!x.anulado_en ? (
                      <p className="mt-1 text-[11px] text-suave">
                        {[x.aplicado_recargo && `recargo ${dinero(x.aplicado_recargo)}`, x.aplicado_interes && `interés ${dinero(x.aplicado_interes)}`, x.aplicado_capital && `capital ${dinero(x.aplicado_capital)}`, x.sobrante && `de más ${dinero(x.sobrante)}`].filter(Boolean).join(" · ")}
                      </p>
                    ) : (
                      <p className="mt-1 text-[11px] text-peligro">Anulado por {x.anulado_por_nombre}: {x.motivo_anulacion}</p>
                    )}
                    {x.nota && <p className="mt-1 text-xs text-suave italic">{x.nota}</p>}
                  </li>
                );
              })}
            </ul>
          )}
        </section>

        {/* Cargos */}
        <section className="tarjeta p-5">
          <h2 className="mb-3 font-semibold">Cargos</h2>
          <ul className="divide-y divide-borde text-sm">
            {cargos.filter((c) => c.tipo !== "recargo").map((c) => (
              <li key={c.clave} className="flex justify-between py-2">
                <span>
                  {c.descripcion} <span className="text-xs text-suave">· {fecha(c.fecha)}</span>
                </span>
                <span className="tabular font-semibold">{dinero(c.monto)}</span>
              </li>
            ))}
            {recargos.length > 0 && (
              <li className="flex justify-between py-2">
                <span>
                  Recargos por atraso <span className="text-xs text-suave">· {recargos.length}</span>
                </span>
                <span className="tabular font-semibold text-peligro">{dinero(recargos.reduce((s, c) => s + c.monto, 0))}</span>
              </li>
            )}
          </ul>
          {interesesExtra.length > 0 && <p className="mt-2 text-xs text-suave">Incluye {interesesExtra.length} interés(es) por seguir debiendo.</p>}
        </section>
      </div>

      {puedeAnularPrestamo && (
        <div className="flex justify-end">
          <BotonAnular
            url={`/api/prestamos/${p.id}/anular`}
            titulo="Anular préstamo"
            descripcion="Úsalo solo si se registró por error. El dinero vuelve a la caja."
            etiqueta="Anular préstamo"
            className="text-sm font-semibold text-peligro hover:underline"
          />
        </div>
      )}
    </div>
  );
}

function Dato({ titulo, valor, tono }) {
  return (
    <div>
      <p className="text-xs text-suave">{titulo}</p>
      <p className={cn("tabular font-semibold", tono)}>{valor}</p>
    </div>
  );
}
