import "server-only";
import { query } from "../db";
import { emitir } from "../socket";
import { enviarPush } from "../push";
import { destinatariosArriba } from "../jerarquia";

/**
 * Notifica a usuarios por los tres canales: bandeja (siempre), tiempo real (si están en la app)
 * y push (si activaron avisos en su teléfono). Se llama DESPUÉS de guardar en la base,
 * para nunca avisar algo que no quedó registrado. Nunca lanza.
 */
export async function notificar({ organizacionId, usuarioIds, tipo, titulo, cuerpo, url, datos }) {
  const ids = [...new Set(usuarioIds)].filter(Boolean);
  if (!ids.length) return;
  try {
    const { rows } = await query(
      `INSERT INTO notificaciones (organizacion_id, usuario_id, tipo, titulo, cuerpo, url, datos)
       SELECT $1, u, $3, $4, $5, $6, $7 FROM unnest($2::uuid[]) AS u
       RETURNING id, usuario_id, tipo, titulo, cuerpo, url, creado_en`,
      [organizacionId, ids, tipo, titulo, cuerpo ?? null, url ?? null, datos ? JSON.stringify(datos) : null]
    );
    await Promise.all([
      emitir(organizacionId, ids, { tipo: "notificacion", notificacion: { tipo, titulo, cuerpo, url, creado_en: rows[0]?.creado_en } }),
      enviarPush(ids, { titulo, cuerpo, url, etiqueta: tipo }),
    ]);
  } catch (err) {
    console.error("[notificar]", err.message);
  }
}

/** Aviso liviano de "hubo movimiento" para que los jefes vean los números al instante (sin bandeja ni push). */
export async function avisarActividad(organizacionId, actorId, detalle) {
  try {
    const arriba = await destinatariosArriba(actorId);
    await emitir(organizacionId, [actorId, ...arriba], { tipo: "actividad", ...detalle });
  } catch (err) {
    console.warn("[actividad]", err.message);
  }
}

export async function listar(yo, limite = 30) {
  const [{ rows }, { rows: n }] = await Promise.all([
    query(
      `SELECT id, tipo, titulo, cuerpo, url, leida_en, creado_en FROM notificaciones
        WHERE usuario_id = $1 ORDER BY creado_en DESC LIMIT $2`,
      [yo.id, limite]
    ),
    query(`SELECT count(*)::int AS n FROM notificaciones WHERE usuario_id = $1 AND leida_en IS NULL`, [yo.id]),
  ]);
  return { notificaciones: rows, sinLeer: n[0].n };
}

export async function marcarLeidas(yo, ids) {
  if (ids?.length) {
    await query(`UPDATE notificaciones SET leida_en = now() WHERE usuario_id = $1 AND id = ANY($2::uuid[]) AND leida_en IS NULL`, [yo.id, ids]);
  } else {
    await query(`UPDATE notificaciones SET leida_en = now() WHERE usuario_id = $1 AND leida_en IS NULL`, [yo.id]);
  }
}
