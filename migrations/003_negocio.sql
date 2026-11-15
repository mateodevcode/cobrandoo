-- 003: clientes, rutas, préstamos (cuotas, cargos), pagos y caja diaria.
-- Montos en BIGINT (pesos). Fechas de negocio en DATE (hora Colombia, calculada en la app).
-- Los IDs pueden venir del teléfono (UUID) para que el modo sin internet no duplique registros.

-- ===== RUTAS =====
CREATE TABLE rutas (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organizacion_id  uuid NOT NULL REFERENCES organizaciones(id),
  cobrador_id      uuid NOT NULL REFERENCES usuarios(id),
  nombre           text NOT NULL CHECK (length(trim(nombre)) > 0),
  orden            integer NOT NULL DEFAULT 0,
  activa           boolean NOT NULL DEFAULT true,
  creado_en        timestamptz NOT NULL DEFAULT now(),
  actualizado_en   timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX rutas_nombre_unico ON rutas (cobrador_id, lower(nombre)) WHERE activa;
CREATE TRIGGER rutas_actualizado BEFORE UPDATE ON rutas FOR EACH ROW EXECUTE FUNCTION tg_set_actualizado_en();

-- ===== CLIENTES =====
CREATE TABLE clientes (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organizacion_id  uuid NOT NULL REFERENCES organizaciones(id),
  cobrador_id      uuid NOT NULL REFERENCES usuarios(id),
  ruta_id          uuid REFERENCES rutas(id) ON DELETE SET NULL,
  orden_ruta       integer NOT NULL DEFAULT 0,
  nombre           text NOT NULL CHECK (length(trim(nombre)) > 0),
  cedula           text,
  telefono         text,
  direccion        text,
  barrio           text,
  ciudad           text,
  referencia       text,               -- quién lo recomendó
  notas            text,
  estado           text NOT NULL DEFAULT 'activo' CHECK (estado IN ('activo', 'inactivo')),
  token_publico    text NOT NULL UNIQUE, -- link /c/{token} para que vea su historial (fase 5)
  creado_por       uuid REFERENCES usuarios(id) ON DELETE SET NULL,
  creado_en        timestamptz NOT NULL DEFAULT now(),
  actualizado_en   timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX clientes_cedula_unica ON clientes (organizacion_id, cedula) WHERE cedula IS NOT NULL;
CREATE INDEX clientes_cobrador ON clientes (cobrador_id, ruta_id, orden_ruta);
CREATE INDEX clientes_org ON clientes (organizacion_id, estado);
CREATE TRIGGER clientes_actualizado BEFORE UPDATE ON clientes FOR EACH ROW EXECUTE FUNCTION tg_set_actualizado_en();

-- ===== PRÉSTAMOS =====
CREATE TABLE prestamos (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organizacion_id    uuid NOT NULL REFERENCES organizaciones(id),
  cliente_id         uuid NOT NULL REFERENCES clientes(id),
  cobrador_id        uuid NOT NULL REFERENCES usuarios(id),

  -- Condiciones (copia fija al crear: cambiar un método no altera préstamos viejos)
  metodo             text NOT NULL CHECK (metodo IN ('interes_mensual', 'cuotas_fijas')),
  parametros         jsonb NOT NULL,
  capital            bigint NOT NULL CHECK (capital > 0),
  tasa               numeric(6,3) NOT NULL CHECK (tasa >= 0 AND tasa <= 100),
  base_interes       text NOT NULL CHECK (base_interes IN ('saldo_total', 'capital_pendiente', 'capital_original')),
  frecuencia         text CHECK (frecuencia IN ('diaria', 'semanal', 'quincenal', 'mensual')),
  n_cuotas           integer CHECK (n_cuotas > 0),
  valor_cuota        bigint,
  recargo_tipo       text NOT NULL DEFAULT 'ninguno' CHECK (recargo_tipo IN ('ninguno', 'fijo_diario', 'porcentaje_cuota')),
  recargo_valor      numeric(14,3) NOT NULL DEFAULT 0 CHECK (recargo_valor >= 0),
  metodo_desembolso  text NOT NULL CHECK (metodo_desembolso IN ('efectivo', 'nequi', 'daviplata', 'transferencia')),
  fecha_inicio       date NOT NULL,
  fecha_vencimiento  date,

  -- Estado calculado por el motor (caché; la verdad son condiciones + pagos)
  estado             text NOT NULL DEFAULT 'activo' CHECK (estado IN ('activo', 'pagado', 'anulado')),
  total_cargado      bigint NOT NULL DEFAULT 0,
  total_pagado       bigint NOT NULL DEFAULT 0,
  saldo_capital      bigint NOT NULL DEFAULT 0,
  saldo_interes      bigint NOT NULL DEFAULT 0,
  saldo_recargo      bigint NOT NULL DEFAULT 0,
  saldo              bigint GENERATED ALWAYS AS (saldo_capital + saldo_interes + saldo_recargo) STORED,
  atraso             bigint NOT NULL DEFAULT 0,
  dias_atraso        integer NOT NULL DEFAULT 0,
  sugerido_hoy       bigint NOT NULL DEFAULT 0,
  proximo_corte      date,
  procesado_hasta    date,
  pagado_en          date,

  notas              text,
  creado_por         uuid REFERENCES usuarios(id) ON DELETE SET NULL,
  creado_en          timestamptz NOT NULL DEFAULT now(),
  actualizado_en     timestamptz NOT NULL DEFAULT now(),
  anulado_en         timestamptz,
  anulado_por        uuid REFERENCES usuarios(id) ON DELETE SET NULL,
  motivo_anulacion   text
);
CREATE INDEX prestamos_cliente ON prestamos (cliente_id, estado);
CREATE INDEX prestamos_cobrador ON prestamos (cobrador_id, estado);
CREATE INDEX prestamos_org ON prestamos (organizacion_id, estado);
CREATE INDEX prestamos_pendientes ON prestamos (procesado_hasta) WHERE estado = 'activo';
CREATE TRIGGER prestamos_actualizado BEFORE UPDATE ON prestamos FOR EACH ROW EXECUTE FUNCTION tg_set_actualizado_en();

-- Plan de cuotas (solo métodos con cuotas)
CREATE TABLE cuotas (
  prestamo_id  uuid NOT NULL REFERENCES prestamos(id) ON DELETE CASCADE,
  numero       integer NOT NULL,
  fecha        date NOT NULL,
  monto        bigint NOT NULL CHECK (monto > 0),
  PRIMARY KEY (prestamo_id, numero)
);

-- Cargos (capital, intereses, recargos). Los genera el motor; "clave" los hace únicos e idempotentes.
CREATE TABLE prestamo_cargos (
  id           bigserial PRIMARY KEY,
  prestamo_id  uuid NOT NULL REFERENCES prestamos(id) ON DELETE CASCADE,
  tipo         text NOT NULL CHECK (tipo IN ('capital', 'interes', 'recargo')),
  monto        bigint NOT NULL CHECK (monto > 0),
  fecha        date NOT NULL,
  clave        text NOT NULL,
  descripcion  text,
  UNIQUE (prestamo_id, clave)
);

-- ===== CAJA: jornada diaria por persona =====
CREATE TABLE jornadas (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organizacion_id  uuid NOT NULL REFERENCES organizaciones(id),
  usuario_id       uuid NOT NULL REFERENCES usuarios(id),
  fecha            date NOT NULL,
  estado           text NOT NULL DEFAULT 'abierta' CHECK (estado IN ('abierta', 'cerrada')),
  abierta_en       timestamptz NOT NULL DEFAULT now(),
  cerrada_en       timestamptz,
  UNIQUE (usuario_id, fecha)
);

-- ===== PAGOS =====
CREATE TABLE pagos (
  id                     uuid PRIMARY KEY,                -- lo genera el cliente (idempotente)
  organizacion_id        uuid NOT NULL REFERENCES organizaciones(id),
  prestamo_id            uuid NOT NULL REFERENCES prestamos(id),
  cliente_id             uuid NOT NULL REFERENCES clientes(id),
  cobrador_id            uuid NOT NULL REFERENCES usuarios(id),  -- quién recibió el dinero
  jornada_id             uuid REFERENCES jornadas(id),
  monto                  bigint NOT NULL CHECK (monto > 0),
  metodo                 text NOT NULL CHECK (metodo IN ('efectivo', 'nequi', 'daviplata', 'transferencia')),
  fecha                  date NOT NULL,
  aplicado_recargo       bigint NOT NULL DEFAULT 0,
  aplicado_interes       bigint NOT NULL DEFAULT 0,
  aplicado_capital       bigint NOT NULL DEFAULT 0,
  sobrante               bigint NOT NULL DEFAULT 0,
  nota                   text,
  creado_en              timestamptz NOT NULL DEFAULT now(),
  creado_en_dispositivo  timestamptz,
  anulado_en             timestamptz,
  anulado_por            uuid REFERENCES usuarios(id) ON DELETE SET NULL,
  motivo_anulacion       text
);
CREATE INDEX pagos_prestamo ON pagos (prestamo_id, fecha, creado_en);
CREATE INDEX pagos_cobrador ON pagos (cobrador_id, fecha);
CREATE INDEX pagos_org ON pagos (organizacion_id, fecha);

-- ===== MOVIMIENTOS DE CAJA (nunca se editan; las correcciones son movimientos nuevos) =====
CREATE TABLE movimientos_caja (
  id                     uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organizacion_id        uuid NOT NULL REFERENCES organizaciones(id),
  usuario_id             uuid NOT NULL REFERENCES usuarios(id),   -- de quién es la caja
  jornada_id             uuid NOT NULL REFERENCES jornadas(id),
  tipo                   text NOT NULL CHECK (tipo IN ('base', 'cobro', 'desembolso', 'gasto', 'entrega', 'ajuste', 'anulacion')),
  metodo                 text NOT NULL CHECK (metodo IN ('efectivo', 'nequi', 'daviplata', 'transferencia')),
  monto                  bigint NOT NULL CHECK (monto <> 0),       -- + entra, − sale
  categoria              text,
  descripcion            text,
  ref_tipo               text,                                     -- 'pago' | 'prestamo' | ...
  ref_id                 uuid,
  contraparte_id         uuid REFERENCES usuarios(id),             -- p. ej. el jefe que entregó la base
  creado_por             uuid REFERENCES usuarios(id) ON DELETE SET NULL,
  creado_en              timestamptz NOT NULL DEFAULT now(),
  creado_en_dispositivo  timestamptz
);
CREATE INDEX movimientos_jornada ON movimientos_caja (jornada_id, creado_en);
CREATE INDEX movimientos_usuario ON movimientos_caja (usuario_id, creado_en DESC);
CREATE INDEX movimientos_ref ON movimientos_caja (ref_tipo, ref_id);
