-- 002: se ingresa con correo + contraseña. El correo es obligatorio y único para todos.
-- (La columna "usuario" se elimina; la tabla estaba vacía cuando se aplicó.)

DROP INDEX IF EXISTS usuarios_usuario_unico;
ALTER TABLE usuarios DROP COLUMN usuario;

UPDATE usuarios SET email = lower(trim(email)) WHERE email IS NOT NULL;
ALTER TABLE usuarios ALTER COLUMN email SET NOT NULL;
ALTER TABLE usuarios ADD CONSTRAINT usuarios_email_formato CHECK (email ~ '^[^@\s]+@[^@\s]+\.[^@\s]+$');
CREATE UNIQUE INDEX usuarios_email_unico ON usuarios (lower(email));
