"use client";

// Sincronizador: guarda cada operación en el teléfono (cola), la envía al servidor apenas hay
// señal y descarga los datos frescos. Todas las APIs son idempotentes por id, así que reintentar
// nunca duplica nada.
import { api, ErrorApi } from "../api";
import * as local from "./db";

const INTERVALO_MS = 45_000;
const TIMEOUT_MS = 20_000;
const TIMEOUT_ARCHIVO_MS = 90_000; // fotos con señal lenta

/** Las operaciones con archivo (fotos) viajan como formulario; el resto, como JSON. */
function cuerpo(op) {
  if (!op.archivo) return op.body;
  const f = new FormData();
  for (const [k, v] of Object.entries(op.body)) f.append(k, v);
  f.append("archivo", op.archivo, `${op.body.id}.jpg`);
  return f;
}

/** ¿El error significa "no hay red" (reintentar luego) y no "el servidor lo rechazó"? */
const esErrorDeRed = (err) =>
  !(err instanceof ErrorApi) || err.status === 0 || err.status >= 500 || err.status === 408 || err.status === 429 || err.status === 401;

class Sincronizador {
  estado = {
    usuarioId: null,
    listo: false,
    enLinea: true,
    sincronizando: false,
    datos: null,
    pendientes: [],
    ultimaSync: null,
    sesionVencida: false,
  };
  oyentes = new Set();
  eventos = new Set();
  corriendo = null;
  repetir = false;

  suscribir = (fn) => {
    this.oyentes.add(fn);
    return () => this.oyentes.delete(fn);
  };
  obtener = () => this.estado;
  /** Eventos: { tipo: "aplicado" | "rechazado", op, error } */
  alEvento(fn) {
    this.eventos.add(fn);
    return () => this.eventos.delete(fn);
  }

  set(cambios) {
    this.estado = { ...this.estado, ...cambios };
    this.oyentes.forEach((fn) => fn());
  }
  emitir(e) {
    this.eventos.forEach((fn) => fn(e));
  }

  async iniciar(usuario) {
    if (this.estado.usuarioId === usuario.id) return;
    const [datos, pendientes] = await Promise.all([local.leerDatos(usuario.id), local.listarPendientes(usuario.id)]);
    this.set({ usuarioId: usuario.id, datos: datos ?? null, pendientes, listo: true, enLinea: navigator.onLine, ultimaSync: datos?.generado_en ?? null });

    if (!this.iniciado) {
      this.iniciado = true;
      window.addEventListener("online", () => {
        this.set({ enLinea: true });
        this.sincronizar();
      });
      window.addEventListener("offline", () => this.set({ enLinea: false }));
      document.addEventListener("visibilitychange", () => document.visibilityState === "visible" && this.sincronizar());
      setInterval(() => this.sincronizar(), INTERVALO_MS);
    }
    this.sincronizar();
  }

  async recargarPendientes() {
    this.set({ pendientes: await local.listarPendientes(this.estado.usuarioId) });
  }

  /**
   * Guarda una operación en la cola y dispara el envío.
   * @param {object} op { id, tipo, url, body, local, descripcion }
   */
  async encolar(op) {
    const completa = {
      ...op,
      usuario_id: this.estado.usuarioId,
      creado_en: new Date().toISOString(),
      estado: "pendiente",
      intentos: 0,
      error: null,
    };
    await local.guardarPendiente(completa);
    await this.recargarPendientes();
    this.sincronizar();
    return completa;
  }

  /** Encola y espera hasta `ms` a que llegue al servidor. → { enviado, error } */
  async encolarYEsperar(op, ms = 8000) {
    const c = await this.encolar({ ...op, interactivo: true });
    return new Promise((resolve) => {
      const fin = setTimeout(() => {
        quitar();
        resolve({ enviado: false });
      }, ms);
      const quitar = this.alEvento((e) => {
        if (e.op.id !== c.id) return;
        clearTimeout(fin);
        quitar();
        resolve(e.tipo === "aplicado" ? { enviado: true } : { enviado: false, error: e.error });
      });
    });
  }

  async reintentar(id) {
    const op = this.estado.pendientes.find((p) => p.id === id);
    if (!op) return;
    await local.guardarPendiente({ ...op, estado: "pendiente", error: null });
    await this.recargarPendientes();
    this.sincronizar();
  }

  async descartar(id) {
    await local.borrarPendiente(id);
    await this.recargarPendientes();
  }

  sincronizar() {
    if (!this.estado.usuarioId) return Promise.resolve();
    if (this.corriendo) {
      this.repetir = true;
      return this.corriendo;
    }
    this.corriendo = this.ciclo().finally(() => {
      this.corriendo = null;
      if (this.repetir) {
        this.repetir = false;
        this.sincronizar();
      }
    });
    return this.corriendo;
  }

  async ciclo() {
    this.set({ sincronizando: true });
    try {
      // 1) Enviar la cola en orden (un cliente nuevo antes que su préstamo)
      let aplicadas = 0;
      for (const op of await local.listarPendientes(this.estado.usuarioId)) {
        if (op.estado === "error") continue;
        try {
          await api(op.url, { method: "POST", body: cuerpo(op), redirigir: false, signal: AbortSignal.timeout(op.archivo ? TIMEOUT_ARCHIVO_MS : TIMEOUT_MS) });
          await local.borrarPendiente(op.id);
          aplicadas++;
          this.set({ enLinea: true, sesionVencida: false });
          this.emitir({ tipo: "aplicado", op });
        } catch (err) {
          if (esErrorDeRed(err)) {
            const sesion = err instanceof ErrorApi && err.status === 401;
            this.set({ enLinea: sesion ? true : false, sesionVencida: sesion });
            await local.guardarPendiente({ ...op, intentos: op.intentos + 1 });
            break; // sin red: se reintenta todo en el próximo ciclo
          }
          // El servidor lo rechazó (p. ej. el pago supera el saldo): queda para revisión
          const conError = { ...op, estado: "error", error: err.message, intentos: op.intentos + 1 };
          await local.guardarPendiente(conError);
          this.emitir({ tipo: "rechazado", op: conError, error: err.message });
        }
      }
      await this.recargarPendientes();

      // 2) Descargar datos frescos
      if (this.estado.enLinea !== false || aplicadas > 0) {
        const datos = await api("/api/sync/datos", { redirigir: false, signal: AbortSignal.timeout(TIMEOUT_MS) });
        await local.guardarDatos(datos);
        this.set({ datos, ultimaSync: datos.generado_en, enLinea: true, sesionVencida: false });
      }
      if (aplicadas > 0) this.emitir({ tipo: "sincronizado", op: {}, aplicadas });
    } catch (err) {
      if (esErrorDeRed(err)) {
        const sesion = err instanceof ErrorApi && err.status === 401;
        this.set({ enLinea: sesion, sesionVencida: sesion });
      }
    } finally {
      this.set({ sincronizando: false });
    }
  }

  /** Al cerrar sesión: borra los datos descargados (la cola se conserva para enviarla después). */
  async cerrarSesion() {
    if (this.estado.usuarioId) await local.borrarDatos(this.estado.usuarioId);
    this.set({ usuarioId: null, datos: null, pendientes: [], listo: false });
  }
}

export const sincronizador = typeof window === "undefined" ? null : (window.__cobrandooSync ??= new Sincronizador());
