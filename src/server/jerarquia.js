import "server-only";
import { query } from "./db";

/**
 * IDs de usuarios cuya información puede ver `yo` (incluido él mismo).
 * - super_admin: null  (= sin filtro, ve todo)
 * - dueno:       todos los de su organización (varios dueños ven lo mismo)
 * - supervisor / cobrador: él + todos los que tiene debajo, a cualquier profundidad
 */
export async function idsVisibles(yo) {
  if (yo.rol === "super_admin") return null;
  if (yo.rol === "dueno") {
    const { rows } = await query(`SELECT id FROM usuarios WHERE organizacion_id = $1`, [yo.org]);
    return rows.map((r) => r.id);
  }
  const { rows } = await query(
    `WITH RECURSIVE equipo AS (
       SELECT id FROM usuarios WHERE id = $1
       UNION
       SELECT u.id FROM usuarios u JOIN equipo e ON u.jefe_id = e.id
     )
     SELECT id FROM equipo`,
    [yo.id]
  );
  return rows.map((r) => r.id);
}

/** ¿`yo` puede ver los datos del usuario `objetivoId`? */
export async function puedeVer(yo, objetivoId) {
  const ids = await idsVisibles(yo);
  return ids === null || ids.includes(objetivoId);
}

/**
 * IDs que deben recibir notificaciones de una acción hecha por `actorId`:
 * toda su cadena de jefes + todos los dueños de la organización.
 */
export async function destinatariosArriba(actorId) {
  const { rows } = await query(
    `WITH RECURSIVE cadena AS (
       SELECT id, jefe_id, organizacion_id FROM usuarios WHERE id = $1
       UNION
       SELECT u.id, u.jefe_id, u.organizacion_id FROM usuarios u JOIN cadena c ON u.id = c.jefe_id
     )
     SELECT id FROM cadena WHERE id <> $1
     UNION
     SELECT u.id FROM usuarios u
      WHERE u.rol = 'dueno' AND u.estado = 'activo'
        AND u.organizacion_id = (SELECT organizacion_id FROM usuarios WHERE id = $1)`,
    [actorId]
  );
  return rows.map((r) => r.id);
}
