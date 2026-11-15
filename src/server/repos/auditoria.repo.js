import "server-only";
import { query } from "../db";

/** Registra una acción. `db` puede ser un cliente de transacción. */
export function registrar(db = { query }, { organizacionId = null, usuarioId = null, accion, entidad = null, entidadId = null, datos = null, ip = null }) {
  return db.query(
    `INSERT INTO auditoria (organizacion_id, usuario_id, accion, entidad, entidad_id, datos, ip)
     VALUES ($1, $2, $3, $4, $5, $6, $7)`,
    [organizacionId, usuarioId, accion, entidad, entidadId, datos ? JSON.stringify(datos) : null, ip]
  );
}
