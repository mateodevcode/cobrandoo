-- 006: eliminar personas sin perder su historial.
-- Una persona eliminada no se borra físicamente: préstamos, pagos, caja y cierres la siguen
-- referenciando. Queda inactiva, sin poder ingresar, con el correo liberado y oculta de las listas.

ALTER TABLE usuarios ADD COLUMN eliminado_en timestamptz;
ALTER TABLE usuarios ADD COLUMN eliminado_por uuid REFERENCES usuarios(id) ON DELETE SET NULL;
CREATE INDEX usuarios_vigentes ON usuarios (organizacion_id) WHERE eliminado_en IS NULL;
