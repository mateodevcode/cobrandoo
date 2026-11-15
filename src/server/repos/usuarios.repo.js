import "server-only";
import { query, uno } from "../db";

// Columnas públicas (nunca devolver password_hash)
const COLS = `u.id, u.organizacion_id, u.rol, u.jefe_id, u.email, u.nombre, u.cedula, u.telefono,
  u.estado, u.ultimo_acceso, u.creado_en, u.actualizado_en`;

export function buscarParaLogin(email) {
  return uno(
    `SELECT u.id, u.organizacion_id, u.rol, u.nombre, u.password_hash, u.estado,
            u.intentos_fallidos, u.bloqueado_hasta, o.activa AS org_activa
       FROM usuarios u
       LEFT JOIN organizaciones o ON o.id = u.organizacion_id
      WHERE lower(u.email) = lower($1)`,
    [email]
  );
}

export function buscarPorId(id, db = { query }) {
  return db.query(`SELECT ${COLS} FROM usuarios u WHERE u.id = $1`, [id]).then((r) => r.rows[0] ?? null);
}

export function registrarFallo(id, maxIntentos, bloqueoMin) {
  return query(
    `UPDATE usuarios
        SET intentos_fallidos = intentos_fallidos + 1,
            bloqueado_hasta = CASE WHEN intentos_fallidos + 1 >= $2
                                   THEN now() + make_interval(mins => $3) ELSE bloqueado_hasta END
      WHERE id = $1`,
    [id, maxIntentos, bloqueoMin]
  );
}

export function registrarAcceso(id) {
  return query(
    `UPDATE usuarios SET intentos_fallidos = 0, bloqueado_hasta = NULL, ultimo_acceso = now() WHERE id = $1`,
    [id]
  );
}

/** Lista con nombre de organización y jefe. Filtros opcionales. */
export async function listar({ organizacionId, rol } = {}) {
  const where = [];
  const params = [];
  if (organizacionId) {
    params.push(organizacionId);
    where.push(`u.organizacion_id = $${params.length}`);
  }
  if (rol) {
    params.push(rol);
    where.push(`u.rol = $${params.length}`);
  }
  const { rows } = await query(
    `SELECT ${COLS}, o.nombre AS organizacion_nombre, j.nombre AS jefe_nombre
       FROM usuarios u
       LEFT JOIN organizaciones o ON o.id = u.organizacion_id
       LEFT JOIN usuarios j ON j.id = u.jefe_id
      ${where.length ? "WHERE " + where.join(" AND ") : ""}
      ORDER BY o.nombre NULLS FIRST,
               array_position(ARRAY['super_admin','dueno','supervisor','cobrador'], u.rol),
               u.nombre`,
    params
  );
  return rows;
}

export async function crear(db, d) {
  const { rows } = await db.query(
    `INSERT INTO usuarios (organizacion_id, rol, jefe_id, email, nombre, cedula, telefono,
                           password_hash, creado_por)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
     RETURNING id`,
    [d.organizacion_id, d.rol, d.jefe_id, d.email, d.nombre, d.cedula, d.telefono, d.password_hash, d.creado_por]
  );
  return rows[0].id;
}

/** Actualiza solo los campos presentes en `cambios` (lista blanca). */
export async function actualizar(db, id, cambios) {
  const permitidos = ["jefe_id", "nombre", "cedula", "telefono", "email", "estado", "password_hash"];
  const sets = [];
  const params = [id];
  for (const k of permitidos) {
    if (cambios[k] !== undefined) {
      params.push(cambios[k]);
      sets.push(`${k} = $${params.length}`);
    }
  }
  if (cambios.password_hash) sets.push("intentos_fallidos = 0", "bloqueado_hasta = NULL");
  if (!sets.length) return;
  await db.query(`UPDATE usuarios SET ${sets.join(", ")} WHERE id = $1`, params);
}

/** ¿`posibleJefeId` está por debajo de `usuarioId` en la jerarquía? (evita ciclos) */
export async function esSubordinado(db, usuarioId, posibleJefeId) {
  const { rows } = await db.query(
    `WITH RECURSIVE bajo AS (
       SELECT id FROM usuarios WHERE jefe_id = $1
       UNION
       SELECT u.id FROM usuarios u JOIN bajo b ON u.jefe_id = b.id
     )
     SELECT 1 FROM bajo WHERE id = $2 LIMIT 1`,
    [usuarioId, posibleJefeId]
  );
  return rows.length > 0;
}

export async function contarSubordinadosActivos(db, id) {
  const { rows } = await db.query(
    `SELECT count(*)::int AS n FROM usuarios WHERE jefe_id = $1 AND estado = 'activo'`,
    [id]
  );
  return rows[0].n;
}
