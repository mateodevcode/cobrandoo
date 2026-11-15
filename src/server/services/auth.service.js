import "server-only";
import { randomBytes, createHash, randomUUID } from "node:crypto";
import bcrypt from "bcryptjs";
import { transaccion } from "../db";
import { ErrorApp } from "../http";
import { firmarAcceso, REFRESH_TTL_SEG } from "../auth/tokens";
import * as usuariosRepo from "../repos/usuarios.repo";
import * as sesionesRepo from "../repos/sesiones.repo";
import * as auditoria from "../repos/auditoria.repo";

const MAX_INTENTOS = 5;
const BLOQUEO_MIN = 15;
// Si dos pestañas refrescan a la vez, la segunda llega con el token ya rotado.
// Dentro de esta ventana no se considera robo: solo se rechaza y el cliente reintenta.
const GRACIA_ROTACION_MS = 30_000;

// Hash bcrypt de relleno para que un usuario inexistente tarde lo mismo que uno real.
let hashRelleno;
const obtenerHashRelleno = () => (hashRelleno ??= bcrypt.hash(randomBytes(16).toString("hex"), 12));

const sha256 = (s) => createHash("sha256").update(s).digest("hex");
const nuevoRefresh = () => randomBytes(32).toString("base64url");

function validarCuentaActiva(u) {
  if (u.estado !== "activo") throw new ErrorApp(403, "Tu cuenta está desactivada. Habla con tu jefe.", "cuenta_inactiva");
  if (u.rol !== "super_admin" && u.org_activa === false)
    throw new ErrorApp(403, "La organización está desactivada.", "org_inactiva");
}

async function emitirSesion(db, u, { familiaId = randomUUID(), userAgent, ip }) {
  const refresh = nuevoRefresh();
  await sesionesRepo.crear(db, {
    usuarioId: u.id,
    familiaId,
    refreshHash: sha256(refresh),
    userAgent,
    ip,
    ttlSeg: REFRESH_TTL_SEG,
  });
  const access = await firmarAcceso(u);
  return { access, refresh };
}

export async function login({ email, password, userAgent, ip }) {
  const u = await usuariosRepo.buscarParaLogin(email);
  const credencialesMal = new ErrorApp(401, "Correo o contraseña incorrectos", "credenciales");

  if (!u) {
    await bcrypt.compare(password, await obtenerHashRelleno());
    throw credencialesMal;
  }
  if (u.bloqueado_hasta && new Date(u.bloqueado_hasta) > new Date()) {
    throw new ErrorApp(429, `Demasiados intentos. Intenta de nuevo en ${BLOQUEO_MIN} minutos.`, "bloqueado");
  }
  if (!(await bcrypt.compare(password, u.password_hash))) {
    await usuariosRepo.registrarFallo(u.id, MAX_INTENTOS, BLOQUEO_MIN);
    throw credencialesMal;
  }
  validarCuentaActiva(u);

  return transaccion(async (db) => {
    await usuariosRepo.registrarAcceso(u.id);
    const tokens = await emitirSesion(db, u, { userAgent, ip });
    await auditoria.registrar(db, { organizacionId: u.organizacion_id, usuarioId: u.id, accion: "auth.login", ip });
    return { tokens, usuario: { id: u.id, rol: u.rol, nombre: u.nombre, organizacion_id: u.organizacion_id } };
  });
}

export async function refrescar({ refresh, userAgent, ip }) {
  if (!refresh) throw new ErrorApp(401, "Sesión expirada", "no_autenticado");
  const hash = sha256(refresh);

  return transaccion(async (db) => {
    const s = await sesionesRepo.buscarParaRotar(db, hash);
    if (!s || s.revocada_en || new Date(s.expira_en) < new Date()) {
      throw new ErrorApp(401, "Sesión expirada", "no_autenticado");
    }
    if (s.usada_en) {
      if (Date.now() - new Date(s.usada_en).getTime() < GRACIA_ROTACION_MS) {
        throw new ErrorApp(409, "Sesión ya renovada", "rotada");
      }
      // Reuso tardío de un refresh viejo => posible robo: se cierra toda la cadena.
      await sesionesRepo.revocarFamilia(db, s.familia_id);
      await auditoria.registrar(db, { organizacionId: s.organizacion_id, usuarioId: s.usuario_id, accion: "auth.reuso_refresh", ip });
      throw new ErrorApp(401, "Sesión expirada", "no_autenticado");
    }
    validarCuentaActiva(s);

    await sesionesRepo.marcarUsada(db, s.id);
    const u = { id: s.usuario_id, rol: s.rol, nombre: s.nombre, organizacion_id: s.organizacion_id };
    const tokens = await emitirSesion(db, u, { familiaId: s.familia_id, userAgent, ip });
    return { tokens, usuario: u };
  });
}

export async function logout(refresh) {
  if (refresh) await sesionesRepo.revocarPorHash(sha256(refresh));
}

export const hashPassword = (p) => bcrypt.hash(p, 12);
