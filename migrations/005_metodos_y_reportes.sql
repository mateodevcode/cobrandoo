-- 005: nuevos métodos de préstamo y dinero realmente entregado (para el método con interés descontado).

ALTER TABLE prestamos DROP CONSTRAINT prestamos_metodo_check;
ALTER TABLE prestamos ADD CONSTRAINT prestamos_metodo_check
  CHECK (metodo IN ('interes_mensual', 'cuotas_fijas', 'solo_interes', 'descuento_anticipado'));

-- Lo que salió de caja al prestar. Igual al capital, salvo cuando el interés se descuenta al entregar.
ALTER TABLE prestamos ADD COLUMN monto_entregado bigint;
UPDATE prestamos SET monto_entregado = capital WHERE monto_entregado IS NULL;
ALTER TABLE prestamos ALTER COLUMN monto_entregado SET NOT NULL;

-- Índices para reportes por período
CREATE INDEX IF NOT EXISTS pagos_org_fecha_valido ON pagos (organizacion_id, fecha) WHERE anulado_en IS NULL;
CREATE INDEX IF NOT EXISTS prestamos_org_inicio ON prestamos (organizacion_id, fecha_inicio) WHERE estado <> 'anulado';
