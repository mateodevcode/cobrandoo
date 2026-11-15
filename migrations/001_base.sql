-- 001_base: organizaciones, usuarios (roles + jerarquía), sesiones y auditoría.
-- Dinero: siempre BIGINT en pesos colombianos (sin decimales).

-- gen_random_uuid() viene incluido desde PostgreSQL 13 (no requiere extensiones).

-- Actualiza actualizado_en automáticamente
CREATE OR REPLACE FUNCTION tg_set_actualizado_en() RETURNS trigger AS $$
BEGIN
  NEW.actualizado_en := now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- ===== ORGANIZACIONES (un negocio; puede tener varios dueños) =====
CREATE TABLE organizaciones (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nombre          text NOT NULL CHECK (length(trim(nombre)) > 0),
  activa          boolean NOT NULL DEFAULT true,
  creado_en       timestamptz NOT NULL DEFAULT now(),
  actualizado_en  timestamptz NOT NULL DEFAULT now()
);
CREATE TRIGGER organizaciones_actualizado BEFORE UPDATE ON organizaciones
  FOR EACH ROW EXECUTE FUNCTION tg_set_actualizado_en();

-- ===== USUARIOS =====
-- rol es texto con CHECK (no ENUM) para poder agregar roles (contador, analista) sin dolor.
CREATE TABLE usuarios (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organizacion_id    uuid REFERENCES organizaciones(id) ON DELETE RESTRICT,
  rol                text NOT NULL CHECK (rol IN ('super_admin', 'dueno', 'supervisor', 'cobrador')),
  jefe_id            uuid REFERENCES usuarios(id) ON DELETE RESTRICT,
  usuario            text NOT NULL,              -- identificador de login (cédula, celular o alias)
  nombre             text NOT NULL CHECK (length(trim(nombre)) > 0),
  cedula             text,
  telefono           text,
  email              text,
  password_hash      text NOT NULL,
  estado             text NOT NULL DEFAULT 'activo' CHECK (estado IN ('activo', 'inactivo', 'suspendido')),
  intentos_fallidos  integer NOT NULL DEFAULT 0,
  bloqueado_hasta    timestamptz,
  ultimo_acceso      timestamptz,
  creado_por         uuid REFERENCES usuarios(id) ON DELETE SET NULL,
  creado_en          timestamptz NOT NULL DEFAULT now(),
  actualizado_en     timestamptz NOT NULL DEFAULT now(),

  -- super_admin no pertenece a ninguna organización; el resto sí
  CONSTRAINT usuarios_org_por_rol CHECK (
    (rol = 'super_admin' AND organizacion_id IS NULL AND jefe_id IS NULL)
    OR (rol <> 'super_admin' AND organizacion_id IS NOT NULL)
  ),
  -- los dueños están en la cima de su organización
  CONSTRAINT usuarios_dueno_sin_jefe CHECK (rol <> 'dueno' OR jefe_id IS NULL),
  CONSTRAINT usuarios_no_es_su_jefe CHECK (jefe_id IS NULL OR jefe_id <> id)
);
CREATE UNIQUE INDEX usuarios_usuario_unico ON usuarios (lower(usuario));
CREATE INDEX usuarios_org_rol ON usuarios (organizacion_id, rol);
CREATE INDEX usuarios_jefe ON usuarios (jefe_id);
CREATE TRIGGER usuarios_actualizado BEFORE UPDATE ON usuarios
  FOR EACH ROW EXECUTE FUNCTION tg_set_actualizado_en();

-- ===== SESIONES (refresh tokens rotativos, se guarda solo el hash) =====
CREATE TABLE sesiones (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  usuario_id       uuid NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
  familia_id       uuid NOT NULL,                 -- cadena de rotación; reuso => se revoca la familia
  refresh_hash     text NOT NULL UNIQUE,
  user_agent       text,
  ip               text,
  expira_en        timestamptz NOT NULL,
  usada_en         timestamptz,                   -- cuando se rotó
  revocada_en      timestamptz,
  creado_en        timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX sesiones_usuario ON sesiones (usuario_id);
CREATE INDEX sesiones_familia ON sesiones (familia_id);

-- ===== AUDITORÍA (quién hizo qué; útil con varios dueños) =====
CREATE TABLE auditoria (
  id               bigserial PRIMARY KEY,
  organizacion_id  uuid REFERENCES organizaciones(id) ON DELETE SET NULL,
  usuario_id       uuid REFERENCES usuarios(id) ON DELETE SET NULL,
  accion           text NOT NULL,
  entidad          text,
  entidad_id       uuid,
  datos            jsonb,
  ip               text,
  creado_en        timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX auditoria_org_fecha ON auditoria (organizacion_id, creado_en DESC);
CREATE INDEX auditoria_entidad ON auditoria (entidad, entidad_id);
