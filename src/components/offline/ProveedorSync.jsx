"use client";

import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { sincronizador } from "@/lib/offline/sync";

// Pantallas que deben abrir sin internet: se guardan en el teléfono apenas se inicia sesión.
const RUTAS_OFFLINE = ["/ruta", "/caja", "/clientes/nuevo", "/prestamos/nuevo", "/inicio"];

/** Arranca la sincronización y el service worker para el usuario de la sesión. */
export function ProveedorSync({ usuario }) {
  const router = useRouter();
  const refrescar = useRef(null);

  useEffect(() => {
    if (!sincronizador || usuario.rol === "super_admin") return;
    sincronizador.iniciar(usuario);

    const quitar = sincronizador.alEvento((e) => {
      // Los formularios que esperan la respuesta (interactivo) muestran el error ellos mismos
      if (e.tipo === "rechazado" && !e.op.interactivo) {
        toast.error(`No se pudo guardar: ${e.op.descripcion ?? "operación"}`, { description: e.error, duration: 10_000 });
      }
      // Las pantallas del servidor se actualizan cuando lo pendiente ya llegó
      if (e.tipo === "sincronizado") {
        clearTimeout(refrescar.current);
        refrescar.current = setTimeout(() => router.refresh(), 300);
      }
    });
    return quitar;
  }, [usuario, router]);

  useEffect(() => {
    if (process.env.NODE_ENV !== "production" || !("serviceWorker" in navigator) || usuario.rol === "super_admin") return;
    navigator.serviceWorker
      .register("/sw.js", { scope: "/" })
      .then(() => navigator.serviceWorker.ready)
      .then((reg) => reg.active?.postMessage({ tipo: "precargar", rutas: RUTAS_OFFLINE }))
      .catch(() => {});
  }, [usuario.rol]);

  return null;
}

/** Al cerrar sesión: borra datos y páginas guardadas (la cola sin enviar se conserva). */
export async function limpiarOffline() {
  await sincronizador?.cerrarSesion();
  const reg = await navigator.serviceWorker?.getRegistration?.();
  reg?.active?.postMessage({ tipo: "limpiar" });
}
