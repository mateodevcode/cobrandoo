-- Al cambiar la contraseña, los tokens de acceso emitidos antes dejan de valer al instante
-- (no solo los de refresco): se rechaza todo token con iat anterior a esta marca.
ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS sesiones_desde timestamptz;
