import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";

const globalForDb = globalThis as typeof globalThis & {
  __arenaNextJsPostgresqlPool?: Pool;
};

/**
 * `next build` importa los route handlers para recolectar metadatos, pero
 * NUNCA ejecuta consultas. En esa fase (y dentro del builder de Docker)
 * DATABASE_URL puede no existir todavía: se pospone el error hasta el
 * primer intento real de conexión en runtime.
 */
const isBuildPhase =
  process.env.NEXT_PHASE === "phase-production-build" ||
  process.env.NEXT_PHASE === "phase-export";

const databaseUrl = process.env.DATABASE_URL;

if (!databaseUrl && !isBuildPhase) {
  throw new Error(
    "DATABASE_URL is required (defínela en .env o en el entorno del contenedor)",
  );
}

const pool =
  globalForDb.__arenaNextJsPostgresqlPool ??
  new Pool({
    // Placeholder inerte: durante el build no se abre ninguna conexión.
    connectionString:
      databaseUrl ?? "postgresql://build-placeholder:5432/build_placeholder",
    connectionTimeoutMillis: 5000,
  });

if (process.env.NODE_ENV !== "production") {
  globalForDb.__arenaNextJsPostgresqlPool = pool;
}

export const db = drizzle(pool);
