-- Ubicación GPS del cliente (se toma con el celular al crearlo) y fotos (casa, cédula) en S3 privado.
ALTER TABLE clientes
  ADD COLUMN IF NOT EXISTS latitud   numeric(9,6) CHECK (latitud BETWEEN -90 AND 90),
  ADD COLUMN IF NOT EXISTS longitud  numeric(9,6) CHECK (longitud BETWEEN -180 AND 180),
  ADD COLUMN IF NOT EXISTS ubicacion_precision integer;

CREATE TABLE IF NOT EXISTS cliente_fotos (
  id               uuid PRIMARY KEY,                 -- lo genera el teléfono (idempotente sin señal)
  organizacion_id  uuid NOT NULL REFERENCES organizaciones(id) ON DELETE CASCADE,
  cliente_id       uuid NOT NULL REFERENCES clientes(id) ON DELETE CASCADE,
  tipo             text NOT NULL CHECK (tipo IN ('casa', 'cedula', 'otra')),
  s3_key           text NOT NULL,
  content_type     text NOT NULL,
  tamano           integer NOT NULL,
  subido_por       uuid REFERENCES usuarios(id) ON DELETE SET NULL,
  creado_en        timestamptz NOT NULL DEFAULT now(),
  eliminado_en     timestamptz
);
CREATE INDEX IF NOT EXISTS cliente_fotos_cliente ON cliente_fotos (cliente_id) WHERE eliminado_en IS NULL;
