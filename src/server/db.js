import "server-only";
import pg from "pg";

// BIGINT (int8) → Number. Los montos en pesos caben de sobra en Number.MAX_SAFE_INTEGER.
pg.types.setTypeParser(20, (v) => (v === null ? null : Number(v)));
// DATE → texto "YYYY-MM-DD" (sin convertir a Date, para no correr el día por la zona horaria)
pg.types.setTypeParser(1082, (v) => v);
// NUMERIC → Number (tasas y recargos con decimales pequeños)
pg.types.setTypeParser(1700, (v) => (v === null ? null : Number(v)));

function sslConfig() {
  const modo = (process.env.DATABASE_SSL || "disable").toLowerCase();
  if (modo === "disable") return false;
  if (modo === "verify") return { rejectUnauthorized: true };
  return { rejectUnauthorized: false };
}

function crearPool() {
  if (!process.env.DATABASE_URL) throw new Error("Falta DATABASE_URL");
  const pool = new pg.Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: sslConfig(),
    max: Number(process.env.DATABASE_POOL_MAX || 3),
    idleTimeoutMillis: 10_000,
    connectionTimeoutMillis: 8_000,
    // Si la red al VPS se corta a mitad de una transacción, Postgres la cierra sola
    // y suelta los bloqueos (si no, quedaría "idle in transaction" frenando todo).
    idle_in_transaction_session_timeout: 30_000,
    statement_timeout: 30_000,
    // Detecta conexiones muertas (cortes de red, NAT) en vez de esperar indefinidamente
    keepAlive: true,
    keepAliveInitialDelayMillis: 10_000,
  });
  pool.on("error", (err) => console.error("[db] error en conexión inactiva:", err.message));
  return pool;
}

// Un solo pool por proceso (sobrevive al hot-reload en desarrollo).
const g = globalThis;
function pool() {
  if (!g.__cobrandooPool) g.__cobrandooPool = crearPool();
  return g.__cobrandooPool;
}

/** Consulta parametrizada. Usa SIEMPRE $1, $2... nunca concatenes valores. */
export function query(text, params) {
  return pool().query(text, params);
}

/** Primera fila o null. */
export async function uno(text, params) {
  const { rows } = await pool().query(text, params);
  return rows[0] ?? null;
}

/** Ejecuta fn(client) dentro de una transacción. */
export async function transaccion(fn) {
  const client = await pool().connect();
  let descartar;
  try {
    await client.query("BEGIN");
    const resultado = await fn(client);
    await client.query("COMMIT");
    return resultado;
  } catch (err) {
    await client.query("ROLLBACK").catch(() => {});
    // Error de red (sin código SQLSTATE de Postgres ni de negocio): se descarta la conexión
    // para no devolver al pool una conexión rota
    if (err?.code && !/^[0-9A-Z]{5}$/.test(err.code) && !err.status) descartar = err;
    throw err;
  } finally {
    client.release(descartar);
  }
}
