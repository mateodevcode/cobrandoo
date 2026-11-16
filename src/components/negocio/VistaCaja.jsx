import { ArrowDownLeft, ArrowUpRight } from "lucide-react";
import { dinero } from "@/lib/formato";
import { NOMBRE_METODO_PAGO, CATEGORIAS_GASTO } from "@/lib/prestamos/constantes";
import { cn } from "@/lib/cn";

const NOMBRE_TIPO = {
  base: "Base recibida",
  cobro: "Cobro",
  desembolso: "Préstamo entregado",
  gasto: "Gasto",
  entrega: "Entrega al jefe",
  ajuste: "Ajuste",
  anulacion: "Anulación",
  base_entregada: "Base entregada",
  recibido: "Recibido de cobrador",
};
const NOMBRE_CATEGORIA = Object.fromEntries(CATEGORIAS_GASTO.map((c) => [c.id, c.nombre]));

/** Presentación de una caja (sirve para la del servidor y para la calculada en el teléfono). */
export function VistaCaja({ caja, titulo, navegacion, accion, propia, rol }) {
  const t = caja.totales;
  return (
    <>
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">{titulo}</h1>
          <div className="mt-1 flex items-center gap-2 text-sm">{navegacion}</div>
        </div>
        {accion}
      </header>

      <section className="rounded-tarjeta bg-gradient-to-br from-marino-800 to-primario p-5 text-white shadow-tarjeta">
        <p className="text-sm text-white/75">{caja.cerrada ? "Día cerrado · efectivo que quedó" : "Efectivo que debería tener"}</p>
        <p className="tabular text-4xl font-bold">{dinero(caja.efectivoEsperado)}</p>
        <p className="mt-1 text-xs text-white/75">
          {caja.cerrada
            ? "Ya se entregó el efectivo al jefe. Si no es cero, es la diferencia del cuadre."
            : "Base + cobros en efectivo − préstamos entregados − gastos. Lo digital va aparte."}
        </p>
        {caja.efectivoEsperado < 0 && !caja.cerrada && (
          <p className="mt-3 rounded-xl bg-white/15 px-3 py-2 text-sm">
            {rol === "dueno"
              ? "La caja está en negativo: repartiste o prestaste más de lo registrado. Anota el dinero que pusiste con “Registrar capital”."
              : propia
                ? `La caja está en negativo: se prestó o entregó más efectivo del que había. Pídele dinero a tu jefe${rol === "supervisor" ? " (lo entrega desde Equipo)" : ""}.`
                : "La caja está en negativo: entrégale dinero desde Equipo."}
          </p>
        )}
        {caja.digital !== 0 && (
          <p className="mt-3 text-sm">
            Digital (Nequi, Daviplata, transferencias): <span className="tabular font-semibold">{dinero(caja.digital)}</span>
          </p>
        )}
      </section>

      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <Cifra titulo={rol === "dueno" ? "Capital y base" : "Base recibida"} valor={t.base} />
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
                    {m.categoria === "capital" ? "Aporte de capital" : NOMBRE_TIPO[m.tipo]}
                    {m.cliente_nombre && ` · ${m.cliente_nombre}`}
                    {m.categoria && m.categoria !== "capital" && ` · ${NOMBRE_CATEGORIA[m.categoria] ?? m.categoria}`}
                  </p>
                  <p className="truncate text-xs text-suave">
                    {new Date(m.creado_en).toLocaleTimeString("es-CO", { hour: "numeric", minute: "2-digit", timeZone: "America/Bogota" })} · {NOMBRE_METODO_PAGO[m.metodo]}
                    {m.pendiente && <span className="font-semibold text-alerta"> · sin enviar</span>}
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
    </>
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
