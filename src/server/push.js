import "server-only";
import * as webpush from "web-push";
import { query } from "./db";

// Web Push: avisos al celular aunque la app esté cerrada.
// Llaves VAPID: NEXT_PUBLIC_VAPID_PUBLIC_KEY (la ve el navegador), VAPID_PRIVATE_KEY, VAPID_SUBJECT.
const PUBLICA = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
const PRIVADA = process.env.VAPID_PRIVATE_KEY;
let configurado = false;

export const pushActivo = () => Boolean(PUBLICA && PRIVADA);

function configurar() {
  if (configurado || !pushActivo()) return;
  webpush.setVapidDetails(process.env.VAPID_SUBJECT || "mailto:soporte@cobrandoo.app", PUBLICA, PRIVADA);
  configurado = true;
}

export async function guardarSuscripcion(usuarioId, sub, userAgent) {
  await query(
    `INSERT INTO suscripciones_push (usuario_id, endpoint, p256dh, auth, user_agent)
     VALUES ($1, $2, $3, $4, $5)
     ON CONFLICT (endpoint) DO UPDATE SET usuario_id = EXCLUDED.usuario_id, p256dh = EXCLUDED.p256dh,
                                          auth = EXCLUDED.auth, user_agent = EXCLUDED.user_agent`,
    [usuarioId, sub.endpoint, sub.keys.p256dh, sub.keys.auth, userAgent]
  );
}

export async function borrarSuscripcion(usuarioId, endpoint) {
  await query(`DELETE FROM suscripciones_push WHERE usuario_id = $1 AND endpoint = $2`, [usuarioId, endpoint]);
}

/** Envía a todos los teléfonos de esos usuarios. Nunca lanza. */
export async function enviarPush(usuarioIds, { titulo, cuerpo, url, etiqueta }) {
  if (!pushActivo() || !usuarioIds?.length) return 0;
  configurar();
  const { rows } = await query(`SELECT id, endpoint, p256dh, auth FROM suscripciones_push WHERE usuario_id = ANY($1::uuid[])`, [usuarioIds]);
  const carga = JSON.stringify({ titulo, cuerpo, url, etiqueta });
  let enviados = 0;
  await Promise.all(
    rows.map(async (s) => {
      try {
        await webpush.sendNotification({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, carga, { TTL: 60 * 60 * 24 });
        enviados++;
        query(`UPDATE suscripciones_push SET ultimo_uso = now() WHERE id = $1`, [s.id]).catch(() => {});
      } catch (err) {
        // 404/410: el teléfono canceló la suscripción
        if (err.statusCode === 404 || err.statusCode === 410) await query(`DELETE FROM suscripciones_push WHERE id = $1`, [s.id]).catch(() => {});
        else console.warn("[push]", err.statusCode ?? err.message);
      }
    })
  );
  return enviados;
}
