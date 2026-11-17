import "server-only";
import { query } from "../db";
import { ErrorApp } from "../http";
import { s3Configurado, subir, enlaceTemporal, keyFotoCliente } from "../s3";
import { obtener as obtenerCliente } from "./clientes.service";
import * as auditoria from "../repos/auditoria.repo";

export const TIPOS_FOTO = ["casa", "cedula", "otra"];
const FORMATOS = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp" };
export const MAX_BYTES = 4 * 1024 * 1024; // el teléfono la comprime antes (≈ 200-400 KB)
const MAX_POR_CLIENTE = 12;

/** Firma: los primeros bytes deben ser de una imagen real (no basta con el content-type). */
function esImagen(buf, tipo) {
  if (tipo === "image/jpeg") return buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff;
  if (tipo === "image/png") return buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47;
  if (tipo === "image/webp") return buf.subarray(0, 4).toString() === "RIFF" && buf.subarray(8, 12).toString() === "WEBP";
  return false;
}

/** Sube una foto de un cliente. Idempotente por `id` (reintentos del modo sin señal). */
export async function subirFoto(yo, clienteId, { id, tipo, archivo }, ip) {
  if (!s3Configurado()) throw new ErrorApp(503, "El almacenamiento de fotos aún no está configurado", "fotos_no_configuradas");
  const cliente = await obtenerCliente(yo, clienteId); // 404 si no lo puede ver

  const { rows: ya } = await query(`SELECT id FROM cliente_fotos WHERE id = $1`, [id]);
  if (ya[0]) return { id, duplicado: true };

  const ext = FORMATOS[archivo.type];
  if (!ext) throw new ErrorApp(400, "Solo se aceptan fotos JPG, PNG o WEBP", "formato_invalido");
  if (archivo.size > MAX_BYTES) throw new ErrorApp(413, "La foto pesa demasiado (máximo 4 MB)", "foto_grande");
  const buf = Buffer.from(await archivo.arrayBuffer());
  if (!esImagen(buf, archivo.type)) throw new ErrorApp(400, "El archivo no es una imagen válida", "formato_invalido");

  const { rows: n } = await query(`SELECT count(*)::int AS n FROM cliente_fotos WHERE cliente_id = $1 AND eliminado_en IS NULL`, [clienteId]);
  if (n[0].n >= MAX_POR_CLIENTE) throw new ErrorApp(409, `Este cliente ya tiene ${MAX_POR_CLIENTE} fotos. Borra alguna antes.`, "demasiadas_fotos");

  const key = keyFotoCliente(cliente.organizacion_id, clienteId, id, ext);
  await subir(key, buf, archivo.type);
  await query(
    `INSERT INTO cliente_fotos (id, organizacion_id, cliente_id, tipo, s3_key, content_type, tamano, subido_por)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8) ON CONFLICT (id) DO NOTHING`,
    [id, cliente.organizacion_id, clienteId, tipo, key, archivo.type, buf.length, yo.id]
  );
  await auditoria.registrar({ query }, { organizacionId: yo.org, usuarioId: yo.id, accion: "cliente.foto", entidad: "cliente", entidadId: clienteId, datos: { foto: id, tipo }, ip });
  return { id };
}

/** Fotos de un cliente con enlaces temporales para verlas (vencen en minutos). */
export async function fotosDe(yo, clienteId) {
  await obtenerCliente(yo, clienteId);
  if (!s3Configurado()) return [];
  const { rows } = await query(
    `SELECT f.id, f.tipo, f.s3_key, f.creado_en, u.nombre AS subido_por_nombre
       FROM cliente_fotos f LEFT JOIN usuarios u ON u.id = f.subido_por
      WHERE f.cliente_id = $1 AND f.eliminado_en IS NULL
      ORDER BY array_position(ARRAY['casa','cedula','otra'], f.tipo), f.creado_en`,
    [clienteId]
  );
  return Promise.all(rows.map(async ({ s3_key, ...f }) => ({ ...f, url: await enlaceTemporal(s3_key) })));
}

/** El dueño o un supervisor quita una foto (queda en S3 como respaldo; se deja de mostrar). */
export async function quitarFoto(yo, clienteId, fotoId, ip) {
  if (yo.rol === "cobrador") throw new ErrorApp(403, "Solo un jefe puede quitar fotos", "prohibido");
  await obtenerCliente(yo, clienteId);
  const { rowCount } = await query(`UPDATE cliente_fotos SET eliminado_en = now() WHERE id = $1 AND cliente_id = $2 AND eliminado_en IS NULL`, [fotoId, clienteId]);
  if (!rowCount) throw new ErrorApp(404, "Foto no encontrada", "no_encontrado");
  await auditoria.registrar({ query }, { organizacionId: yo.org, usuarioId: yo.id, accion: "cliente.foto_quitar", entidad: "cliente", entidadId: clienteId, datos: { foto: fotoId }, ip });
  return { id: fotoId };
}
