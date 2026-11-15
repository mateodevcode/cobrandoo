import "server-only";
import { query, uno } from "../db";

export async function listar() {
  const { rows } = await query(
    `SELECT o.id, o.nombre, o.activa, o.creado_en,
            count(u.id) FILTER (WHERE u.rol = 'dueno')::int      AS duenos,
            count(u.id) FILTER (WHERE u.rol = 'supervisor')::int AS supervisores,
            count(u.id) FILTER (WHERE u.rol = 'cobrador')::int   AS cobradores
       FROM organizaciones o
       LEFT JOIN usuarios u ON u.organizacion_id = o.id AND u.estado = 'activo'
      GROUP BY o.id
      ORDER BY o.nombre`
  );
  return rows;
}

export function buscarPorId(id) {
  return uno(`SELECT id, nombre, activa, creado_en FROM organizaciones WHERE id = $1`, [id]);
}

export async function crear(db, nombre) {
  const { rows } = await db.query(
    `INSERT INTO organizaciones (nombre) VALUES ($1) RETURNING id, nombre, activa, creado_en`,
    [nombre]
  );
  return rows[0];
}

export async function actualizar(db, id, { nombre, activa }) {
  const { rows } = await db.query(
    `UPDATE organizaciones
        SET nombre = COALESCE($2, nombre), activa = COALESCE($3, activa)
      WHERE id = $1
      RETURNING id, nombre, activa, creado_en`,
    [id, nombre ?? null, activa ?? null]
  );
  return rows[0] ?? null;
}
