import "server-only";

// Cliente de servidor para socket-core (hub de tiempo real propio).
// La API key solo vive aquí; el navegador recibe JWT cortos vía /api/socket-token.
// Variables (acepta los nombres del paquete de alta_cliente.py):
//   SOCKET_CORE_URL            https://ws.seventwo.tech
//   SOCKET_CORE_API_KEY | API_KEY
//   SOCKET_CORE_PREFIJO | PREFIX   ("cobrandoo" o "cobrandoo:*")

const URL_HUB = process.env.SOCKET_CORE_URL?.replace(/\/+$/, "");
const API_KEY = process.env.SOCKET_CORE_API_KEY || process.env.API_KEY;
const PREFIJO = (process.env.SOCKET_CORE_PREFIJO || process.env.PREFIX || "cobrandoo").replace(/:\*$/, "");
const TIMEOUT_MS = 5000;

export const socketActivo = () => Boolean(URL_HUB && API_KEY);

/** Canal de la organización: todos sus usuarios se suscriben; los eventos van dirigidos con `targets`. */
export const canalDe = (organizacionId) => `${PREFIJO}:org-${organizacionId}`;

/** Datos públicos para que el navegador se conecte (sin secretos). */
export const configPublica = (organizacionId) =>
  socketActivo() && organizacionId ? { url: URL_HUB, canal: canalDe(organizacionId) } : null;

async function llamar(ruta, { method = "GET", body } = {}) {
  const res = await fetch(`${URL_HUB}${ruta}`, {
    method,
    headers: { "X-Api-Key": API_KEY, "Content-Type": "application/json" },
    body: body ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(TIMEOUT_MS),
    cache: "no-store",
  });
  const json = await res.json().catch(() => null);
  return { status: res.status, json };
}

const canalesListos = new Set();

/** ¿La respuesta dice que el canal ya existe? (socket-core responde 400 "channel name already exists") */
const yaExiste = (r) => r.status === 409 || /already exists|ya existe/i.test(String(r.json?.error ?? ""));

async function asegurarCanal(canal) {
  if (canalesListos.has(canal)) return;
  const r = await llamar("/channels", { method: "POST", body: { name: canal, description: "Cobrandoo" } });
  // Creado ahora o creado antes (por otro servidor de Vercel o un despliegue anterior): ambos sirven
  if (r.status < 300 || yaExiste(r)) canalesListos.add(canal);
  else throw new Error(`socket-core: no se pudo crear el canal (${r.status}: ${r.json?.error ?? "sin detalle"})`);
}

/** JWT corto para que `usuarioId` escuche el canal de su organización. */
export async function tokenPara(usuarioId, organizacionId) {
  const canal = canalDe(organizacionId);
  await asegurarCanal(canal);
  const r = await llamar("/auth/token", { method: "POST", body: { user_id: usuarioId, channel: canal, role: "subscribe" } });
  if (r.status !== 200 || !r.json?.success) throw new Error(`socket-core: token (${r.status})`);
  return { token: r.json.data.token, expires_in: r.json.data.expires_in, role: "subscribe", canal };
}

/**
 * Envía un evento a usuarios concretos. Nunca lanza: si el hub no responde,
 * la app sigue funcionando (la bandeja y el push son el respaldo).
 */
export async function emitir(organizacionId, targets, payload) {
  if (!socketActivo() || !organizacionId || !targets?.length) return false;
  try {
    const canal = canalDe(organizacionId);
    await asegurarCanal(canal);
    const r = await llamar(`/channels/${encodeURIComponent(canal)}/events`, {
      method: "POST",
      body: { source: "cobrandoo", targets: [...new Set(targets)], payload },
    });
    return r.status < 300;
  } catch (err) {
    console.warn("[socket-core]", err.message);
    return false;
  }
}
