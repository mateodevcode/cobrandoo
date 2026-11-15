// Crea (o reinicia la clave de) el super admin de la plataforma.
// Uso: npm run db:super-admin -- <correo> "<Nombre>"
// La contraseña va en la variable SUPER_ADMIN_PASSWORD para que no quede en el historial.
import "./_env.mjs";
import pg from "pg";
import bcrypt from "bcryptjs";
import { sslConfig } from "./_ssl.mjs";

const [correoArg, nombre = "Super Admin"] = process.argv.slice(2);
const email = correoArg?.trim().toLowerCase();
const password = process.env.SUPER_ADMIN_PASSWORD;

if (!email || !password) {
  console.error('Uso: SUPER_ADMIN_PASSWORD=... npm run db:super-admin -- <correo> "<Nombre>"');
  process.exit(1);
}
if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
  console.error("Ese correo no es válido.");
  process.exit(1);
}
if (password.length < 10) {
  console.error("La contraseña debe tener al menos 10 caracteres.");
  process.exit(1);
}

const client = new pg.Client({ connectionString: process.env.DATABASE_URL, ssl: sslConfig() });
await client.connect();
try {
  const hash = await bcrypt.hash(password, 12);
  const { rows } = await client.query(
    `INSERT INTO usuarios (rol, email, nombre, password_hash)
     VALUES ('super_admin', $1, $2, $3)
     ON CONFLICT (lower(email)) DO UPDATE
       SET password_hash = EXCLUDED.password_hash, intentos_fallidos = 0, bloqueado_hasta = NULL
       WHERE usuarios.rol = 'super_admin'
     RETURNING id`,
    [email, nombre.trim(), hash]
  );
  if (!rows.length) {
    console.error("Ese correo ya pertenece a otro usuario que no es super admin; no se modificó.");
    process.exit(1);
  }
  console.log(`Super admin listo: ${email}`);
} finally {
  await client.end();
}
