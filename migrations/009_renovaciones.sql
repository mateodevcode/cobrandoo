-- Renovación: un préstamo nuevo absorbe el saldo del anterior. El anterior se salda con un pago
-- de método 'renovacion' (no entra dinero a la caja) y de la caja solo sale la diferencia.
ALTER TABLE pagos DROP CONSTRAINT IF EXISTS pagos_metodo_check;
ALTER TABLE pagos ADD CONSTRAINT pagos_metodo_check
  CHECK (metodo IN ('efectivo', 'nequi', 'daviplata', 'transferencia', 'renovacion'));

ALTER TABLE prestamos
  ADD COLUMN IF NOT EXISTS renueva_a uuid REFERENCES prestamos(id),
  ADD COLUMN IF NOT EXISTS saldo_renovado bigint NOT NULL DEFAULT 0 CHECK (saldo_renovado >= 0);
CREATE INDEX IF NOT EXISTS prestamos_renueva_a ON prestamos (renueva_a) WHERE renueva_a IS NOT NULL;
