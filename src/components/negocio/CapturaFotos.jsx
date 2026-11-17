"use client";

import { useEffect, useRef, useState } from "react";
import { Camera, Home, IdCard, X, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { comprimirFoto } from "@/lib/imagen";
import { sincronizador } from "@/lib/offline/sync";
import { cn } from "@/lib/cn";

export const RANURAS = [
  { tipo: "casa", etiqueta: "Foto de la casa", icono: Home },
  { tipo: "cedula", etiqueta: "Foto de la cédula", icono: IdCard },
];

/** Encola la subida de una foto: se guarda en el teléfono y se envía sola cuando hay señal. */
export function encolarFoto({ clienteId, tipo, blob, nombreCliente }) {
  const id = crypto.randomUUID();
  return sincronizador.encolar({
    id,
    tipo: "foto",
    url: `/api/clientes/${clienteId}/fotos`,
    body: { id, tipo },
    archivo: blob,
    descripcion: `Foto (${tipo === "casa" ? "casa" : tipo === "cedula" ? "cédula" : "otra"}) de ${nombreCliente}`,
  });
}

/**
 * Dos espacios para fotos (casa y cédula), tomadas con la cámara trasera.
 * `valor` = { casa: Blob|null, cedula: Blob|null }
 */
export function CapturaFotos({ valor, onCambio, error }) {
  return (
    <div className="flex flex-col gap-2 sm:col-span-2">
      <p className="text-sm font-medium">
        Fotos <span className="font-normal text-suave">(mínimo una)</span>
      </p>
      <div className="grid grid-cols-2 gap-3">
        {RANURAS.map((r) => (
          <Ranura key={r.tipo} ranura={r} blob={valor[r.tipo]} onCambio={(b) => onCambio({ ...valor, [r.tipo]: b })} />
        ))}
      </div>
      {error && <p className="text-sm text-peligro">{error}</p>}
    </div>
  );
}

function Ranura({ ranura, blob, onCambio }) {
  const input = useRef(null);
  const [procesando, setProcesando] = useState(false);
  const [vista, setVista] = useState(null);

  useEffect(() => {
    if (!blob) return;
    const url = URL.createObjectURL(blob);
    const t = setTimeout(() => setVista(url), 0);
    return () => {
      clearTimeout(t);
      URL.revokeObjectURL(url);
    };
  }, [blob]);

  async function elegir(e) {
    const archivo = e.target.files?.[0];
    e.target.value = "";
    if (!archivo) return;
    setProcesando(true);
    try {
      onCambio(await comprimirFoto(archivo));
    } catch (err) {
      toast.error(err.message);
    } finally {
      setProcesando(false);
    }
  }

  const Icono = ranura.icono;
  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => input.current?.click()}
        className={cn(
          "flex aspect-[4/3] w-full flex-col items-center justify-center gap-1.5 overflow-hidden rounded-2xl border-2 text-xs font-semibold",
          blob ? "border-exito" : "border-dashed border-borde text-suave hover:border-primario hover:text-primario"
        )}
      >
        {procesando ? (
          <Loader2 className="size-6 animate-spin" />
        ) : blob && vista ? (
          // eslint-disable-next-line @next/next/no-img-element -- vista previa local (blob:)
          <img src={vista} alt={ranura.etiqueta} className="size-full object-cover" />
        ) : (
          <>
            <span className="flex items-center gap-1">
              <Icono className="size-5" /> <Camera className="size-5" />
            </span>
            {ranura.etiqueta}
          </>
        )}
      </button>
      {blob && (
        <button
          type="button"
          onClick={() => {
            onCambio(null);
            setVista(null);
          }}
          className="absolute top-1.5 right-1.5 rounded-full bg-black/60 p-1 text-white"
          aria-label={`Quitar ${ranura.etiqueta}`}
        >
          <X className="size-4" />
        </button>
      )}
      <input ref={input} type="file" accept="image/*" capture="environment" onChange={elegir} className="hidden" />
    </div>
  );
}
