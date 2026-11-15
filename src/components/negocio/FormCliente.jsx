"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Plus } from "lucide-react";
import { toast } from "sonner";
import { Boton } from "@/components/ui/Boton";
import { Campo } from "@/components/ui/Campo";
import { api } from "@/lib/api";
import { sincronizador } from "@/lib/offline/sync";
import { useSync } from "@/lib/offline/hooks";

/**
 * Crear (funciona sin señal) o editar (necesita internet) un cliente.
 * @param usuarioId   usuario de la sesión (si es cobrador, es su propio cobrador)
 * @param cobradores  [{id, nombre}] que puede elegir un jefe
 * @param cliente     datos actuales (edición) o undefined (nuevo)
 */
export function FormCliente({ usuarioId, cobradores, cliente, esJefe }) {
  const router = useRouter();
  const { datos } = useSync();
  const editando = !!cliente;
  const [cobradorId, setCobradorId] = useState(cliente?.cobrador_id ?? (esJefe ? (cobradores.length === 1 ? cobradores[0].id : "") : usuarioId));
  const [rutasNuevas, setRutasNuevas] = useState([]);
  const rutas = [...(datos?.rutas ?? []), ...rutasNuevas].filter((r) => r.cobrador_id === cobradorId);
  const [rutaId, setRutaId] = useState(cliente?.ruta_id ?? "");
  const [errores, setErrores] = useState({});
  const [enviando, setEnviando] = useState(false);

  async function nuevaRuta() {
    if (!navigator.onLine) return toast.error("Necesitas internet para crear una ruta nueva");
    const nombre = window.prompt("Nombre de la nueva ruta (ej: Centro, Barrio Norte)");
    if (!nombre?.trim()) return;
    try {
      const { ruta } = await api("/api/rutas", { method: "POST", body: { nombre, cobrador_id: cobradorId } });
      setRutasNuevas((r) => [...r, ruta]);
      setRutaId(ruta.id);
      sincronizador.sincronizar();
      toast.success(`Ruta "${ruta.nombre}" creada`);
    } catch (err) {
      toast.error(err.message);
    }
  }

  async function enviar(e) {
    e.preventDefault();
    setErrores({});
    const f = Object.fromEntries(new FormData(e.currentTarget));
    if (!f.nombre?.trim() || f.nombre.trim().length < 2) return setErrores({ nombre: "Escribe el nombre" });
    if (esJefe && !cobradorId) return setErrores({ cobrador_id: "Elige el cobrador" });
    const datosForm = { ...f, ruta_id: rutaId || null, ...(esJefe ? { cobrador_id: cobradorId } : {}) };
    setEnviando(true);

    if (editando) {
      try {
        await api(`/api/clientes/${cliente.id}`, { method: "PATCH", body: datosForm });
        toast.success("Cliente actualizado");
        router.push(`/clientes/${cliente.id}`);
        router.refresh();
      } catch (err) {
        mostrarError(err.campos, err.message);
      }
      return;
    }

    // Nuevo: se guarda en el teléfono y se envía; con señal esperamos la respuesta para mostrar errores aquí
    const id = crypto.randomUUID();
    const r = await sincronizador.encolarYEsperar({
      id,
      tipo: "cliente",
      url: "/api/clientes",
      body: { ...datosForm, id },
      local: { cobrador_id: cobradorId },
      descripcion: `Nuevo cliente: ${f.nombre}`,
    }, 8000);

    if (r.error) {
      await sincronizador.descartar(id);
      return mostrarError(null, r.error);
    }
    if (r.enviado) {
      toast.success("Cliente creado");
      router.push(`/clientes/${id}`);
    } else {
      toast.success("Cliente guardado en el teléfono", { description: "Se enviará solo cuando haya señal. Ya puedes hacerle el préstamo." });
      router.push(`/prestamos/nuevo?cliente=${id}`);
    }
  }

  function mostrarError(campos, mensaje) {
    setErrores({ ...Object.fromEntries((campos ?? []).map((c) => [c.campo, c.mensaje])), general: campos ? "" : mensaje });
    setEnviando(false);
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
