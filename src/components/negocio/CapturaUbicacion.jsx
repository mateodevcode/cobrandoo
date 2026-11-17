"use client";

import { useState } from "react";
import { Crosshair, Loader2, MapPin, X } from "lucide-react";
import { Boton } from "@/components/ui/Boton";

export const enlaceMapa = (lat, lng) => `https://www.google.com/maps/search/?api=1&query=${lat},${lng}`;

/**
 * Guarda la ubicación GPS del celular (se toma estando en la casa del cliente).
 * `valor` = { latitud, longitud, ubicacion_precision } o null.
 */
export function CapturaUbicacion({ valor, onCambio }) {
  const [buscando, setBuscando] = useState(false);
  const [error, setError] = useState("");

  function tomar() {
    if (!navigator.geolocation) return setError("Este celular no permite obtener la ubicación.");
    setBuscando(true);
    setError("");
    navigator.geolocation.getCurrentPosition(
      (p) => {
        setBuscando(false);
        onCambio({
          latitud: Number(p.coords.latitude.toFixed(6)),
          longitud: Number(p.coords.longitude.toFixed(6)),
          ubicacion_precision: Math.round(p.coords.accuracy),
        });
      },
      (e) => {
        setBuscando(false);
        setError(e.code === 1 ? "Diste 'no permitir'. Actívalo en los permisos del navegador para este sitio." : "No se pudo obtener la ubicación. Intenta al aire libre.");
      },
      { enableHighAccuracy: true, timeout: 20_000, maximumAge: 30_000 }
    );
  }

  return (
    <div className="flex flex-col gap-1.5 sm:col-span-2">
      <p className="text-sm font-medium">
        Ubicación <span className="font-normal text-suave">(opcional, tómala estando en la casa)</span>
      </p>
      {valor?.latitud != null ? (
        <div className="flex items-center gap-2 rounded-xl bg-exito-suave px-3 py-2 text-sm text-exito">
          <MapPin className="size-4 shrink-0" />
          <a href={enlaceMapa(valor.latitud, valor.longitud)} target="_blank" rel="noopener noreferrer" className="flex-1 font-semibold underline">
            Ubicación guardada{valor.ubicacion_precision ? ` (±${valor.ubicacion_precision} m)` : ""}
          </a>
          <button type="button" onClick={tomar} className="rounded-lg p-1 hover:bg-white/50" aria-label="Tomar de nuevo">
            <Crosshair className="size-4" />
          </button>
          <button type="button" onClick={() => onCambio(null)} className="rounded-lg p-1 hover:bg-white/50" aria-label="Quitar ubicación">
            <X className="size-4" />
          </button>
        </div>
      ) : (
        <Boton type="button" variante="secundario" onClick={tomar} disabled={buscando} className="w-fit">
          {buscando ? <Loader2 className="size-4 animate-spin" /> : <Crosshair className="size-4" />}
          {buscando ? "Buscando…" : "Guardar ubicación actual"}
        </Boton>
      )}
      {error && <p className="text-sm text-peligro">{error}</p>}
    </div>
  );
}
