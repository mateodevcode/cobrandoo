-- 004: cierre del día (arqueo), revisión del supervisor, notificaciones y suscripciones push.

-- Nuevos tipos de movimiento del lado del jefe:
--   base_entregada: sale de la caja del jefe al darle base a un cobrador
--   recibido:       entra a la caja del jefe cuando el cobrador le entrega al cerrar
ALTER TABLE movimientos_caja DROP CONSTRAINT movimientos_caja_tipo_check;
ALTER TABLE movimientos_caja ADD CONSTRAINT movimientos_caja_tipo_check
  CHECK (tipo IN ('base', 'cobro', 'desembolso', 'gasto', 'entrega', 'ajuste', 'anulacion', 'base_entregada', 'recibido'));

-- ===== CIERRES (uno por jornada) =====
CREATE TABLE cierres (
  id                     uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organizacion_id        uuid NOT NULL REFERENCES organizaciones(id),
  jornada_id             uuid NOT NULL UNIQUE REFERENCES jornadas(id),
  usuario_id             uuid NOT NULL REFERENCES usuarios(id),     -- quien cierra (cobrador)
  jefe_id                uuid REFERENCES usuarios(id),               -- a quien le entrega
  fecha                  date NOT NULL,

  -- Cuadre de efectivo
  efectivo_esperado      bigint NOT NULL,
  efectivo_contado       bigint NOT NULL CHECK (efectivo_contado >= 0),
  diferencia             bigint GENERATED ALWAYS AS (efectivo_contado - efectivo_esperado) STORED,
  digital                bigint NOT NULL DEFAULT 0,                  -- Nequi/Daviplata/transferencias (se revisa aparte)
  resumen                jsonb NOT NULL,                             -- totales por tipo y método al cerrar
  observacion            text,                                       -- lo que explica el cobrador

  -- Revisión del jefe
  estado                 text NOT NULL DEFAULT 'pendiente' CHECK (estado IN ('pendiente', 'aprobado', 'con_fallo', 'resuelto')),
  revisado_por           uuid REFERENCES usuarios(id),
  revisado_en            timestamptz,
  comentario_revision    text,
  resuelto_por           uuid REFERENCES usuarios(id),
  resuelto_en            timestamptz,
  comentario_resolucion  text,

  creado_en              timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX cierres_org_estado ON cierres (organizacion_id, estado, fecha DESC);
CREATE INDEX cierres_usuario ON cierres (usuario_id, fecha DESC);

-- ===== NOTIFICACIONES (bandeja dentro de la app) =====
CREATE TABLE notificaciones (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organizacion_id  uuid REFERENCES organizaciones(id) ON DELETE CASCADE,
  usuario_id       uuid NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
  tipo             text NOT NULL,
  titulo           text NOT NULL,
  cuerpo           text,
  url              text,
  datos            jsonb,
  leida_en         timestamptz,
  creado_en        timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX notificaciones_usuario ON notificaciones (usuario_id, creado_en DESC);
CREATE INDEX notificaciones_sin_leer ON notificaciones (usuario_id) WHERE leida_en IS NULL;

-- ===== SUSCRIPCIONES WEB PUSH (un registro por teléfono/navegador) =====
CREATE TABLE suscripciones_push (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  usuario_id   uuid NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
  endpoint     text NOT NULL UNIQUE,
  p256dh       text NOT NULL,
  auth         text NOT NULL,
  user_agent   text,
  creado_en    timestamptz NOT NULL DEFAULT now(),
  ultimo_uso   timestamptz
);
CREATE INDEX suscripciones_usuario ON suscripciones_push (usuario_id);
