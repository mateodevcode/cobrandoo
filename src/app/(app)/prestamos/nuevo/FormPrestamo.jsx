"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Info, Search } from "lucide-react";
import { toast } from "sonner";
import { Boton } from "@/components/ui/Boton";
import { Campo } from "@/components/ui/Campo";
import { CampoDinero } from "@/components/ui/CampoDinero";
import { Chips } from "@/components/ui/Chips";
import { LISTA_METODOS, METODOS, PRESETS, interesDe } from "@/lib/prestamos/metodos";
import { BASES_INTERES, FRECUENCIAS, METODOS_PAGO, RECARGOS, TASA_POR_DEFECTO, DIAS_PERIODO } from "@/lib/prestamos/constantes";
import { diasEntre } from "@/lib/fechas";
import { dinero, fecha } from "@/lib/formato";
import { sincronizador } from "@/lib/offline/sync";
import { cn } from "@/lib/cn";

const MIN_CAPITAL = 10_000;

export function FormPrestamo({ cliente: clienteInicial, clientes, hoy }) {
  const router = useRouter();
  const [cliente, setCliente] = useState(clienteInicial);
  const [busqueda, setBusqueda] = useState("");
  const [metodo, setMetodo] = useState("cuotas_fijas");
  const [capital, setCapital] = useState(0);
  const [tasa, setTasa] = useState(TASA_POR_DEFECTO);
  const [base, setBase] = useState("saldo_total");
  const [frecuencia, setFrecuencia] = useState("diaria");
  const [nCuotas, setNCuotas] = useState(30);
  const [recargoTipo, setRecargoTipo] = useState("ninguno");
  const [recargoValor, setRecargoValor] = useState(0);
  const [desembolso, setDesembolso] = useState("efectivo");
  const [existente, setExistente] = useState(false);
  const [fechaInicio, setFechaInicio] = useState(hoy);
  const [notas, setNotas] = useState("");
  const [errores, setErrores] = useState({});
  const [enviando, setEnviando] = useState(false);
  const [idPrestamo] = useState(() => crypto.randomUUID());

  const m = METODOS[metodo];
  const inicio = existente ? fechaInicio : hoy;

  // Vista previa con el mismo motor que usa el servidor
  const plan = useMemo(() => {
    if (capital < MIN_CAPITAL || !(tasa >= 0)) return null;
    if (m.usaCuotas && !(nCuotas >= 1 && nCuotas <= 365)) return null;
    try {
      return m.generar({ capital, tasa: Number(tasa), fecha_inicio: inicio, n_cuotas: Number(nCuotas), frecuencia });
    } catch {
      return null;
    }
  }, [m, capital, tasa, inicio, nCuotas, frecuencia]);

  const filtrados = useMemo(() => {
    const q = busqueda.trim().toLowerCase();
    return (q ? clientes.filter((c) => c.nombre.toLowerCase().includes(q) || c.barrio?.toLowerCase().includes(q)) : clientes).slice(0, 30);
  }, [busqueda, clientes]);

  async function enviar(e) {
    e.preventDefault();
    if (!cliente) return toast.error("Elige el cliente");
    setEnviando(true);
    setErrores({});
    // Se guarda en el teléfono y se envía; con señal esperamos la respuesta para mostrar errores aquí
    const r = await sincronizador.encolarYEsperar({
      id: idPrestamo,
      tipo: "prestamo",
      url: "/api/prestamos",
      local: { cobrador_id: cliente.cobrador_id },
      descripcion: `Préstamo de ${dinero(capital)} a ${cliente.nombre}`,
      body: {
          id: idPrestamo,
          cliente_id: cliente.id,
          metodo,
          capital,
          tasa: Number(tasa),
          base_interes: base,
          frecuencia: m.usaCuotas ? frecuencia : null,
          n_cuotas: m.usaCuotas ? Number(nCuotas) : null,
          recargo_tipo: m.usaRecargo ? recargoTipo : "ninguno",
          recargo_valor: m.usaRecargo && recargoTipo !== "ninguno" ? Number(recargoValor) : 0,
          metodo_desembolso: desembolso,
          fecha_inicio: inicio,
          registrar_desembolso: !existente,
          notas,
          creado_en_dispositivo: new Date().toISOString(),
        },
    }, 8000);

    if (r.error) {
      await sincronizador.descartar(idPrestamo);
      toast.error(r.error);
      setEnviando(false);
      return;
    }
    if (r.enviado) {
      toast.success("Préstamo creado");
      router.push(`/prestamos/${idPrestamo}`);
      router.refresh();
    } else {
      toast.success("Préstamo guardado en el teléfono", { description: "Se enviará solo cuando haya señal. Ya aparece en tu ruta." });
      router.push("/ruta");
    }
  }

  return (
    <form onSubmit={enviar} className="grid items-start gap-5 lg:grid-cols-[1fr_360px]">
      <div className="flex flex-col gap-5">
        {/* Cliente */}
        <Seccion titulo="Cliente">
          {cliente ? (
            <div className="flex items-center justify-between rounded-xl bg-fondo px-4 py-3">
              <span className="font-semibold">{cliente.nombre}</span>
              {!clienteInicial && (
                <button type="button" onClick={() => setCliente(null)} className="text-sm font-semibold text-primario">
                  Cambiar
                </button>
              )}
            </div>
          ) : (
            <div className="flex flex-col gap-2">
              <label className="relative block">
                <Search className="pointer-events-none absolute top-1/2 left-3.5 size-4 -translate-y-1/2 text-suave" />
                <input
                  value={busqueda}
                  onChange={(e) => setBusqueda(e.target.value)}
                  placeholder="Buscar cliente…"
                  className="h-11 w-full rounded-xl border border-borde pr-3 pl-10 text-sm outline-none focus:border-primario focus:ring-4 focus:ring-primario/15"
                  autoFocus
                />
              </label>
              <ul className="max-h-64 divide-y divide-borde overflow-y-auto rounded-xl border border-borde">
                {filtrados.map((c) => (
                  <li key={c.id}>
                    <button type="button" onClick={() => setCliente(c)} className="flex w-full items-center justify-between px-3 py-2.5 text-left text-sm hover:bg-fondo">
                      <span>
                        {c.nombre} {c.barrio && <span className="text-suave">· {c.barrio}</span>}
                      </span>
                      {c.saldo > 0 && <span className="tabular text-xs text-suave">debe {dinero(c.saldo)}</span>}
                    </button>
                  </li>
                ))}
                {filtrados.length === 0 && (
                  <li className="px-3 py-4 text-center text-sm text-suave">
                    Sin resultados. <Link href="/clientes/nuevo" className="font-semibold text-primario">Crear cliente</Link>
                  </li>
                )}
              </ul>
            </div>
          )}
        </Seccion>

        {/* Método */}
        <Seccion
          titulo="Método de préstamo"
          extra={
            <Link href="/metodos" target="_blank" className="flex items-center gap-1 text-xs font-semibold text-primario">
              <Info className="size-3.5" /> ¿Cómo funciona cada uno?
            </Link>
          }
        >
          <div className="mb-3 flex gap-2 overflow-x-auto pb-1 [scrollbar-width:none]" aria-label="Planes rápidos">
            {PRESETS.map((pr) => (
              <button
                key={pr.id}
                type="button"
                onClick={() => {
                  setMetodo(pr.metodo);
                  setTasa(pr.tasa);
                  if (pr.n_cuotas) setNCuotas(pr.n_cuotas);
                  if (pr.frecuencia) setFrecuencia(pr.frecuencia);
                }}
                className="shrink-0 rounded-full border border-borde bg-fondo px-3 py-1.5 text-xs font-semibold text-suave hover:border-primario hover:text-primario"
              >
                {pr.nombre}
              </button>
            ))}
          </div>
          <div className="grid gap-2 sm:grid-cols-2">
            {LISTA_METODOS.map((x) => (
              <button
                key={x.id}
                type="button"
                onClick={() => setMetodo(x.id)}
                className={cn(
                  "rounded-2xl border-2 p-4 text-left transition-colors",
                  metodo === x.id ? "border-primario bg-primario-suave" : "border-borde hover:bg-fondo"
                )}
              >
                <p className="font-semibold">{x.nombre}</p>
                <p className="mt-1 text-xs text-suave">{x.resumen}</p>
              </button>
            ))}
          </div>
        </Seccion>

        {/* Monto */}
        <Seccion titulo="Monto e interés">
          <div className="grid gap-4 sm:grid-cols-2">
            <CampoDinero etiqueta="Monto a prestar" valor={capital} onCambio={setCapital} error={errores.capital ?? (capital > 0 && capital < MIN_CAPITAL ? `Mínimo ${dinero(MIN_CAPITAL)}` : undefined)} />
            <div className="flex flex-col gap-1.5">
              <Campo etiqueta="Interés (%)" type="number" inputMode="decimal" min={0} max={100} step="0.5" value={tasa} onChange={(e) => setTasa(e.target.value)} error={errores.tasa} />
              <div className="flex gap-1.5">
                {[10, 15, 20].map((t) => (
                  <button key={t} type="button" onClick={() => setTasa(t)} className={cn("rounded-lg px-2.5 py-1 text-xs font-semibold", Number(tasa) === t ? "bg-primario text-white" : "bg-fondo text-suave")}>
                    {t} %
                  </button>
                ))}
              </div>
            </div>
          </div>

          {m.usaCuotas && (
            <div className="mt-4 grid gap-4 sm:grid-cols-2">
              <Chips etiqueta="Paga cada" opciones={FRECUENCIAS} valor={frecuencia} onCambio={setFrecuencia} />
              <div className="flex flex-col gap-1.5">
                <Campo etiqueta="Número de cuotas" type="number" inputMode="numeric" min={1} max={365} value={nCuotas} onChange={(e) => setNCuotas(e.target.value)} error={errores.n_cuotas} />
                <div className="flex gap-1.5">
                  {[20, 24, 30, 40].map((n) => (
                    <button key={n} type="button" onClick={() => setNCuotas(n)} className={cn("rounded-lg px-2.5 py-1 text-xs font-semibold", Number(nCuotas) === n ? "bg-primario text-white" : "bg-fondo text-suave")}>
                      {n}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          )}
        </Seccion>

        {/* Base del interés acumulado */}
        <Seccion titulo={m.usaCuotas ? "Si se vence el plazo y sigue debiendo, el % se calcula…" : "Cada 30 días que siga debiendo, el % se calcula…"}>
          <div className="flex flex-col gap-2" role="radiogroup">
            {BASES_INTERES.map((b) => (
              <button
                key={b.id}
                type="button"
                role="radio"
                aria-checked={base === b.id}
                onClick={() => setBase(b.id)}
                className={cn("flex gap-3 rounded-2xl border-2 p-3.5 text-left", base === b.id ? "border-primario bg-primario-suave" : "border-borde hover:bg-fondo")}
              >
                <span className={cn("mt-0.5 size-4 shrink-0 rounded-full border-2", base === b.id ? "border-primario bg-primario shadow-[inset_0_0_0_2px_white]" : "border-borde")} />
                <span>
                  <span className="block text-sm font-semibold">{b.nombre}</span>
                  <span className="block text-xs text-suave">{b.explicacion}</span>
                </span>
              </button>
            ))}
          </div>
        </Seccion>

        {/* Recargo */}
        {m.usaRecargo && (
          <Seccion titulo="Recargo por atraso">
            <Chips opciones={RECARGOS} valor={recargoTipo} onCambio={setRecargoTipo} />
            {recargoTipo !== "ninguno" && (
              <div className="mt-3 max-w-xs">
                {recargoTipo === "fijo_diario" ? (
                  <CampoDinero etiqueta="Valor por día de atraso" valor={recargoValor} onCambio={setRecargoValor} error={errores.recargo_valor} />
                ) : (
                  <Campo etiqueta="% de la cuota atrasada" type="number" min={0} max={100} step="0.5" value={recargoValor} onChange={(e) => setRecargoValor(e.target.value)} error={errores.recargo_valor} />
                )}
                <p className="mt-1.5 text-xs text-suave">{RECARGOS.find((r) => r.id === recargoTipo)?.explicacion}</p>
              </div>
            )}
          </Seccion>
        )}

        {/* Entrega */}
        <Seccion titulo="Entrega del dinero">
          <Chips etiqueta="¿Cómo se lo entregas?" opciones={METODOS_PAGO} valor={desembolso} onCambio={setDesembolso} />
          <label className="mt-4 flex items-start gap-3 rounded-xl bg-fondo p-3 text-sm">
            <input type="checkbox" checked={existente} onChange={(e) => setExistente(e.target.checked)} className="mt-0.5 size-4 accent-primario" />
            <span>
              <span className="font-semibold">Es un préstamo que ya existía</span>
              <span className="block text-xs text-suave">Para pasar al sistema préstamos hechos antes. No descuenta dinero de tu caja de hoy.</span>
            </span>
          </label>
          {existente && (
            <Campo etiqueta="Fecha en que se prestó" type="date" max={hoy} value={fechaInicio} onChange={(e) => setFechaInicio(e.target.value)} className="mt-3 max-w-xs" error={errores.fecha_inicio} />
          )}
          <Campo as="textarea" etiqueta="Notas (opcional)" value={notas} onChange={(e) => setNotas(e.target.value)} rows={2} maxLength={500} className="mt-4 [&_textarea]:h-auto [&_textarea]:py-2.5" />
        </Seccion>
      </div>

      {/* Resumen */}
      <aside className="tarjeta flex flex-col gap-4 p-5 lg:sticky lg:top-6">
        <h2 className="font-semibold">Resumen</h2>
        {!plan ? (
          <p className="text-sm text-suave">Escribe el monto para ver el cálculo.</p>
        ) : (
          <>
            <div className="rounded-2xl bg-gradient-to-br from-marino-800 to-primario p-4 text-white">
              <p className="text-xs text-white/75">Total a pagar</p>
              <p className="tabular text-3xl font-bold">{dinero(plan.total_inicial)}</p>
              <p className="mt-1 text-xs text-white/75">
                {plan.descuento
                  ? `Se le entregan ${dinero(plan.entregado)} (${dinero(plan.descuento)} de interés descontado)`
                  : `Presta ${dinero(capital)} + ${dinero(plan.total_inicial - capital)} de interés`}
              </p>
            </div>
            {m.usaCuotas ? (
              <dl className="grid grid-cols-2 gap-3 text-sm">
                <Dato titulo="Cuota" valor={dinero(plan.valor_cuota)} />
                <Dato titulo="Cuotas" valor={`${plan.cuotas.length} ${FRECUENCIAS.find((f) => f.id === frecuencia)?.nombre.toLowerCase()}s`} />
                <Dato titulo="Primera cuota" valor={fecha(plan.cuotas[0].fecha)} />
                <Dato titulo="Última cuota" valor={fecha(plan.fecha_vencimiento)} />
                {plan.cuotas.at(-1).monto !== plan.valor_cuota && <Dato titulo="Última cuota de" valor={dinero(plan.cuotas.at(-1).monto)} />}
              </dl>
            ) : (
              <p className="text-sm text-suave">
                Sin cuotas fijas. Si a los {DIAS_PERIODO} días ({fecha(plan.proximo_corte)}) sigue debiendo, se le suman unos{" "}
                <span className="font-semibold text-texto">{dinero(interesDe(base === "capital_original" ? capital : plan.total_inicial, Number(tasa)))}</span> si no ha abonado.
              </p>
            )}
            {existente && diasEntre(fechaInicio, hoy) > 0 && (
              <p className="rounded-xl bg-alerta-suave p-3 text-xs text-alerta">
                Como empezó hace {diasEntre(fechaInicio, hoy)} días, el sistema calculará los intereses y recargos que ya corrieron. Registra luego los abonos que ya hizo.
              </p>
            )}
          </>
        )}
        <Boton type="submit" tamano="lg" cargando={enviando} disabled={!plan || !cliente}>
          Crear préstamo
        </Boton>
      </aside>
    </form>
  );
}

function Seccion({ titulo, extra, children }) {
  return (
    <section className="tarjeta p-5">
      <div className="mb-3 flex items-center justify-between gap-2">
        <h2 className="text-sm font-semibold">{titulo}</h2>
        {extra}
      </div>
      {children}
    </section>
  );
}

function Dato({ titulo, valor }) {
  return (
    <div>
      <dt className="text-xs text-suave">{titulo}</dt>
      <dd className="tabular font-semibold">{valor}</dd>
    </div>
  );
}
