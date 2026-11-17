import "server-only";
import { query, transaccion } from "../db";
import { ErrorApp } from "../http";
import { JEFES_PERMITIDOS } from "@/lib/roles";
import { hashPassword } from "./auth.service";
import * as usuariosRepo from "../repos/usuarios.repo";
import * as orgRepo from "../repos/organizaciones.repo";
import * as sesionesRepo from "../repos/sesiones.repo";
import * as auditoria from "../repos/auditoria.repo";
import { olvidarVigencia } from "../auth/session";

/** Valida que `jefeId` sea un jefe válido para `rol` dentro de la organización. */
async function validarJefe(db, { rol, organizacionId, jefeId, usuarioId }) {
  const permitidos = JEFES_PERMITIDOS[rol] ?? [];
  if (!permitidos.length) {
    if (jefeId) throw new ErrorApp(400, "Un dueño no tiene jefe", "jefe_invalido");
    return;
  }
  if (!jefeId) throw new ErrorApp(400, "Debes elegir a quién reporta", "jefe_requerido");

  const jefe = await usuariosRepo.buscarPorId(jefeId, db);
  if (!jefe || jefe.organizacion_id !== organizacionId) {
    throw new ErrorApp(400, "El jefe debe ser de la misma organización", "jefe_invalido");
  }
  if (!permitidos.includes(jefe.rol)) {
    throw new ErrorApp(400, "Ese usuario no puede ser jefe de este rol", "jefe_invalido");
  }
  if (jefe.estado !== "activo") throw new ErrorApp(400, "El jefe está inactivo", "jefe_invalido");
  if (usuarioId && (jefeId === usuarioId || (await usuariosRepo.esSubordinado(db, usuarioId, jefeId)))) {
    throw new ErrorApp(400, "No puede reportar a alguien que está debajo de él", "jefe_ciclo");
  }
}

export async function crearOrganizacion(admin, nombre, ip) {
  return transaccion(async (db) => {
    const org = await orgRepo.crear(db, nombre);
    await auditoria.registrar(db, { organizacionId: org.id, usuarioId: admin.id, accion: "org.crear", entidad: "organizacion", entidadId: org.id, datos: { nombre }, ip });
    return org;
  });
}

export async function actualizarOrganizacion(admin, id, cambios, ip) {
  return transaccion(async (db) => {
    const org = await orgRepo.actualizar(db, id, cambios);
    if (cambios.activa === false) olvidarVigencia();
    if (!org) throw new ErrorApp(404, "Organización no encontrada", "no_encontrado");
    await auditoria.registrar(db, { organizacionId: id, usuarioId: admin.id, accion: "org.actualizar", entidad: "organizacion", entidadId: id, datos: cambios, ip });
    return org;
  });
}

export async function crearUsuario(admin, datos, ip) {
  return transaccion(async (db) => {
    const org = await orgRepo.buscarPorId(datos.organizacion_id);
    if (!org) throw new ErrorApp(404, "Organización no encontrada", "no_encontrado");
    await validarJefe(db, { rol: datos.rol, organizacionId: org.id, jefeId: datos.jefe_id });

    const { password, ...resto } = datos;
    const id = await usuariosRepo.crear(db, {
      ...resto,
      password_hash: await hashPassword(password),
      creado_por: admin.id,
    });
    await auditoria.registrar(db, { organizacionId: org.id, usuarioId: admin.id, accion: "usuario.crear", entidad: "usuario", entidadId: id, datos: { rol: datos.rol, email: datos.email }, ip });
    return usuariosRepo.buscarPorId(id, db);
  });
}

export async function actualizarUsuario(admin, id, cambios, ip) {
  return transaccion(async (db) => {
    const u = await usuariosRepo.buscarPorId(id, db);
    if (!u) throw new ErrorApp(404, "Usuario no encontrado", "no_encontrado");
    if (u.rol === "super_admin") throw new ErrorApp(403, "El super admin se gestiona por consola", "prohibido");
    const { rows: el } = await db.query(`SELECT eliminado_en FROM usuarios WHERE id = $1`, [id]);
    if (el[0]?.eliminado_en) throw new ErrorApp(404, "Usuario no encontrado", "no_encontrado");

    if (cambios.jefe_id !== undefined) {
      await validarJefe(db, { rol: u.rol, organizacionId: u.organizacion_id, jefeId: cambios.jefe_id, usuarioId: u.id });
    }
    if (cambios.estado && cambios.estado !== "activo" && u.estado === "activo") {
      const n = await usuariosRepo.contarSubordinadosActivos(db, u.id);
      if (n > 0) throw new ErrorApp(409, `Tiene ${n} persona(s) a cargo. Reasígnalas antes de desactivarlo.`, "tiene_subordinados");
    }

    const { password, ...resto } = cambios;
    const datos = { ...resto };
    if (password) datos.password_hash = await hashPassword(password);
    await usuariosRepo.actualizar(db, id, datos);

    // Cambio de clave o desactivación => cerrar sus sesiones abiertas
    if (password || (cambios.estado && cambios.estado !== "activo")) {
      await db.query(`UPDATE usuarios SET sesiones_desde = now() WHERE id = $1`, [id]);
      await sesionesRepo.revocarDeUsuario(db, id);
      olvidarVigencia(id);
    }

    const { password: _omitido, ...registro } = cambios;
    await auditoria.registrar(db, {
      organizacionId: u.organizacion_id,
      usuarioId: admin.id,
      accion: "usuario.actualizar",
      entidad: "usuario",
      entidadId: id,
      datos: { ...registro, ...(password ? { password: "cambiada" } : {}) },
      ip,
    });
    return usuariosRepo.buscarPorId(id, db);
  });
}

/** Personas de la organización a las que el dueño puede cambiarles la contraseña (incluye otros dueños y él mismo). */
export async function personasConAcceso(yo) {
  if (yo.rol !== "dueno") throw new ErrorApp(403, "Solo el dueño gestiona contraseñas", "prohibido");
  const { rows } = await query(
    `SELECT id, nombre, email, rol, estado FROM usuarios
      WHERE organizacion_id = $1 AND eliminado_en IS NULL AND rol <> 'super_admin'
      ORDER BY array_position(ARRAY['dueno','supervisor','cobrador'], rol::text), nombre`,
    [yo.org]
  );
  return rows;
}

/**
 * Por seguridad nadie cambia ni recupera su propia contraseña por su cuenta: solo el super admin
 * (desde Organizaciones) o un dueño de la misma organización. Cierra las sesiones abiertas de esa persona.
 */
export async function cambiarClaveComoDueno(yo, id, password, ip) {
  if (yo.rol !== "dueno") throw new ErrorApp(403, "Solo el dueño cambia contraseñas", "prohibido");
  return transaccion(async (db) => {
    const { rows } = await db.query(`SELECT id, organizacion_id, rol, nombre, eliminado_en FROM usuarios WHERE id = $1`, [id]);
    const u = rows[0];
    if (!u || u.organizacion_id !== yo.org || u.eliminado_en || u.rol === "super_admin") throw new ErrorApp(404, "Persona no encontrada", "no_encontrado");
    await usuariosRepo.actualizar(db, id, { password_hash: await hashPassword(password) });
    await db.query(`UPDATE usuarios SET sesiones_desde = now() WHERE id = $1`, [id]);
    await sesionesRepo.revocarDeUsuario(db, id);
    olvidarVigencia(id);
    await auditoria.registrar(db, { organizacionId: yo.org, usuarioId: yo.id, accion: "usuario.clave", entidad: "usuario", entidadId: id, datos: { password: "cambiada" }, ip });
    return { id, nombre: u.nombre, propia: id === yo.id };
  });
}

/**
 * Elimina a una persona SIN perder su historial: préstamos, pagos, caja y cierres siguen
 * mostrando su nombre. Deja de poder ingresar, se libera su correo y sale de todas las listas.
 * Si es cobrador con clientes, éstos (con sus préstamos activos y rutas) pasan a `reasignarA`.
 */
export async function eliminarUsuario(admin, id, { reasignar_a: reasignarA } = {}, ip) {
  return transaccion(async (db) => {
    const { rows } = await db.query(
      `SELECT id, organizacion_id, rol, nombre, email, eliminado_en FROM usuarios WHERE id = $1 FOR UPDATE`,
      [id]
    );
    const u = rows[0];
    if (!u || u.eliminado_en) throw new ErrorApp(404, "Usuario no encontrado", "no_encontrado");
    if (u.rol === "super_admin") throw new ErrorApp(403, "El super admin no se puede eliminar desde aquí", "prohibido");

    const aCargo = await usuariosRepo.contarSubordinadosActivos(db, id);
    if (aCargo > 0) {
      throw new ErrorApp(409, `Tiene ${aCargo} persona(s) a cargo. Pásalas a otro jefe antes de eliminarlo.`, "tiene_subordinados");
    }

    const { rows: cs } = await db.query(
      `SELECT count(*) FILTER (WHERE estado = 'activo')::int AS activos, count(*)::int AS total FROM clientes WHERE cobrador_id = $1`,
      [id]
    );
    let destino = null;
    if (cs[0].total > 0) {
      if (!reasignarA) {
        throw new ErrorApp(409, `Tiene ${cs[0].total} cliente(s). Elige a qué cobrador pasan antes de eliminarlo.`, "tiene_clientes");
      }
      const { rows: ds } = await db.query(`SELECT id, rol, estado, organizacion_id, nombre, eliminado_en FROM usuarios WHERE id = $1`, [reasignarA]);
      destino = ds[0];
      if (!destino || destino.id === id || destino.organizacion_id !== u.organizacion_id || destino.rol !== "cobrador" || destino.estado !== "activo" || destino.eliminado_en) {
        throw new ErrorApp(400, "Elige un cobrador activo de la misma organización", "reasignacion_invalida");
      }
      // Sus rutas pasan con un sufijo (para no chocar con rutas del mismo nombre del nuevo cobrador)
      await db.query(
        `UPDATE rutas SET cobrador_id = $2, nombre = nombre || ' (de ' || $3 || ')' WHERE cobrador_id = $1 AND activa`,
        [id, destino.id, u.nombre.split(" ")[0]]
      );
      await db.query(`UPDATE clientes SET cobrador_id = $2 WHERE cobrador_id = $1`, [id, destino.id]);
      await db.query(`UPDATE prestamos SET cobrador_id = $2 WHERE cobrador_id = $1 AND estado = 'activo'`, [id, destino.id]);
    }

    // Queda como registro histórico: inactivo, sin acceso y con el correo liberado
    await db.query(
      `UPDATE usuarios
          SET estado = 'inactivo', eliminado_en = now(), eliminado_por = $2,
              email = 'eliminado-' || id || '@borrado.invalid', password_hash = '!eliminado'
        WHERE id = $1`,
      [id, admin.id]
    );
    await db.query(`DELETE FROM sesiones WHERE usuario_id = $1`, [id]);
    await db.query(`DELETE FROM suscripciones_push WHERE usuario_id = $1`, [id]);
    await db.query(`DELETE FROM notificaciones WHERE usuario_id = $1`, [id]);

    await auditoria.registrar(db, {
      organizacionId: u.organizacion_id, usuarioId: admin.id, accion: "usuario.eliminar", entidad: "usuario", entidadId: id,
      datos: { nombre: u.nombre, email: u.email, rol: u.rol, clientes_pasados_a: destino?.nombre ?? null, clientes: cs[0].total },
      ip,
    });
    olvidarVigencia(id);
    return { id, clientesReasignados: destino ? cs[0].total : 0, reasignadoA: destino?.nombre ?? null };
  });
}

/**
 * Elimina una organización y TODO lo que tiene dentro (personas, clientes, préstamos, pagos,
 * caja, cierres, avisos). No se puede deshacer: exige escribir el nombre exacto como confirmación.
 */
export async function eliminarOrganizacion(admin, id, { confirmacion }, ip) {
  return transaccion(async (db) => {
    const { rows } = await db.query(`SELECT id, nombre FROM organizaciones WHERE id = $1 FOR UPDATE`, [id]);
    const org = rows[0];
    if (!org) throw new ErrorApp(404, "Organización no encontrada", "no_encontrado");
    if ((confirmacion ?? "").trim().toLowerCase() !== org.nombre.trim().toLowerCase()) {
      throw new ErrorApp(400, "Escribe el nombre exacto de la organización para confirmar", "confirmacion_invalida");
    }

    const cuenta = async (tabla) => (await db.query(`SELECT count(*)::int AS n FROM ${tabla} WHERE organizacion_id = $1`, [id])).rows[0].n;
    const resumen = {
      usuarios: await cuenta("usuarios"),
      clientes: await cuenta("clientes"),
      prestamos: await cuenta("prestamos"),
      pagos: await cuenta("pagos"),
    };

    const usuarios = `(SELECT id FROM usuarios WHERE organizacion_id = $1)`;
    // Orden: de lo que depende de otros hacia lo que es base
    await db.query(`DELETE FROM notificaciones WHERE organizacion_id = $1 OR usuario_id IN ${usuarios}`, [id]);
    await db.query(`DELETE FROM suscripciones_push WHERE usuario_id IN ${usuarios}`, [id]);
    await db.query(`DELETE FROM cierres WHERE organizacion_id = $1`, [id]);
    await db.query(`DELETE FROM movimientos_caja WHERE organizacion_id = $1`, [id]);
    await db.query(`DELETE FROM pagos WHERE organizacion_id = $1`, [id]);
    await db.query(`DELETE FROM prestamos WHERE organizacion_id = $1`, [id]); // borra cuotas y cargos en cascada
    await db.query(`DELETE FROM clientes WHERE organizacion_id = $1`, [id]);
    await db.query(`DELETE FROM rutas WHERE organizacion_id = $1`, [id]);
    await db.query(`DELETE FROM jornadas WHERE organizacion_id = $1`, [id]);
    await db.query(`DELETE FROM auditoria WHERE organizacion_id = $1 OR usuario_id IN ${usuarios}`, [id]);
    await db.query(`DELETE FROM sesiones WHERE usuario_id IN ${usuarios}`, [id]);
    await db.query(`UPDATE usuarios SET jefe_id = NULL, eliminado_por = NULL WHERE organizacion_id = $1`, [id]);
    await db.query(`DELETE FROM usuarios WHERE organizacion_id = $1`, [id]);
    await db.query(`DELETE FROM organizaciones WHERE id = $1`, [id]);

    // Queda constancia (sin organización, porque ya no existe)
    await auditoria.registrar(db, {
      usuarioId: admin.id, accion: "org.eliminar", entidad: "organizacion", entidadId: id,
      datos: { nombre: org.nombre, ...resumen }, ip,
    });
    olvidarVigencia();
    return { id, nombre: org.nombre, ...resumen };
  });
}
