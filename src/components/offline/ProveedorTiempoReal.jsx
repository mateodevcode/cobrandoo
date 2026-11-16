"use client";

import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { connect } from "@/lib/socket-core.mjs";
import { api } from "@/lib/api";
import { sincronizador } from "@/lib/offline/sync";

export const EVENTO_NOTIFICACION = "cobrandoo:notificacion";

/**
 * Conexión en vivo con socket-core. Recibe:
 *  - "notificacion": aviso con título (cierre del día, base recibida…) → toast + campana
 *  - "actividad": hubo un cobro/préstamo/gasto en el equipo → refresca números
 * Si el hub no está configurado o no responde, la app sigue igual (la campana consulta sola).
 */
export function ProveedorTiempoReal({ config }) {
  const router = useRouter();
  const refrescar = useRef(null);

  useEffect(() => {
    if (!config?.url || !config?.canal || typeof WebSocket === "undefined") return;
    const sc = connect({
      url: config.url,
      channel: config.canal,
      device: "web",
      tokenProvider: () => api("/api/socket-token", { method: "POST", redirigir: false }),
    });

    sc.on("message", (ev) => {
      const p = ev.payload ?? {};
      if (p.tipo === "notificacion") {
        const n = p.notificacion ?? {};
        toast(n.titulo, {
          description: n.cuerpo,
          duration: 8000,
          action: n.url ? { label: "Ver", onClick: () => router.push(n.url) } : undefined,
        });
        window.dispatchEvent(new CustomEvent(EVENTO_NOTIFICACION, { detail: n }));
      }
      if (p.tipo === "notificacion" || p.tipo === "actividad") {
        // Varios eventos seguidos → un solo refresco
        clearTimeout(refrescar.current);
        refrescar.current = setTimeout(() => {
          router.refresh();
          sincronizador?.sincronizar();
        }, 1200);
      }
    });
    return () => {
      clearTimeout(refrescar.current);
      sc.close();
    };
  }, [config?.url, config?.canal, router]);

  return null;
}
