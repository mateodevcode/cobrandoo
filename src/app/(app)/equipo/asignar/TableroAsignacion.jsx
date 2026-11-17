"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { DndContext, DragOverlay, PointerSensor, TouchSensor, KeyboardSensor, useDraggable, useDroppable, useSensor, useSensors, pointerWithin, rectIntersection } from "@dnd-kit/core";
import { ArrowRightLeft, ChevronDown, GripVertical, Route as IconoRuta, Search, X } from "lucide-react";
import { toast } from "sonner";
import { Boton } from "@/components/ui/Boton";
import { Campo } from "@/components/ui/Campo";
import { Hoja } from "@/components/ui/Hoja";
import { Avatar, Insignia } from "@/components/ui/Insignia";
import { confirmar } from "@/components/ui/Dialogos";
import { api } from "@/lib/api";
import { dinero } from "@/lib/formato";
import { cn } from "@/lib/cn";

// Primero lo que está bajo el dedo; si no hay nada, lo que más se cruza
const deteccion = (args) => {
  const bajo = pointerWithin(args);
  return bajo.length ? bajo : rectIntersection(args);
};

/**
 * Tablero para pasar clientes entre cobradores: se arrastra un cliente (o varios marcados)
 * a otro cobrador o a una de sus rutas, o se arrastra una ruta entera. Con el dedo o el mouse.
 * Cada cliente tiene además el botón "Mover" (sin arrastrar) para quien lo prefiera.
 */
export function TableroAsignacion({ datos }) {
  const router = useRouter();
  const [clientes, setClientes] = useState(datos.clientes);
  const [rutas, setRutas] = useState(datos.rutas);
  const [seleccion, setSeleccion] = useState(() => new Set());
  const [arrastrando, setArrastrando] = useState(null);
  const [buscar, setBuscar] = useState("");
  const [moviendo, setMoviendo] = useState(null); // ids de clientes para el diálogo "Mover a…"
  const [ocupado, setOcupado] = useState(false);

  const sensores = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    // En el celular hay que mantener presionado un momento: así el desplazamiento normal sigue funcionando
    useSensor(TouchSensor, { activationConstraint: { delay: 220, tolerance: 8 } }),
    useSensor(KeyboardSensor)
  );

  const nombreCob = useMemo(() => Object.fromEntries(datos.cobradores.map((c) => [c.id, c.nombre])), [datos.cobradores]);
  const rutaPorId = useMemo(() => Object.fromEntries(rutas.map((r) => [r.id, r])), [rutas]);
  const q = buscar.trim().toLowerCase();
  const visibles = q ? clientes.filter((c) => c.nombre.toLowerCase().includes(q) || c.barrio?.toLowerCase().includes(q)) : clientes;

  function alternar(id) {
    setSeleccion((s) => {
      const n = new Set(s);
      n.has(id) ? n.delete(id) : n.add(id);
      return n;
    });
  }

  /** Destino a partir del id del contenedor sobre el que se soltó. */
  function destinoDe(overId) {
    if (!overId) return null;
    const [tipo, id] = String(overId).split(":");
    if (tipo === "ruta") return { cobrador_id: rutaPorId[id]?.cobrador_id, ruta_id: id };
    if (tipo === "cob" || tipo === "sinruta") return { cobrador_id: id, ruta_id: null };
    return null;
  }

  async function moverClientes(ids, destino) {
    const lista = clientes.filter((c) => ids.includes(c.id));
    const cambian = lista.filter((c) => c.cobrador_id !== destino.cobrador_id || (c.ruta_id ?? null) !== (destino.ruta_id ?? null));
    if (!cambian.length) return;
    const otroCobrador = cambian.some((c) => c.cobrador_id !== destino.cobrador_id);
    const donde = destino.ruta_id ? `la ruta ${rutaPorId[destino.ruta_id]?.nombre} de ${nombreCob[destino.cobrador_id]}` : nombreCob[destino.cobrador_id];
    if (otroCobrador) {
      const ok = await confirmar({
        titulo: cambian.length === 1 ? `¿Pasar a ${cambian[0].nombre}?` : `¿Pasar ${cambian.length} clientes?`,
        mensaje: `Pasan a ${donde} con sus préstamos activos. Los cobros ya hechos siguen a nombre de quien los cobró.`,
        textoConfirmar: "Sí, pasar",
      });
      if (!ok) return;
    }
    const antes = clientes;
    // Los movidos quedan al final de la ruta destino (igual que en el servidor)
    const movidos = new Set(cambian.map((c) => c.id));
    setClientes((cs) => [
      ...cs.filter((c) => !movidos.has(c.id)),
      ...cambian.map((c) => ({ ...c, cobrador_id: destino.cobrador_id, ruta_id: destino.ruta_id ?? null })),
    ]);
    setSeleccion(new Set());
    setOcupado(true);
    try {
      await api("/api/asignacion/clientes", { method: "POST", body: { clientes: cambian.map((c) => c.id), ...destino } });
      toast.success(cambian.length === 1 ? `${cambian[0].nombre} ahora está con ${nombreCob[destino.cobrador_id]}` : `${cambian.length} clientes pasaron a ${nombreCob[destino.cobrador_id]}`);
      router.refresh();
    } catch (err) {
      setClientes(antes);
      toast.error(err.message);
    } finally {
      setOcupado(false);
    }
  }

  async function moverRuta(rutaId, cobradorId) {
    const ruta = rutaPorId[rutaId];
    if (!ruta || !cobradorId || ruta.cobrador_id === cobradorId) return;
    const n = clientes.filter((c) => c.ruta_id === rutaId).length;
    const ok = await confirmar({
      titulo: `¿Pasar la ruta ${ruta.nombre}?`,
      mensaje: `La ruta completa (${n} cliente${n === 1 ? "" : "s"}, con sus préstamos activos) pasa de ${nombreCob[ruta.cobrador_id]} a ${nombreCob[cobradorId]}.`,
      textoConfirmar: "Sí, pasar la ruta",
    });
    if (!ok) return;
    const antes = { clientes, rutas };
    setRutas((rs) => rs.map((r) => (r.id === rutaId ? { ...r, cobrador_id: cobradorId } : r)));
    setClientes((cs) => cs.map((c) => (c.ruta_id === rutaId ? { ...c, cobrador_id: cobradorId } : c)));
    setOcupado(true);
    try {
      const r = await api("/api/asignacion/ruta", { method: "POST", body: { ruta_id: rutaId, cobrador_id: cobradorId } });
      if (r.ruta && r.ruta !== ruta.nombre) setRutas((rs) => rs.map((x) => (x.id === rutaId ? { ...x, nombre: r.ruta } : x)));
      toast.success(`La ruta ${r.ruta ?? ruta.nombre} ahora es de ${nombreCob[cobradorId]}`);
      router.refresh();
    } catch (err) {
      setClientes(antes.clientes);
      setRutas(antes.rutas);
      toast.error(err.message);
    } finally {
      setOcupado(false);
    }
  }

  function alSoltar({ active, over }) {
    setArrastrando(null);
    const destino = destinoDe(over?.id);
    if (!destino?.cobrador_id) return;
    const [tipo, id] = String(active.id).split(":");
    if (tipo === "ruta") return moverRuta(id, destino.cobrador_id);
    // Si el cliente arrastrado está marcado, se mueven todos los marcados
    const ids = seleccion.has(id) ? [...seleccion] : [id];
    moverClientes(ids, destino);
  }

  const activo = arrastrando && (() => {
    const [tipo, id] = arrastrando.split(":");
    if (tipo === "ruta") return { tipo, ruta: rutaPorId[id], n: clientes.filter((c) => c.ruta_id === id).length };
    const c = clientes.find((x) => x.id === id);
    return { tipo, cliente: c, n: seleccion.has(id) ? seleccion.size : 1 };
  })();

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2">
        <label className="relative min-w-0 flex-1">
          <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-suave" />
          <input
            value={buscar}
            onChange={(e) => setBuscar(e.target.value)}
            placeholder="Buscar cliente o barrio"
            className="h-10 w-full rounded-xl border border-borde bg-superficie pr-3 pl-9 text-sm outline-none focus:border-primario"
          />
        </label>
        {seleccion.size > 0 && (
          <div className="flex items-center gap-2 rounded-xl bg-primario-suave px-3 py-1.5 text-sm text-primario">
            <span className="font-semibold">{seleccion.size} marcado(s)</span>
            <Boton tamano="sm" onClick={() => setMoviendo([...seleccion])}>
              <ArrowRightLeft className="size-4" /> Mover
            </Boton>
            <button onClick={() => setSeleccion(new Set())} aria-label="Quitar selección" className="rounded-lg p-1 hover:bg-white/50">
              <X className="size-4" />
            </button>
          </div>
        )}
      </div>

      <DndContext sensors={sensores} collisionDetection={deteccion} onDragStart={(e) => setArrastrando(String(e.active.id))} onDragEnd={alSoltar} onDragCancel={() => setArrastrando(null)}>
        <div className={cn("flex flex-col gap-3 lg:flex-row lg:items-start lg:overflow-x-auto lg:pb-3", ocupado && "pointer-events-none opacity-70")}>
          {datos.cobradores.map((cob) => {
            const suyos = visibles.filter((c) => c.cobrador_id === cob.id);
            const susRutas = rutas.filter((r) => r.cobrador_id === cob.id);
            const total = clientes.filter((c) => c.cobrador_id === cob.id);
            return (
              <Columna key={cob.id} cobrador={cob} n={total.length} cartera={total.reduce((s, c) => s + Number(c.saldo), 0)}>
                {susRutas.map((r) => (
                  <BloqueRuta key={r.id} ruta={r} clientes={suyos.filter((c) => c.ruta_id === r.id)} buscando={!!q}>
                    {(c) => <TarjetaCliente key={c.id} c={c} marcado={seleccion.has(c.id)} onMarcar={() => alternar(c.id)} onMover={() => setMoviendo([c.id])} />}
                  </BloqueRuta>
                ))}
                <BloqueSinRuta cobradorId={cob.id} clientes={suyos.filter((c) => !c.ruta_id)} hayRutas={susRutas.length > 0}>
                  {(c) => <TarjetaCliente key={c.id} c={c} marcado={seleccion.has(c.id)} onMarcar={() => alternar(c.id)} onMover={() => setMoviendo([c.id])} />}
                </BloqueSinRuta>
              </Columna>
            );
          })}
        </div>
        <DragOverlay dropAnimation={null}>
          {activo?.tipo === "ruta" ? (
            <div className="flex items-center gap-2 rounded-xl bg-marino-900 px-3 py-2 text-sm font-semibold text-white shadow-xl">
              <IconoRuta className="size-4" /> {activo.ruta?.nombre} · {activo.n} clientes
            </div>
          ) : activo?.cliente ? (
            <div className="flex items-center gap-2 rounded-xl border border-primario bg-superficie px-3 py-2 text-sm font-semibold shadow-xl">
              {activo.cliente.nombre}
              {activo.n > 1 && <Insignia tono="info">+{activo.n - 1}</Insignia>}
            </div>
          ) : null}
        </DragOverlay>
      </DndContext>

      {moviendo && (
        <MoverA
          ids={moviendo}
          clientes={clientes}
          cobradores={datos.cobradores}
          rutas={rutas}
          onCerrar={() => setMoviendo(null)}
          onElegir={(destino) => {
            const ids = moviendo;
            setMoviendo(null);
            moverClientes(ids, destino);
          }}
        />
      )}
    </div>
  );
}

function Columna({ cobrador, n, cartera, children }) {
  const { setNodeRef, isOver } = useDroppable({ id: `cob:${cobrador.id}` });
  return (
    <section ref={setNodeRef} className={cn("tarjeta flex shrink-0 flex-col gap-2 p-3 transition-colors lg:w-80", isOver && "ring-2 ring-primario")}>
      <header className="flex items-center gap-2 px-1">
        <Avatar nombre={cobrador.nombre} className="size-8" />
        <div className="min-w-0 flex-1">
          <p className="truncate font-semibold">{cobrador.nombre}</p>
          <p className="text-xs text-suave">
            {n} cliente{n === 1 ? "" : "s"} · cartera {dinero(cartera)}
          </p>
        </div>
      </header>
      {children}
    </section>
  );
}

function BloqueRuta({ ruta, clientes, buscando, children }) {
  const [abierta, setAbierta] = useState(clientes.length <= 6);
  const { setNodeRef: refDestino, isOver } = useDroppable({ id: `ruta:${ruta.id}` });
  const { setNodeRef: refArrastre, listeners, attributes, isDragging } = useDraggable({ id: `ruta:${ruta.id}` });
  const ver = abierta || buscando;
  return (
    <div ref={refDestino} className={cn("rounded-xl border border-borde bg-fondo/60", isOver && "border-primario bg-primario-suave", isDragging && "opacity-40")}>
      <div className="flex items-center gap-1 px-1 py-1">
        <button ref={refArrastre} {...listeners} {...attributes} className="touch-none cursor-grab rounded-lg p-1.5 text-suave hover:bg-superficie" aria-label={`Arrastrar la ruta ${ruta.nombre}`}>
          <GripVertical className="size-4" />
        </button>
        <button onClick={() => setAbierta((a) => !a)} className="flex min-w-0 flex-1 items-center gap-2 py-1 text-left text-sm font-semibold">
          <IconoRuta className="size-4 shrink-0 text-primario" />
          <span className="truncate">{ruta.nombre}</span>
          <span className="text-xs font-normal text-suave">({clientes.length})</span>
          <ChevronDown className={cn("ml-auto size-4 shrink-0 text-suave transition-transform", ver && "rotate-180")} />
        </button>
      </div>
      {ver && <ul className="flex flex-col gap-1.5 px-2 pb-2">{clientes.length ? clientes.map(children) : <Vacio />}</ul>}
    </div>
  );
}

function BloqueSinRuta({ cobradorId, clientes, hayRutas, children }) {
  const { setNodeRef, isOver } = useDroppable({ id: `sinruta:${cobradorId}` });
  if (!hayRutas && !clientes.length) {
    return (
      <div ref={setNodeRef} className={cn("rounded-xl border border-dashed border-borde p-4 text-center text-xs text-suave", isOver && "border-primario bg-primario-suave")}>
        Suelta aquí clientes o una ruta
      </div>
    );
  }
  return (
    <div ref={setNodeRef} className={cn("rounded-xl border border-dashed border-borde p-2", isOver && "border-primario bg-primario-suave")}>
      <p className="px-1 pb-1.5 text-xs font-semibold text-suave">{hayRutas ? "Sin ruta" : "Clientes"}</p>
      <ul className="flex flex-col gap-1.5">{clientes.length ? clientes.map(children) : <Vacio />}</ul>
    </div>
  );
}

function Vacio() {
  return <li className="py-2 text-center text-xs text-suave">Sin clientes</li>;
}

function TarjetaCliente({ c, marcado, onMarcar, onMover }) {
  const { setNodeRef, listeners, attributes, isDragging } = useDraggable({ id: `cli:${c.id}` });
  return (
    <li
      ref={setNodeRef}
      {...listeners}
      {...attributes}
      className={cn(
        "flex cursor-grab items-center gap-2 rounded-xl border bg-superficie px-2 py-2 text-sm select-none",
        marcado ? "border-primario ring-1 ring-primario" : "border-borde",
        isDragging && "opacity-40"
      )}
    >
      <input
        type="checkbox"
        checked={marcado}
        onChange={onMarcar}
        onPointerDown={(e) => e.stopPropagation()}
        className="size-4 accent-primario"
        aria-label={`Marcar a ${c.nombre}`}
      />
      <div className="min-w-0 flex-1">
        <p className="truncate font-medium">{c.nombre}</p>
        <p className="truncate text-xs text-suave">
          {Number(c.saldo) > 0 ? `Debe ${dinero(c.saldo)}` : "Sin deuda"}
          {c.barrio && ` · ${c.barrio}`}
        </p>
      </div>
      {c.dias_atraso > 0 && <Insignia tono="peligro">{c.dias_atraso} d</Insignia>}
      <button onPointerDown={(e) => e.stopPropagation()} onClick={onMover} className="rounded-lg p-1.5 text-suave hover:bg-fondo hover:text-primario" aria-label={`Mover a ${c.nombre}`}>
        <ArrowRightLeft className="size-4" />
      </button>
    </li>
  );
}

/** Alternativa sin arrastrar: elegir cobrador y ruta de una lista. */
function MoverA({ ids, clientes, cobradores, rutas, onCerrar, onElegir }) {
  const primero = clientes.find((c) => c.id === ids[0]);
  const [cobrador, setCobrador] = useState(() => cobradores.find((c) => c.id !== primero?.cobrador_id)?.id ?? cobradores[0]?.id);
  const [ruta, setRuta] = useState("");
  const susRutas = rutas.filter((r) => r.cobrador_id === cobrador);
  return (
    <Hoja abierta onCerrar={onCerrar} titulo={ids.length === 1 ? `Mover a ${primero?.nombre}` : `Mover ${ids.length} clientes`} descripcion="Pasan con sus préstamos activos.">
      <form
        className="flex flex-col gap-3"
        onSubmit={(e) => {
          e.preventDefault();
          onElegir({ cobrador_id: cobrador, ruta_id: ruta || null });
        }}
      >
        <Campo
          as="select"
          etiqueta="Cobrador"
          value={cobrador}
          onChange={(e) => {
            setCobrador(e.target.value);
            setRuta("");
          }}
        >
          {cobradores.map((c) => (
            <option key={c.id} value={c.id}>
              {c.nombre}
            </option>
          ))}
        </Campo>
        <Campo as="select" etiqueta="Ruta" value={ruta} onChange={(e) => setRuta(e.target.value)}>
          <option value="">Sin ruta</option>
          {susRutas.map((r) => (
            <option key={r.id} value={r.id}>
              {r.nombre}
            </option>
          ))}
        </Campo>
        <Boton type="submit" tamano="lg">
          Mover
        </Boton>
      </form>
    </Hoja>
  );
}
