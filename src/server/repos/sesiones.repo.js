import "server-only";
import { query } from "../db";

export async function crear(db, { usuarioId, familiaId, refreshHash, userAgent, ip, ttlSeg }) {
  await db.query(
    `INSERT INTO sesiones (usuario_id, familia_id, refresh_hash, user_agent, ip, expira_en)
     VALUES ($1, $2, $3, $4, $5, now() + make_interval(secs => $6))`,
    [usuarioId, familiaId, refreshHash, userAgent, ip, ttlSeg]
  );
}

/** Bloquea la fila para rotarla de forma atómica. */
export async function buscarParaRotar(db, refreshHash) {
  const { rows } = await db.query(
    `SELECT s.id, s.usuario_id, s.familia_id, s.expira_en, s.usada_en, s.revocada_en,
            u.organizacion_id, u.rol, u.nombre, u.estado, o.activa AS org_activa
       FROM sesiones s
       JOIN usuarios u ON u.id = s.usuario_id
       LEFT JOIN organizaciones o ON o.id = u.organizacion_id
      WHERE s.refresh_hash = $1
      FOR UPDATE OF s`,
    [refreshHash]
  );
  return rows[0] ?? null;
}

export function marcarUsada(db, id) {
  return db.query(`UPDATE sesiones SET usada_en = now() WHERE id = $1`, [id]);
}

export function revocarFamilia(db, familiaId) {
  return db.query(
    `UPDATE sesiones SET revocada_en = now() WHERE familia_id = $1 AND revocada_en IS NULL`,
    [familiaId]
  );
}

export function revocarPorHash(refreshHash) {
  return query(
    `UPDATE sesiones SET revocada_en = now()
      WHERE familia_id = (SELECT familia_id FROM sesiones WHERE refresh_hash = $1)
        AND revocada_en IS NULL`,
    [refreshHash]
  );
}

/** Cierra todas las sesiones de un usuario (al suspenderlo o cambiarle la clave). */
export function revocarDeUsuario(db, usuarioId) {
  return db.query(
    `UPDATE sesiones SET revocada_en = now() WHERE usuario_id = $1 AND revocada_en IS NULL`,
    [usuarioId]
  );
}
