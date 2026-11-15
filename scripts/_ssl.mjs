// DATABASE_SSL: "disable" | "require" (cifra sin validar cert, típico en VPS con cert propio) | "verify"
export function sslConfig() {
  const modo = (process.env.DATABASE_SSL || "disable").toLowerCase();
  if (modo === "disable") return false;
  if (modo === "verify") return { rejectUnauthorized: true };
  return { rejectUnauthorized: false };
}
