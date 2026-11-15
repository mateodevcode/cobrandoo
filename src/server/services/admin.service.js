import "server-only";
import { transaccion } from "../db";
import { ErrorApp } from "../http";
import { JEFES_PERMITIDOS } from "@/lib/roles";
import { hashPassword } from "./auth.service";
import * as usuariosRepo from "../repos/usuarios.repo";
import * as orgRepo from "../repos/organizaciones.repo";
import * as sesionesRepo from "../repos/sesiones.repo";
import * as auditoria from "../repos/auditoria.repo";

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
      await sesionesRepo.revocarDeUsuario(db, id);
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
