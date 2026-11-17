"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Camera, ImageOff, Loader2, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Hoja } from "@/components/ui/Hoja";
import { Boton } from "@/components/ui/Boton";
import { confirmar } from "@/components/ui/Dialogos";
import { api } from "@/lib/api";
import { comprimirFoto } from "@/lib/imagen";
import { sincronizador } from "@/lib/offline/sync";
import { useSync } from "@/lib/offline/hooks";
import { fecha } from "@/lib/formato";
import { encolarFoto } from "./CapturaFotos";

const NOMBRE = { casa: "Casa", cedula: "Cédula", otra: "Otra" };

/** Fotos del cliente (enlaces temporales y privados) + agregar más, también sin señal. */
export function FotosCliente({ clienteId, nombre, fotos, puedeQuitar }) {
  const router = useRouter();
  const { pendientes } = useSync();
  const [abierta, setAbierta] = useState(null);
  const [tipo, setTipo] = useState("casa");
  const [procesando, setProcesando] = useState(false);
  const input = useRef(null);
  const enCola = pendientes.filter((p) => p.tipo === "foto" && p.url === `/api/clientes/${clienteId}/fotos`);

  // Cuando una foto de este cliente termina de subir, se recarga la galería
  useEffect(
    () => sincronizador?.alEvento((e) => e.tipo === "aplicado" && e.op.url === `/api/clientes/${clienteId}/fotos` && router.refresh()),
    [clienteId, router]
  );

  async function elegir(e) {
    const archivo = e.target.files?.[0];
    e.target.value = "";
    if (!archivo) return;
    setProcesando(true);
    try {
      const blob = await comprimirFoto(archivo);
      await encolarFoto({ clienteId, tipo, blob, nombreCliente: nombre });
      toast.success(navigator.onLine ? "Subiendo la foto…" : "Foto guardada en el teléfono", { description: navigator.onLine ? undefined : "Se subirá sola cuando haya señal." });
    } catch (err) {
      toast.error(err.message);
    } finally {
      setProcesando(false);
    }
  }

  async function quitar(f) {
    const ok = await confirmar({ titulo: "¿Quitar esta foto?", mensaje: "Dejará de mostrarse en la ficha del cliente.", textoConfirmar: "Quitar", peligro: true });
    if (!ok) return;
    try {
      await api(`/api/clientes/${clienteId}/fotos/${f.id}`, { method: "DELETE" });
      setAbierta(null);
      toast.success("Foto quitada");
      router.refresh();
    } catch (err) {
      toast.error(err.message);
    }
  }

  return (
    <section className="tarjeta flex flex-col gap-3 p-4">
      <div className="flex flex-wrap items-center gap-2">
        <h2 className="flex-1 font-semibold">Fotos</h2>
        <select value={tipo} onChange={(e) => setTipo(e.target.value)} className="h-9 rounded-xl border border-borde bg-superficie px-2 text-sm" aria-label="Tipo de foto">
          <option value="casa">Casa</option>
          <option value="cedula">Cédula</option>
          <option value="otra">Otra</option>
        </select>
        <Boton tamano="sm" variante="secundario" onClick={() => input.current?.click()} disabled={procesando}>
          {procesando ? <Loader2 className="size-4 animate-spin" /> : <Camera className="size-4" />} Agregar
        </Boton>
        <input ref={input} type="file" accept="image/*" capture="environment" onChange={elegir} className="hidden" />
      </div>

      {fotos.length === 0 && enCola.length === 0 ? (
        <p className="flex items-center gap-2 rounded-xl bg-fondo p-3 text-sm text-suave">
          <ImageOff className="size-4" /> Sin fotos todavía.
        </p>
      ) : (
        <ul className="grid grid-cols-3 gap-2 sm:grid-cols-4">
          {fotos.map((f) => (
            <li key={f.id}>
              <button onClick={() => setAbierta(f)} className="relative block aspect-square w-full overflow-hidden rounded-xl bg-fondo">
                {/* eslint-disable-next-line @next/next/no-img-element -- enlace firmado y temporal de S3 */}
                <img src={f.url} alt={`${NOMBRE[f.tipo]} de ${nombre}`} loading="lazy" className="size-full object-cover" />
                <span className="absolute bottom-1 left-1 rounded-md bg-black/60 px-1.5 py-0.5 text-[10px] font-semibold text-white">{NOMBRE[f.tipo]}</span>
              </button>
            </li>
          ))}
          {enCola.map((p) => (
            <li key={p.id} className="flex aspect-square flex-col items-center justify-center gap-1 rounded-xl border border-dashed border-borde p-2 text-center text-[11px] text-suave">
              {p.estado === "error" ? <span className="text-peligro">No se pudo subir</span> : <Loader2 className="size-5 animate-spin" />}
              {p.estado === "error" ? p.error : "Por subir"}
            </li>
          ))}
        </ul>
      )}

      <Hoja abierta={!!abierta} onCerrar={() => setAbierta(null)} titulo={abierta ? `${NOMBRE[abierta.tipo]} · ${nombre}` : ""}>
        {abierta && (
          <div className="flex flex-col gap-3">
            {/* eslint-disable-next-line @next/next/no-img-element -- enlace firmado y temporal de S3 */}
            <img src={abierta.url} alt={`${NOMBRE[abierta.tipo]} de ${nombre}`} className="max-h-[70dvh] w-full rounded-xl object-contain" />
            <div className="flex items-center justify-between gap-2 text-xs text-suave">
              <span>
                {fecha(abierta.creado_en)}
                {abierta.subido_por_nombre && ` · ${abierta.subido_por_nombre}`}
              </span>
              {puedeQuitar && (
                <Boton tamano="sm" variante="fantasma" onClick={() => quitar(abierta)} className="text-peligro">
                  <Trash2 className="size-4" /> Quitar
                </Boton>
              )}
            </div>
          </div>
        )}
      </Hoja>
    </section>
  );
}
