# Fotos de clientes en AWS S3 (privado)

La app sube las fotos **a través del servidor** (no desde el navegador) y para mostrarlas firma un
enlace que vence en 10 minutos. Por eso el bucket **no necesita ser público ni tener CORS**.

Ruta de cada foto: `<subcarpeta>/org/<organización>/clientes/<cliente>/<foto>.jpg`
(la subcarpeta es `AWS_BUCKET_SUBFOLDER`, p. ej. `cobrandoo`).

## Estado actual (revisado)

- El bucket tiene una política `PublicReadGetObject` (`Principal: "*"`, `s3:GetObject`) y el
  "Bloqueo de acceso público" está apagado → **cualquiera con la URL ve los archivos**.
- Lo comparte otra app (aparece en su CORS). Cerrarlo entero podría romperla.

## Opción A (recomendada): un bucket solo para Cobrandoo

1. S3 → **Create bucket** → nombre p. ej. `cobrandoo-fotos`, misma región.
2. **Block all public access: ACTIVADO** (las 4 casillas).
3. Object Ownership: **ACLs disabled**. Default encryption: **SSE-S3**. Sin política de bucket. Sin CORS.
4. Cambia `AWS_BUCKET` (en `.env.local` y en Vercel) al nombre nuevo. `AWS_BUCKET_SUBFOLDER` puede quedar igual.
5. Dale al usuario IAM de la app solo este permiso (IAM → Users → tu usuario → Add permissions → Create inline policy → JSON):

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Sid": "FotosCobrandoo",
      "Effect": "Allow",
      "Action": ["s3:PutObject", "s3:GetObject", "s3:DeleteObject"],
      "Resource": "arn:aws:s3:::cobrandoo-fotos/*"
    },
    {
      "Sid": "ListarParaBorrarOrganizaciones",
      "Effect": "Allow",
      "Action": "s3:ListBucket",
      "Resource": "arn:aws:s3:::cobrandoo-fotos"
    }
  ]
}
```

## Opción B: seguir en el bucket compartido, cerrando solo la carpeta de Cobrandoo

S3 → tu bucket → **Permissions → Bucket policy → Edit** y agrega este bloque dentro de
`"Statement": [ ... ]` (junto al `PublicReadGetObject` que ya existe). Reemplaza `TU_BUCKET`,
`cobrandoo` (si tu subcarpeta es otra), `TU_CUENTA` (12 dígitos, arriba a la derecha en la consola)
y `TU_USUARIO_IAM` (el usuario de las llaves que pusiste en `.env.local`):

```json
{
  "Sid": "CobrandooPrivado",
  "Effect": "Deny",
  "Principal": "*",
  "Action": "s3:GetObject",
  "Resource": "arn:aws:s3:::TU_BUCKET/cobrandoo/*",
  "Condition": {
    "StringNotLike": { "aws:PrincipalArn": "arn:aws:iam::TU_CUENTA:user/TU_USUARIO_IAM" }
  }
}
```

Un `Deny` explícito gana sobre el `Allow` público: los visitantes anónimos reciben 403 en
`cobrandoo/*` y la otra app sigue igual. Los enlaces firmados de Cobrandoo funcionan porque los
firma ese usuario IAM.

## Variables en Vercel

Vercel reserva los nombres `AWS_*` y puede no dejarte crearlos. La app acepta estos equivalentes:

| En `.env.local` (local)  | En Vercel              |
|--------------------------|------------------------|
| `AWS_DEFAULT_REGION`     | `S3_REGION`            |
| `AWS_BUCKET`             | `S3_BUCKET`            |
| `AWS_ACCESS_KEY_ID`      | `S3_ACCESS_KEY_ID`     |
| `AWS_SECRET_ACCESS_KEY`  | `S3_SECRET_ACCESS_KEY` |
| `AWS_BUCKET_SUBFOLDER`   | `S3_PREFIJO`           |

Mientras falten, la app funciona igual pero sin fotos (no las exige al crear clientes).

## Comprobar

Abre la ficha de un cliente con foto, copia la URL de la imagen y quítale todo desde `?`.
Abierta así, sin firma, debe responder **AccessDenied (403)**.
