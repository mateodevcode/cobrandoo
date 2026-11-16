"use client";

// Activar avisos push en este teléfono/navegador (requiere el service worker).
import { api } from "./api";

const CLAVE_PUBLICA = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;

export function pushDisponible() {
  return typeof window !== "undefined" && "serviceWorker" in navigator && "PushManager" in window && "Notification" in window && !!CLAVE_PUBLICA;
}

/** "activo" | "bloqueado" | "inactivo" | "no_disponible" */
export async function estadoPush() {
  if (!pushDisponible()) return "no_disponible";
  if (Notification.permission === "denied") return "bloqueado";
  const reg = await navigator.serviceWorker.getRegistration();
  const sub = await reg?.pushManager.getSubscription();
  return sub && Notification.permission === "granted" ? "activo" : "inactivo";
}

function aUint8(base64url) {
  const relleno = "=".repeat((4 - (base64url.length % 4)) % 4);
  const b64 = (base64url + relleno).replace(/-/g, "+").replace(/_/g, "/");
  return Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
}

export async function activarPush() {
  if (!pushDisponible()) throw new Error("Este navegador no permite notificaciones. En iPhone, primero agrega la app a la pantalla de inicio.");
  const permiso = await Notification.requestPermission();
  if (permiso !== "granted") throw new Error("No diste permiso para las notificaciones.");
  const reg = (await navigator.serviceWorker.getRegistration()) ?? (await navigator.serviceWorker.register("/sw.js", { scope: "/" }));
  await navigator.serviceWorker.ready;
  const sub =
    (await reg.pushManager.getSubscription()) ??
    (await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: aUint8(CLAVE_PUBLICA) }));
  await api("/api/push", { method: "POST", body: sub.toJSON() });
}

export async function desactivarPush() {
  const reg = await navigator.serviceWorker.getRegistration();
  const sub = await reg?.pushManager.getSubscription();
  if (!sub) return;
  await api("/api/push", { method: "DELETE", body: { endpoint: sub.endpoint } }).catch(() => {});
  await sub.unsubscribe();
}
