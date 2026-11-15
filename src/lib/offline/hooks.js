"use client";

import { useMemo, useSyncExternalStore } from "react";
import { sincronizador } from "./sync";
import { construirVista } from "./vista";
import { hoyBogota } from "../fechas";

const ESTADO_SERVIDOR = { usuarioId: null, listo: false, enLinea: true, sincronizando: false, datos: null, pendientes: [], ultimaSync: null, sesionVencida: false };
const nada = () => () => {};

/** Estado de la sincronización (conexión, cola, datos descargados). */
export function useSync() {
  return useSyncExternalStore(
    sincronizador?.suscribir ?? nada,
    sincronizador?.obtener ?? (() => ESTADO_SERVIDOR),
    () => ESTADO_SERVIDOR
  );
}

/** Datos locales listos para mostrar (descargados + pendientes, recalculados). */
export function useVista() {
  const { datos, pendientes } = useSync();
  const hoy = hoyBogota();
  return useMemo(() => construirVista(datos, pendientes, hoy), [datos, pendientes, hoy]);
}
