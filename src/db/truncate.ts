import "dotenv/config";
import { db } from "@/db";
import { sql } from "drizzle-orm";

async function clearData() {
  console.log("Limpiando tablas de la base de datos PostgreSQL...");
  
  await db.execute(
    sql`TRUNCATE TABLE attendance_logs, sync_runs, employees CASCADE;`
  );
  
  console.log("¡Tablas vaciadas correctamente!");
  process.exit(0);
}

clearData().catch((err) => {
  console.error("Error al limpiar la base de datos:", err);
  process.exit(1);
});