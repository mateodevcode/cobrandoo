"use client";

// fetch para el cliente: JSON, renovación silenciosa del token y errores legibles.

export class ErrorApi extends Error {
  constructor(status, error) {
    super(error?.mensaje || "Error de conexión");
    this.status = status;
    this.codigo = error?.codigo;
    this.campos = error?.campos;
  }
}

let refrescando = null;

/** Renueva la sesión una sola vez aunque varias peticiones fallen a la vez. */
export function refrescarSesion() {
  refrescando ??= fetch("/api/auth/refresh", { method: "POST", credentials: "same-origin" })
    .then((r) => r.ok || r.status === 409) // 409 = otra pestaña ya la renovó
    .catch(() => false)
    .finally(() => setTimeout(() => (refrescando = null), 0));
  return refrescando;
}

export async function api(url, { method = "GET", body, reintento = true } = {}) {
  const res = await fetch(url, {
    method,
    credentials: "same-origin",
    headers: body ? { "Content-Type": "application/json" } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });

  if (res.status === 401 && reintento && !url.startsWith("/api/auth/")) {
    if (await refrescarSesion()) return api(url, { method, body, reintento: false });
    // Recarga completa a propósito: limpia el estado en memoria de una sesión muerta.
    // eslint-disable-next-line @next/next/no-location-assign-relative-destination
    window.location.href =`/login?next=${encodeURIComponent(location.pathname)}`;
    throw new ErrorApi(401, { mensaje: "Sesión expirada" });
  }

  const json = await res.json().catch(() => null);
  if (!res.ok || !json?.ok) throw new ErrorApi(res.status, json?.error);
  return json.data;
}
