"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { Bell, BellRing } from "lucide-react";
import { toast } from "sonner";
import { Boton } from "@/components/ui/Boton";
import { Hoja } from "@/components/ui/Hoja";
import { api } from "@/lib/api";
import { activarPush, desactivarPush, estadoPush } from "@/lib/push";
import { cn } from "@/lib/cn";
import { EVENTO_NOTIFICACION } from "./ProveedorTiempoReal";

/** Campana con la bandeja de avisos y el botón para activar notificaciones en el teléfono. */
export function Campana({ oscuro, className }) {
  const [abierta, setAbierta] = useState(false);
  const [datos, setDatos] = useState({ notificaciones: [], sinLeer: 0 });
  const [push, setPush] = useState("no_disponible");
  const [activando, setActivando] = useState(false);

  const cargar = useCallback(() => {
    if (!navigator.onLine) return;
    api("/api/notificaciones", { redirigir: false }).then(setDatos).catch(() => {});
  }, []);

  useEffect(() => {
    // Primera carga diferida (fuera del render) y luego cada minuto o cuando llega un aviso en vivo
    const inicio = setTimeout(cargar, 0);
    const t = setInterval(cargar, 60_000);
    window.addEventListener(EVENTO_NOTIFICACION, cargar);
    return () => {
      clearTimeout(inicio);
      clearInterval(t);
      window.removeEventListener(EVENTO_NOTIFICACION, cargar);
    };
  }, [cargar]);

  async function abrir() {
    setAbierta(true);
    estadoPush().then(setPush);
    if (datos.sinLeer > 0) {
      await api("/api/notificaciones/leer", { method: "POST", body: {}, redirigir: false }).catch(() => {});
      setDatos((d) => ({ ...d, sinLeer: 0 }));
    }
  }

  async function alternarPush() {
    setActivando(true);
    try {
      if (push === "activo") {
        await desactivarPush();
        toast.success("Notificaciones desactivadas en este teléfono");
      } else {
        await activarPush();
        toast.success("¡Listo! Recibirás avisos aunque la app esté cerrada.");
      }
      setPush(await estadoPush());
    } catch (err) {
      toast.error(err.message);
    } finally {
      setActivando(false);
    }
  }

  return (
    <>
      <button
        onClick={abrir}
        className={cn("relative rounded-full p-2", oscuro ? "text-white/70 hover:bg-white/10 hover:text-white" : "text-suave hover:bg-fondo hover:text-texto", className)}
        aria-label={datos.sinLeer ? `Notificaciones: ${datos.sinLeer} sin leer` : "Notificaciones"}
      >
        {datos.sinLeer ? <BellRing className="size-5" /> : <Bell className="size-5" />}
        {datos.sinLeer > 0 && (
          <span className="absolute -top-0.5 -right-0.5 flex min-w-5 items-center justify-center rounded-full bg-peligro px-1 text-[10px] font-bold text-white">
            {datos.sinLeer > 9 ? "9+" : datos.sinLeer}
          </span>
        )}
      </button>

      <Hoja abierta={abierta} onCerrar={() => setAbierta(false)} titulo="Notificaciones">
        <div className="flex flex-col gap-4">
          {push !== "no_disponible" && push !== "activo" && (
            <div className="rounded-2xl bg-primario-suave p-4 text-sm">
              <p className="font-semibold text-primario">Recibe avisos en este teléfono</p>
              <p className="mt-1 text-suave">
                {push === "bloqueado"
                  ? "Bloqueaste las notificaciones. Actívalas en los ajustes del navegador para este sitio."
                  : "Te avisamos al instante cuando cierren el día, te entreguen base o revisen tu cuadre, aunque la app esté cerrada."}
              </p>
              {push === "inactivo" && (
                <Boton tamano="sm" className="mt-3" cargando={activando} onClick={alternarPush}>
                  Activar notificaciones
                </Boton>
              )}
            </div>
          )}

          {datos.notificaciones.length === 0 ? (
            <p className="py-6 text-center text-sm text-suave">No tienes notificaciones.</p>
          ) : (
            <ul className="divide-y divide-borde">
              {datos.notificaciones.map((n) => (
                <li key={n.id}>
                  <Link href={n.url ?? "#"} onClick={() => setAbierta(false)} className="flex gap-3 py-3">
                    <span className={cn("mt-1.5 size-2 shrink-0 rounded-full", n.leida_en ? "bg-transparent" : "bg-primario")} />
                    <span className="min-w-0 flex-1">
                      <span className="block text-sm font-semibold">{n.titulo}</span>
                      {n.cuerpo && <span className="block text-sm text-suave">{n.cuerpo}</span>}
                      <span className="block text-xs text-suave">
                        {new Date(n.creado_en).toLocaleString("es-CO", { dateStyle: "short", timeStyle: "short", timeZone: "America/Bogota" })}
                      </span>
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          )}

          {push === "activo" && (
            <button onClick={alternarPush} disabled={activando} className="text-xs text-suave underline">
              Desactivar notificaciones en este teléfono
            </button>
          )}
        </div>
      </Hoja>
    </>
  );
}
