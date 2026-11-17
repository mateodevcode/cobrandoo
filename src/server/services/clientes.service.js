import "server-only";
import { randomBytes } from "node:crypto";
import { query, transaccion } from "../db";
import { ErrorApp } from "../http";
import { filtroVisible, exigirVisible, resolverCobrador } from "../permisos";
import * as auditoria from "../repos/auditoria.repo";

const nuevoToken = () => randomBytes(24).toString("base64url");

const COLS = `c.id, c.organizacion_id, c.cobrador_id, c.ruta_id, c.orden_ruta, c.nombre, c.cedula, c.telefono,
  c.direccion, c.barrio, c.ciudad, c.referencia, c.notas, c.estado, c.creado_en, c.actualizado_en,
  c.latitud::float8 AS latitud, c.longitud::float8 AS longitud, c.ubicacion_precision`;

/** Lista de clientes visibles con resumen de su deuda. */
export async function listar(yo, { q, estado = "activo", rutaId, cobradorId, conDeuda } = {}) {
  const params = [];
  const where = [await filtroVisible(yo, "c.cobrador_id", "c.organizacion_id", params)];
  if (estado) {
    params.push(estado);
    where.push(`c.estado = $${params.length}`);
  }
  if (cobradorId) {
    params.push(cobradorId);
    where.push(`c.cobrador_id = $${params.length}`);
  }
  if (rutaId === "sin") where.push(`c.ruta_id IS NULL`);
  else if (rutaId) {
    params.push(rutaId);
    where.push(`c.ruta_id = $${params.length}`);
  }
  if (q) {
    params.push(`%${q.trim()}%`);
    where.push(`(c.nombre ILIKE $${params.length} OR c.cedula ILIKE $${params.length} OR c.telefono ILIKE $${params.length} OR c.barrio ILIKE $${params.length})`);
  }
  if (conDeuda) where.push(`d.saldo > 0`);

  const { rows } = await query(
    `SELECT ${COLS}, r.nombre AS ruta_nombre, u.nombre AS cobrador_nombre,
            COALESCE(d.saldo, 0)::bigint AS saldo, COALESCE(d.prestamos_activos, 0)::int AS prestamos_activos,
            COALESCE(d.dias_atraso, 0)::int AS dias_atraso
       FROM clientes c
       JOIN usuarios u ON u.id = c.cobrador_id
       LEFT JOIN rutas r ON r.id = c.ruta_id
       LEFT JOIN LATERAL (
         SELECT sum(p.saldo) AS saldo, count(*) AS prestamos_activos, max(p.dias_atraso) AS dias_atraso
           FROM prestamos p WHERE p.cliente_id = c.id AND p.estado = 'activo'
       ) d ON true
      WHERE ${where.join(" AND ")}
      ORDER BY c.nombre
      LIMIT 500`,
    params
  );
  return rows;
}

export async function obtener(yo, id) {
  const { rows } = await query(
    `SELECT ${COLS}, c.token_publico, r.nombre AS ruta_nombre, u.nombre AS cobrador_nombre
       FROM clientes c
       JOIN usuarios u ON u.id = c.cobrador_id
       LEFT JOIN rutas r ON r.id = c.ruta_id
      WHERE c.id = $1`,
    [id]
  );
  const c = rows[0];
  if (!c) throw new ErrorApp(404, "Cliente no encontrado", "no_encontrado");
  await exigirVisible(yo, c.cobrador_id, c.organizacion_id);
  return c;
}

async function validarRuta(db, rutaId, cobradorId) {
  if (!rutaId) return;
  const { rows } = await db.query(`SELECT cobrador_id, activa FROM rutas WHERE id = $1`, [rutaId]);
  if (!rows[0] || rows[0].cobrador_id !== cobradorId || !rows[0].activa) {
    throw new ErrorApp(400, "La ruta no pertenece a ese cobrador", "ruta_invalida");
  }
}

export async function crear(yo, d, ip) {
  return transaccion(async (db) => {
    if (d.id) {
      const { rows } = await db.query(`SELECT id FROM clientes WHERE id = $1`, [d.id]);
      if (rows[0]) return obtener(yo, d.id); // reintento (modo offline): no duplicar
    }
    const cobradorId = await resolverCobrador(db, yo, d.cobrador_id);
    await validarRuta(db, d.ruta_id, cobradorId);
    try {
      const { rows } = await db.query(
        `INSERT INTO clientes (id, organizacion_id, cobrador_id, ruta_id, orden_ruta, nombre, cedula, telefono, direccion,
                               barrio, ciudad, referencia, notas, token_publico, creado_por, latitud, longitud, ubicacion_precision)
         VALUES (COALESCE($1, gen_random_uuid()), $2, $3, $4,
                 COALESCE((SELECT max(orden_ruta) + 1 FROM clientes WHERE cobrador_id = $3 AND ruta_id IS NOT DISTINCT FROM $4), 0),
                 $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17)
         RETURNING id`,
        [d.id ?? null, yo.org, cobradorId, d.ruta_id, d.nombre, d.cedula, d.telefono, d.direccion, d.barrio, d.ciudad,
         d.referencia, d.notas, nuevoToken(), yo.id, d.latitud ?? null, d.longitud ?? null, d.ubicacion_precision ?? null]
      );
      await auditoria.registrar(db, { organizacionId: yo.org, usuarioId: yo.id, accion: "cliente.crear", entidad: "cliente", entidadId: rows[0].id, ip });
      return { id: rows[0].id };
    } catch (err) {
      if (err.code === "23505" && err.constraint === "clientes_cedula_unica") {
        throw new ErrorApp(409, "Ya existe un cliente con esa cédula", "cedula_duplicada");
      }
      throw err;
    }
  });
}

export async function actualizar(yo, id, cambios, ip) {
  const actual = await obtener(yo, id);
  return transaccion(async (db) => {
    let cobradorId = actual.cobrador_id;
    if (cambios.cobrador_id && cambios.cobrador_id !== actual.cobrador_id) {
      if (yo.rol === "cobrador") throw new ErrorApp(403, "Solo un jefe puede reasignar clientes", "prohibido");
      cobradorId = await resolverCobrador(db, yo, cambios.cobrador_id);
      // Al cambiar de cobrador sale de la ruta anterior, y sus préstamos activos pasan al nuevo cobrador
      if (cambios.ruta_id === undefined) cambios.ruta_id = null;
      await db.query(`UPDATE prestamos SET cobrador_id = $2 WHERE cliente_id = $1 AND estado = 'activo'`, [id, cobradorId]);
    }
    if (cambios.ruta_id !== undefined) await validarRuta(db, cambios.ruta_id, cobradorId);

    const permitidos = ["ruta_id", "nombre", "cedula", "telefono", "direccion", "barrio", "ciudad", "referencia", "notas", "estado", "latitud", "longitud", "ubicacion_precision"];
    const sets = [];
    const params = [id];
    if (cobradorId !== actual.cobrador_id) {
      params.push(cobradorId);
      sets.push(`cobrador_id = $${params.length}`);
    }
    for (const k of permitidos) {
      if (cambios[k] !== undefined) {
        params.push(cambios[k]);
        sets.push(`${k} = $${params.length}`);
      }
    }
    if (sets.length) {
      try {
        await db.query(`UPDATE clientes SET ${sets.join(", ")} WHERE id = $1`, params);
      } catch (err) {
        if (err.code === "23505") throw new ErrorApp(409, "Ya existe un cliente con esa cédula", "cedula_duplicada");
        throw err;
      }
      await auditoria.registrar(db, { organizacionId: yo.org, usuarioId: yo.id, accion: "cliente.actualizar", entidad: "cliente", entidadId: id, datos: cambios, ip });
    }
    return { id };
  });
}

/** Cobradores que `yo` puede elegir al crear un cliente o préstamo. */
export async function cobradoresDisponibles(yo) {
  if (yo.rol === "cobrador") return [{ id: yo.id, nombre: yo.nombre }];
  const params = [];
  const filtro = await filtroVisible(yo, "u.id", "u.organizacion_id", params);
  const { rows } = await query(
    `SELECT u.id, u.nombre FROM usuarios u
      WHERE ${filtro} AND u.rol = 'cobrador' AND u.estado = 'activo'
      ORDER BY u.nombre`,
    params
  );
  return rows;
}

// ===== Rutas =====

export async function listarRutas(yo, cobradorId) {
  const id = yo.rol === "cobrador" ? yo.id : cobradorId;
  if (!id) return [];
  if (id !== yo.id) await exigirVisible(yo, id);
  const { rows } = await query(
    `SELECT r.id, r.nombre, r.orden, r.cobrador_id,
            (SELECT count(*)::int FROM clientes c WHERE c.ruta_id = r.id AND c.estado = 'activo') AS clientes
       FROM rutas r WHERE r.cobrador_id = $1 AND r.activa
      ORDER BY r.orden, r.nombre`,
    [id]
  );
  return rows;
}

export async function crearRuta(yo, d, ip) {
  return transaccion(async (db) => {
    const cobradorId = await resolverCobrador(db, yo, d.cobrador_id);
    try {
      const { rows } = await db.query(
        `INSERT INTO rutas (organizacion_id, cobrador_id, nombre, orden)
         VALUES ($1, $2, $3, COALESCE((SELECT max(orden) + 1 FROM rutas WHERE cobrador_id = $2), 0))
         RETURNING id, nombre, orden, cobrador_id`,
        [yo.org, cobradorId, d.nombre]
      );
      await auditoria.registrar(db, { organizacionId: yo.org, usuarioId: yo.id, accion: "ruta.crear", entidad: "ruta", entidadId: rows[0].id, ip });
      return rows[0];
    } catch (err) {
      if (err.code === "23505") throw new ErrorApp(409, "Ya existe una ruta con ese nombre", "duplicado");
      throw err;
    }
  });
}

async function rutaVisible(yo, id) {
  const { rows } = await query(`SELECT id, cobrador_id, organizacion_id FROM rutas WHERE id = $1`, [id]);
  if (!rows[0]) throw new ErrorApp(404, "Ruta no encontrada", "no_encontrado");
  await exigirVisible(yo, rows[0].cobrador_id, rows[0].organizacion_id);
  return rows[0];
}

export async function actualizarRuta(yo, id, cambios, ip) {
  await rutaVisible(yo, id);
  return transaccion(async (db) => {
    if (cambios.activa === false) await db.query(`UPDATE clientes SET ruta_id = NULL WHERE ruta_id = $1`, [id]);
    await db.query(
      `UPDATE rutas SET nombre = COALESCE($2, nombre), activa = COALESCE($3, activa) WHERE id = $1`,
      [id, cambios.nombre ?? null, cambios.activa ?? null]
    );
    await auditoria.registrar(db, { organizacionId: yo.org, usuarioId: yo.id, accion: "ruta.actualizar", entidad: "ruta", entidadId: id, datos: cambios, ip });
    return { id };
  });
}

/** Guarda el orden de visita: los clientes quedan en `rutaId` en el orden dado. */
export async function ordenarRuta(yo, { ruta_id, clientes }) {
  let cobradorId = yo.id;
  if (ruta_id) cobradorId = (await rutaVisible(yo, ruta_id)).cobrador_id;
  return transaccion(async (db) => {
    const { rows } = await db.query(`SELECT id, cobrador_id FROM clientes WHERE id = ANY($1::uuid[])`, [clientes]);
    if (rows.length !== clientes.length) throw new ErrorApp(400, "Algún cliente no existe", "cliente_invalido");
    for (const c of rows) {
      if (ruta_id && c.cobrador_id !== cobradorId) throw new ErrorApp(400, "Todos los clientes deben ser del cobrador de la ruta", "cliente_invalido");
      await exigirVisible(yo, c.cobrador_id);
    }
    await db.query(
      `UPDATE clientes c SET ruta_id = $1, orden_ruta = o.pos
         FROM unnest($2::uuid[]) WITH ORDINALITY AS o(id, pos)
        WHERE c.id = o.id`,
      [ruta_id, clientes]
    );
    return { ok: true };
  });
}
