/**
 * Hook de arranque de Next.js: registra el cron ISAPI en el runtime
 * Node (no en edge ni durante el build).
 */
export async function register(): Promise<void> {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  const { startSyncCron } = await import("@/lib/sync-service");
  startSyncCron();
}
