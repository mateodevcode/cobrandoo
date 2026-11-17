import "server-only";
import { S3Client, PutObjectCommand, GetObjectCommand, ListObjectsV2Command, DeleteObjectsCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

// Fotos de clientes en un bucket PRIVADO. Nunca hay URLs públicas: para verlas el servidor firma
// un enlace que vence en pocos minutos, solo para usuarios que pueden ver a ese cliente.
// Variables: S3_* o, si no están, las AWS_* equivalentes
//   S3_REGION | AWS_DEFAULT_REGION, S3_BUCKET | AWS_BUCKET, S3_ACCESS_KEY_ID | AWS_ACCESS_KEY_ID,
//   S3_SECRET_ACCESS_KEY | AWS_SECRET_ACCESS_KEY, S3_PREFIJO | AWS_BUCKET_SUBFOLDER (carpeta dentro del bucket)
const MINUTOS_ENLACE = 10;
const env = (a, b) => process.env[a] || process.env[b] || "";
const conf = () => ({
  region: env("S3_REGION", "AWS_DEFAULT_REGION"),
  bucket: env("S3_BUCKET", "AWS_BUCKET"),
  accessKeyId: env("S3_ACCESS_KEY_ID", "AWS_ACCESS_KEY_ID"),
  secretAccessKey: env("S3_SECRET_ACCESS_KEY", "AWS_SECRET_ACCESS_KEY"),
  prefijo: env("S3_PREFIJO", "AWS_BUCKET_SUBFOLDER").replace(/^\/+|\/+$/g, ""),
});

export function s3Configurado() {
  const c = conf();
  return !!(c.region && c.bucket && c.accessKeyId && c.secretAccessKey);
}

let cliente;
function s3() {
  const c = conf();
  cliente ??= new S3Client({ region: c.region, credentials: { accessKeyId: c.accessKeyId, secretAccessKey: c.secretAccessKey } });
  return cliente;
}
const bucket = () => conf().bucket;
const conPrefijo = (ruta) => (conf().prefijo ? `${conf().prefijo}/${ruta}` : ruta);

export async function subir(key, cuerpo, contentType) {
  await s3().send(
    new PutObjectCommand({
      Bucket: bucket(),
      Key: key,
      Body: cuerpo,
      ContentType: contentType,
      ServerSideEncryption: "AES256",
      CacheControl: "private, max-age=86400",
    })
  );
}

/** Enlace temporal (privado) para ver un archivo. */
export function enlaceTemporal(key) {
  return getSignedUrl(s3(), new GetObjectCommand({ Bucket: bucket(), Key: key }), { expiresIn: MINUTOS_ENLACE * 60 });
}

/** Borra todo lo que hay bajo un prefijo (p. ej. al eliminar una organización). */
export async function borrarPrefijo(prefijo) {
  if (!s3Configurado()) return 0;
  let token;
  let total = 0;
  do {
    const r = await s3().send(new ListObjectsV2Command({ Bucket: bucket(), Prefix: prefijo, ContinuationToken: token }));
    const objetos = (r.Contents ?? []).map((o) => ({ Key: o.Key }));
    if (objetos.length) {
      await s3().send(new DeleteObjectsCommand({ Bucket: bucket(), Delete: { Objects: objetos, Quiet: true } }));
      total += objetos.length;
    }
    token = r.IsTruncated ? r.NextContinuationToken : undefined;
  } while (token);
  return total;
}

export const prefijoOrganizacion = (orgId) => conPrefijo(`org/${orgId}/`);
export const keyFotoCliente = (orgId, clienteId, fotoId, ext) => conPrefijo(`org/${orgId}/clientes/${clienteId}/${fotoId}.${ext}`);
