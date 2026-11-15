"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Plus } from "lucide-react";
import { toast } from "sonner";
import { Boton } from "@/components/ui/Boton";
import { Campo } from "@/components/ui/Campo";
import { api } from "@/lib/api";

/**
 * Crear o editar cliente.
 * @param cobradores  [{id, nombre}] que puede elegir (1 si es cobrador)
 * @param cliente     datos actuales (edición) o undefined (nuevo)
 */
export function FormCliente({ cobradores, cliente, esJefe }) {
  const router = useRouter();
  const editando = !!cliente;
  const [cobradorId, setCobradorId] = useState(cliente?.cobrador_id ?? (cobradores.length === 1 ? cobradores[0].id : ""));
  const [rutas, setRutas] = useState([]);
  const [rutaId, setRutaId] = useState(cliente?.ruta_id ?? "");
  const [errores, setErrores] = useState({});
  const [enviando, setEnviando] = useState(false);

  useEffect(() => {
    if (!cobradorId) return;
    let vivo = true;
    api(`/api/rutas?cobrador=${cobradorId}`)
      .then((d) => vivo && setRutas(d.rutas))
      .catch(() => vivo && setRutas([]));
    return () => {
      vivo = false;
    };
  }, [cobradorId]);

  async function nuevaRuta() {
    const nombre = window.prompt("Nombre de la nueva ruta (ej: Centro, Barrio Norte)");
    if (!nombre?.trim()) return;
    try {
      const { ruta } = await api("/api/rutas", { method: "POST", body: { nombre, cobrador_id: cobradorId } });
      setRutas((r) => [...r, ruta]);
      setRutaId(ruta.id);
      toast.success(`Ruta "${ruta.nombre}" creada`);
    } catch (err) {
      toast.error(err.message);
    }
  }

  async function enviar(e) {
    e.preventDefault();
    setEnviando(true);
    setErrores({});
    const f = Object.fromEntries(new FormData(e.currentTarget));
    const datos = { ...f, ruta_id: rutaId || null };
    if (esJefe) datos.cobrador_id = cobradorId || undefined;
    else delete datos.cobrador_id;
    try {
      if (editando) {
        await api(`/api/clientes/${cliente.id}`, { method: "PATCH", body: datos });
        toast.success("Cliente actualizado");
        router.push(`/clientes/${cliente.id}`);
      } else {
        const { cliente: nuevo } = await api("/api/clientes", { method: "POST", body: { ...datos, id: crypto.randomUUID() } });
        toast.success("Cliente creado");
        router.push(`/clientes/${nuevo.id}`);
      }
      router.refresh();
    } catch (err) {
      setErrores({ ...Object.fromEntries((err.campos ?? []).map((c) => [c.campo, c.mensaje])), general: err.campos ? "" : err.message });
      setEnviando(false);
    }
  }

  return (
    <form onSubmit={enviar} className="tarjeta grid gap-4 p-5 sm:grid-cols-2 sm:p-6">
      <Campo etiqueta="Nombre completo" name="nombre" defaultValue={cliente?.nombre} required autoFocus={!editando} error={errores.nombre} className="sm:col-span-2" />
      <Campo etiqueta="Cédula" name="cedula" inputMode="numeric" defaultValue={cliente?.cedula ?? ""} error={errores.cedula} />
      <Campo etiqueta="Celular" name="telefono" type="tel" inputMode="tel" defaultValue={cliente?.telefono ?? ""} error={errores.telefono} />
      <Campo etiqueta="Dirección" name="direccion" defaultValue={cliente?.direccion ?? ""} error={errores.direccion} className="sm:col-span-2" />
      <Campo etiqueta="Barrio" name="barrio" defaultValue={cliente?.barrio ?? ""} />
      <Campo etiqueta="Ciudad" name="ciudad" defaultValue={cliente?.ciudad ?? ""} />

      {esJefe && cobradores.length > 0 && (
        <Campo
          as="select"
          etiqueta="Cobrador"
          value={cobradorId}
          onChange={(e) => {
            setCobradorId(e.target.value);
            setRutaId("");
          }}
          required
          error={errores.cobrador_id}
        >
          <option value="" disabled>
            Elegir…
          </option>
          {cobradores.map((c) => (
            <option key={c.id} value={c.id}>
              {c.nombre}
            </option>
          ))}
        </Campo>
      )}
      {esJefe && cobradores.length === 0 && (
        <p className="rounded-xl bg-alerta-suave p-3 text-sm text-alerta sm:col-span-2">No tienes cobradores activos a cargo. Pide al administrador que los cree.</p>
      )}

      <div className="flex items-end gap-2">
        <Campo as="select" etiqueta="Ruta" value={rutaId} onChange={(e) => setRutaId(e.target.value)} disabled={!cobradorId} className="flex-1">
          <option value="">Sin ruta</option>
          {rutas.map((r) => (
            <option key={r.id} value={r.id}>
              {r.nombre}
            </option>
          ))}
        </Campo>
        <Boton type="button" variante="secundario" onClick={nuevaRuta} disabled={!cobradorId} aria-label="Nueva ruta">
          <Plus className="size-4" />
        </Boton>
      </div>

      <Campo etiqueta="Recomendado por" name="referencia" defaultValue={cliente?.referencia ?? ""} />
      <Campo as="textarea" etiqueta="Notas" name="notas" defaultValue={cliente?.notas ?? ""} rows={3} className="sm:col-span-2 [&_textarea]:h-auto [&_textarea]:py-2.5" />

      {errores.general && <p className="rounded-xl bg-peligro-suave px-3 py-2 text-sm text-peligro sm:col-span-2">{errores.general}</p>}

      <div className="flex justify-end gap-2 sm:col-span-2">
        <Boton type="button" variante="fantasma" onClick={() => router.back()}>
          Cancelar
        </Boton>
        <Boton type="submit" cargando={enviando}>
          {editando ? "Guardar cambios" : "Crear cliente"}
        </Boton>
      </div>
    </form>
  );
}
