import "server-only";
import { ErrorApp } from "./http";
import { idsVisibles } from "./jerarquia";

export const ROLES_NEGOCIO = ["dueno", "supervisor", "cobrador"];

/**
 * Fragmento SQL que limita filas a lo que `yo` puede ver.
 * @param {object} yo        usuario de la sesión
 * @param {string} columna   columna con el id del cobrador dueño de la fila (p. ej. "c.cobrador_id")
 * @param {string} colOrg    columna de organización (p. ej. "c.organizacion_id")
 * @param {Array}  params    arreglo de parámetros al que se agregan los valores
 */
export async function filtroVisible(yo, columna, colOrg, params) {
  if (yo.rol === "dueno") {
    params.push(yo.org);
    return `${colOrg} = $${params.length}`;
  }
  const ids = await idsVisibles(yo);
  params.push(ids);
  return `${columna} = ANY($${params.length}::uuid[])`;
}

/** Lanza 404 si `yo` no puede ver los datos del usuario `usuarioId` (se responde 404 para no revelar que existe). */
export async function exigirVisible(yo, usuarioId, organizacionId) {
  if (organizacionId && organizacionId !== yo.org) throw new ErrorApp(404, "No encontrado", "no_encontrado");
  // Lo propio siempre es visible (el caso más común del cobrador): sin consultar la jerarquía
  if (yo.rol === "dueno" || (usuarioId && usuarioId === yo.id && organizacionId)) return;
  const ids = await idsVisibles(yo);
  if (!ids.includes(usuarioId)) throw new ErrorApp(404, "No encontrado", "no_encontrado");
}

/** Cobrador al que se asigna algo: el propio cobrador, o uno visible si es jefe. */
export async function resolverCobrador(db, yo, cobradorId) {
  if (yo.rol === "cobrador") return yo.id;
  if (!cobradorId) throw new ErrorApp(400, "Elige el cobrador", "cobrador_requerido");
  const { rows } = await db.query(
    `SELECT id, rol, estado, organizacion_id FROM usuarios WHERE id = $1`,
    [cobradorId]
  );
  const u = rows[0];
  if (!u || u.organizacion_id !== yo.org) throw new ErrorApp(400, "Cobrador inválido", "cobrador_invalido");
  if (u.rol !== "cobrador") throw new ErrorApp(400, "Solo se puede asignar a un cobrador", "cobrador_invalido");
  if (u.estado !== "activo") throw new ErrorApp(400, "Ese cobrador está inactivo", "cobrador_invalido");
  await exigirVisible(yo, u.id);
  return u.id;
}
