// Carga .env.local (prioridad) y luego .env, igual que Next.js.
import { config } from "dotenv";

config({ path: [".env.local", ".env"], quiet: true });
