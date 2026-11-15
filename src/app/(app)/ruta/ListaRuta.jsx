"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowDown, ArrowUp, Check, ListOrdered, MapPin } from "lucide-react";
import { toast } from "sonner";
import { Boton } from "@/components/ui/Boton";
import { Insignia } from "@/components/ui/Insignia";
import { BotonCobrar } from "@/components/negocio/BotonCobrar";
import { dinero } from "@/lib/formato";
import { api } from "@/lib/api";
import { sincronizador } from "@/lib/offline/sync";
import { cn } from "@/lib/cn";

const FILTROS = [
  { id: "pendientes", nombre: "Por cobrar" },
  { id: "cobrados", nombre: "Ya pagaron hoy" },
  { id: "todos", nombre: "Todos" },
];

export function ListaRuta({ clientes, puedeOrdenar }) {
  const router = useRouter();
  const [filtro, setFiltro] = useState("pendientes");
  const [ordenando, setOrdenando] = useState(false);
  const [orden, setOrden] = useState(clientes);
  const [guardando, setGuardando] = useState(false);

  const cobradoHoy = clientes.reduce((s, c) => s + Number(c.pagado_hoy), 0);
  const porCobrar = clientes.reduce((s, c) => s + Number(c.sugerido_hoy), 0);
  const pendientes = clientes.filter((c) => c.sugerido_hoy > 0).length;

  const lista = ordenando ? orden : clientes;
  const visibles = ordenando
    ? lista
    : lista.filter((c) => (filtro === "pendientes" ? c.sugerido_hoy > 0 : filtro === "cobrados" ? c.pagado_hoy > 0 : true));

  // Agrupar por ruta manteniendo el orden
  const grupos = useMemo(() => {
    const m = new Map();
    for (const c of visibles) {
      const k = c.ruta_id ?? "sin";
      if (!m.has(k)) m.set(k, { id: c.ruta_id, nombre: c.ruta_nombre ?? "Sin ruta", clientes: [] });
      m.get(k).clientes.push(c);
    }
    return [...m.values()];
  }, [visibles]);

  function mover(c, delta) {
    setOrden((prev) => {
      const mismos = prev.filter((x) => x.ruta_id === c.ruta_id);
      const i = mismos.findIndex((x) => x.cliente_id === c.cliente_id);
      const j = i + delta;
      if (j < 0 || j >= mismos.length) return prev;
      [mismos[i], mismos[j]] = [mismos[j], mismos[i]];
      const otros = prev.filter((x) => x.ruta_id !== c.ruta_id);
      const idx = prev.findIndex((x) => x.ruta_id === c.ruta_id);
      return [...otros.slice(0, idx), ...mismos, ...otros.slice(idx)];
    });
  }

  async function guardarOrden() {
    setGuardando(true);
    try {
      const porRuta = new Map();
      for (const c of orden) {
        const k = c.ruta_id ?? null;
        if (!porRuta.has(k)) porRuta.set(k, []);
        porRuta.get(k).push(c.cliente_id);
      }
      // Ordenar necesita conexión (cambia datos de varios clientes a la vez)
      for (const [ruta_id, ids] of porRuta) {
        await api("/api/rutas/orden", { method: "POST", body: { ruta_id, clientes: ids.filter((id) => !orden.find((c) => c.cliente_id === id)?.pendiente) } });
      }
      await sincronizador.sincronizar();
      toast.success("Orden guardado");
      setOrdenando(false);
      router.refresh();
    } catch (err) {
      toast.error(navigator.onLine ? err.message : "Necesitas internet para cambiar el orden de la ruta");
    } finally {
      setGuardando(false);
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-3 gap-2">
        <Resumen titulo="Cobrado hoy" valor={dinero(cobradoHoy)} tono="text-exito" />
        <Resumen titulo="Falta por cobrar" valor={dinero(porCobrar)} />
        <Resumen titulo="Clientes pendientes" valor={`${pendientes} / ${clientes.length}`} />
      </div>

      <div className="flex items-center justify-between gap-2">
        {!ordenando ? (
          <div className="flex gap-1 overflow-x-auto rounded-xl bg-superficie p-1 shadow-tarjeta [scrollbar-width:none]">
            {FILTROS.map((f) => (
              <button
                key={f.id}
                onClick={() => setFiltro(f.id)}
                className={cn("shrink-0 rounded-lg px-3 py-1.5 text-sm font-medium", filtro === f.id ? "bg-primario text-white" : "text-suave")}
              >
                {f.nombre}
              </button>
            ))}
          </div>
        ) : (
          <p className="text-sm text-suave">Usa las flechas para ordenar la visita.</p>
        )}
        {puedeOrdenar && clientes.length > 1 && (
          ordenando ? (
            <Boton tamano="sm" cargando={guardando} onClick={guardarOrden}>
              <Check className="size-4" /> Guardar
            </Boton>
          ) : (
            <Boton tamano="sm" variante="secundario" onClick={() => { setOrden(clientes); setOrdenando(true); }} aria-label="Ordenar ruta">
              <ListOrdered className="size-4" />
            </Boton>
          )
        )}
      </div>

      {clientes.length === 0 && (
        <div className="tarjeta p-10 text-center text-sm text-suave">
          No hay clientes con préstamos activos. <Link href="/clientes/nuevo" className="font-semibold text-primario">Crea un cliente</Link>.
        </div>
      )}
      {clientes.length > 0 && visibles.length === 0 && (
        <div className="tarjeta p-8 text-center text-sm text-suave">{filtro !== "pendientes" ? "Nadie en esta lista." : cobradoHoy > 0 ? "¡Todo cobrado por hoy! 🎉" : "Nadie tiene cuotas pendientes hoy. Revisa la pestaña Todos."}</div>
      )}

      {grupos.map((g) => (
        <section key={g.id ?? "sin"} className="flex flex-col gap-2">
          <h2 className="px-1 text-xs font-semibold tracking-wide text-suave uppercase">
            {g.nombre} · {g.clientes.length}
          </h2>
          <ul className="flex flex-col gap-2">
            {g.clientes.map((c, i) => (
              <li key={c.cliente_id} className={cn("tarjeta flex items-center gap-3 p-3.5", c.sugerido_hoy === 0 && c.pagado_hoy > 0 && "opacity-70")}>
                {ordenando ? (
                  <div className="flex flex-col">
                    <button onClick={() => mover(c, -1)} disabled={i === 0} className="rounded p-1 text-suave disabled:opacity-30" aria-label="Subir">
                      <ArrowUp className="size-4" />
                    </button>
                    <button onClick={() => mover(c, 1)} disabled={i === g.clientes.length - 1} className="rounded p-1 text-suave disabled:opacity-30" aria-label="Bajar">
                      <ArrowDown className="size-4" />
                    </button>
                  </div>
                ) : (
                  <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-fondo text-xs font-bold text-suave">{i + 1}</span>
                )}
                <Link
                  href={`/clientes/${c.cliente_id}`}
                  onClick={(e) => {
                    // La ficha del cliente necesita internet; sin señal se cobra desde aquí mismo
                    if (!navigator.onLine) {
                      e.preventDefault();
                      toast.info("La ficha del cliente necesita internet. Puedes cobrar con el botón de la derecha.");
                    }
                  }}
                  className="min-w-0 flex-1"
                >
                  <div className="flex flex-wrap items-center gap-1.5">
                    <p className="truncate font-semibold">{c.nombre}</p>
                    {c.dias_atraso > 0 && <Insignia tono="peligro">{c.dias_atraso} d</Insignia>}
                    {c.pagado_hoy > 0 && <Insignia tono="exito">Pagó {dinero(c.pagado_hoy)}</Insignia>}
                    {c.pendiente && <Insignia tono="alerta">Sin enviar</Insignia>}
                  </div>
                  {(c.direccion || c.barrio) && (
                    <p className="flex items-center gap-1 truncate text-xs text-suave">
                      <MapPin className="size-3 shrink-0" /> {[c.direccion, c.barrio].filter(Boolean).join(", ")}
                    </p>
                  )}
                  <p className="tabular mt-0.5 text-xs text-suave">
                    Debe {dinero(c.saldo)}
                    {c.sugerido_hoy > 0 && (
                      <>
                        {" · "}
                        <span className="font-semibold text-texto">hoy {dinero(c.sugerido_hoy)}</span>
                      </>
                    )}
                  </p>
                </Link>
                {!ordenando && <BotonCobrar clienteId={c.cliente_id} cliente={c.nombre} prestamos={c.prestamos} tamano="sm" />}
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}

function Resumen({ titulo, valor, tono }) {
  return (
    <div className="tarjeta p-3">
      <p className="text-[11px] text-suave">{titulo}</p>
      <p className={cn("tabular text-sm font-bold sm:text-base", tono)}>{valor}</p>
    </div>
  );
}
