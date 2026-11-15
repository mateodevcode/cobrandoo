// Aplica los archivos migrations/NNN_*.sql en orden, una sola vez cada uno.
// Uso: npm run db:migrate
import "./_env.mjs";
import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import pg from "pg";
import { sslConfig } from "./_ssl.mjs";

const dir = join(process.cwd(), "migrations");

if (!process.env.DATABASE_URL) {
  console.error("Falta DATABASE_URL en .env.local / .env");
  process.exit(1);
}

const client = new pg.Client({ connectionString: process.env.DATABASE_URL, ssl: sslConfig() });
await client.connect();

try {
  // Evita que dos procesos migren a la vez
  await client.query("SELECT pg_advisory_lock(727274)");
  await client.query(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      nombre      text PRIMARY KEY,
      aplicada_en timestamptz NOT NULL DEFAULT now()
    )`);

  const { rows } = await client.query("SELECT nombre FROM schema_migrations");
  const aplicadas = new Set(rows.map((r) => r.nombre));
  const archivos = (await readdir(dir)).filter((f) => /^\d+_.+\.sql$/.test(f)).sort();

  let n = 0;
  for (const archivo of archivos) {
    if (aplicadas.has(archivo)) continue;
    const sql = await readFile(join(dir, archivo), "utf8");
    process.stdout.write(`→ ${archivo} ... `);
    await client.query("BEGIN");
    try {
      await client.query(sql);
      await client.query("INSERT INTO schema_migrations (nombre) VALUES ($1)", [archivo]);
      await client.query("COMMIT");
      console.log("ok");
      n++;
    } catch (err) {
      await client.query("ROLLBACK");
      console.log("FALLÓ");
      throw err;
    }
  }
  console.log(n ? `${n} migración(es) aplicada(s).` : "La base ya está al día.");
} finally {
  await client.query("SELECT pg_advisory_unlock(727274)").catch(() => {});
  await client.end();
}
