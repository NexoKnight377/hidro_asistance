import { desc, eq } from "drizzle-orm";

import { db } from "@/db";
import {
  accessDevices,
  attendanceLogs,
  employees,
  syncRuns,
  type SyncRunRow,
} from "@/db/schema";
import { classifyRawEvent, fetchAcsEvents, type DeviceConfig } from "@/lib/isapi";
import {
  CURRENT_BUCKET,
  devicesFromEnv,
  EMPLOYEE_SEEDS,
  simulateHistory,
  simulateLiveBatch,
  type EventType,
  type SimulatedLog,
} from "@/lib/seed-data";

const DAY_MS = 86_400_000;

interface GlobalWithSync {
  __syncRunning?: boolean;
  __syncCron?: NodeJS.Timeout;
  __syncBoot?: NodeJS.Timeout;
}
const glob = globalThis as typeof globalThis & GlobalWithSync;

export const isSyncRunning = () => Boolean(glob.__syncRunning);

export interface DeviceSyncReport {
  device: string;
  mode: "isapi" | "simulado";
  fetched: number;
  inserted: number;
  error?: string;
}

export interface SyncSummary {
  run: SyncRunRow;
  perDevice: DeviceSyncReport[];
}

export async function ensureBaseData(): Promise<void> {
  const [empCount, devCount] = await Promise.all([
    db.select({ id: employees.id }).from(employees).limit(1),
    db.select({ id: accessDevices.id }).from(accessDevices).limit(1),
  ]);
  if (empCount.length === 0) {
    await db.insert(employees).values(
      EMPLOYEE_SEEDS.map((e) => ({
        legajo: e.legajo,
        firstName: e.firstName,
        lastName: e.lastName,
        department: e.department,
        scheduleIn: e.scheduleIn,
        scheduleOut: e.scheduleOut,
        toleranceMinutes: e.toleranceMinutes,
      })),
    );
  }
  if (devCount.length === 0) {
    await db.insert(accessDevices).values(devicesFromEnv());
  }
}

interface NewLog {
  employeeId: number;
  employeeNo: string;
  eventTime: Date;
  eventType: EventType;
  deviceId: number | null;
  sourceIp: string | null;
  sourcePort: number | null;
  rawEventId: string;
}

async function insertLogsDeduped(rows: NewLog[]): Promise<number> {
  if (rows.length === 0) return 0;
  let inserted = 0;
  for (let i = 0; i < rows.length; i += 200) {
    const chunk = rows.slice(i, i + 200);
    const result = await db
      .insert(attendanceLogs)
      .values(chunk)
      .onConflictDoNothing({
        target: [
          attendanceLogs.employeeId,
          attendanceLogs.eventTime,
          attendanceLogs.eventType,
        ],
      })
      .returning({ id: attendanceLogs.id });
    inserted += result.length;
  }
  return inserted;
}

function mapSimulated(
  rows: SimulatedLog[],
  empByNo: Map<string, number>,
  deviceByIdx: (slot: 1 | 2 | 3) => { id: number; ipAddress: string; port: number } | null,
): NewLog[] {
  const out: NewLog[] = [];
  for (const row of rows) {
    const employeeId = empByNo.get(row.employeeNo);
    if (!employeeId) continue;
    const device = deviceByIdx(row.slot);
    out.push({
      employeeId,
      employeeNo: row.employeeNo,
      eventTime: row.eventTime,
      eventType: row.eventType,
      deviceId: device?.id ?? null,
      sourceIp: device?.ipAddress ?? null,
      sourcePort: device?.port ?? null,
      rawEventId: row.rawEventId,
    });
  }
  return out;
}

/**
 * Ejecuta una sincronización completa: recorre access_devices, hace pull
 * ISAPI (o simulación determinista) y escribe marcaciones crudas deduplicadas.
 */
export async function runSync(
  trigger: "manual" | "cron",
): Promise<SyncSummary | null> {
  if (glob.__syncRunning) return null;
  glob.__syncRunning = true;
  const t0 = Date.now();

  const [run] = await db
    .insert(syncRuns)
    .values({ trigger, status: "running" })
    .returning();

  const perDevice: DeviceSyncReport[] = [];
  let fetched = 0;
  let inserted = 0;
  const errors: string[] = [];

  try {
    await ensureBaseData();

    const [deviceRows, employeeRows] = await Promise.all([
      db.select().from(accessDevices),
      db.select().from(employees),
    ]);
    const empByNo = new Map(employeeRows.map((e) => [e.legajo, e.id]));
    const deviceByIdx = (slot: 1 | 2 | 3) => deviceRows[slot - 1] ?? null;

    // Bootstrap de historial la primera vez (solo modo simulado).
    const [{ total }] = await db
      .select({ total: sqlCount() })
      .from(attendanceLogs);
    if (total === 0) {
      const history = mapSimulated(simulateHistory(), empByNo, deviceByIdx);
      const ins = await insertLogsDeduped(history);
      fetched += history.length;
      inserted += ins;
      perDevice.push({
        device: "historial demo (35 d)",
        mode: "simulado",
        fetched: history.length,
        inserted: ins,
      });
    }

    for (const device of deviceRows) {
      const report: DeviceSyncReport = {
        device: device.name,
        mode: device.simulate ? "simulado" : "isapi",
        fetched: 0,
        inserted: 0,
      };
      try {
        let rows: NewLog[] = [];
        if (device.simulate) {
          const live = simulateLiveBatch(CURRENT_BUCKET()).filter((row) => {
            const slotDevice = deviceByIdx(row.slot);
            return slotDevice?.id === device.id;
          });
          rows = mapSimulated(live, empByNo, deviceByIdx);
        } else {
          const since = device.lastSyncAt ?? new Date(Date.now() - 7 * DAY_MS);
          const config: DeviceConfig = device;
          const raw = await fetchAcsEvents(config, since);
          const seen = new Map<string, Set<string>>();
          const sorted = [...raw].sort(
            (a, b) => a.time.getTime() - b.time.getTime(),
          );
          for (const ev of sorted) {
            const employeeId = empByNo.get(ev.employeeNo);
            if (!employeeId) continue;
            const dayKey = ev.time.toISOString().slice(0, 10);
            const set = seen.get(dayKey + ev.employeeNo) ?? new Set<string>();
            const type = classifyRawEvent(ev.time, device.deviceType, set);
            set.add(type);
            seen.set(dayKey + ev.employeeNo, set);
            rows.push({
              employeeId,
              employeeNo: ev.employeeNo,
              eventTime: ev.time,
              eventType: type,
              deviceId: device.id,
              sourceIp: device.ipAddress,
              sourcePort: device.port,
              rawEventId: ev.eventId,
            });
          }
        }
        report.fetched = rows.length;
        report.inserted = await insertLogsDeduped(rows);
        fetched += report.fetched;
        inserted += report.inserted;
        await db
          .update(accessDevices)
          .set({ lastSyncAt: new Date() })
          .where(eq(accessDevices.id, device.id));
      } catch (err) {
        report.error = err instanceof Error ? err.message : "error desconocido";
        errors.push(`${device.name}: ${report.error}`);
      }
      perDevice.push(report);
    }

    const status =
      errors.length > 0 && errors.length === deviceRows.length
        ? "failed"
        : errors.length > 0
          ? "partial"
          : "success";

    const [done] = await db
      .update(syncRuns)
      .set({
        status,
        recordsFetched: fetched,
        recordsInserted: inserted,
        durationMs: Date.now() - t0,
        finishedAt: new Date(),
        errorLog: errors.length > 0 ? errors.join(" | ").slice(0, 2000) : null,
      })
      .where(eq(syncRuns.id, run.id))
      .returning();

    return { run: done, perDevice };
  } catch (err) {
    const message = err instanceof Error ? err.message : "error desconocido";
    const [done] = await db
      .update(syncRuns)
      .set({
        status: "failed",
        finishedAt: new Date(),
        durationMs: Date.now() - t0,
        errorLog: message.slice(0, 2000),
      })
      .where(eq(syncRuns.id, run.id))
      .returning();
    return { run: done, perDevice };
  } finally {
    glob.__syncRunning = false;
  }
}

// pequeño helper para evitar import circular de sql en tipos
import { sql } from "drizzle-orm";
function sqlCount() {
  return sql<number>`count(*)::int`;
}

/**
 * Cron interno: ejecuta el pull ISAPI cada SYNC_INTERVAL_MINUTES
 * (default 10 min) mientras el servidor Next esté vivo.
 */
export function startSyncCron(): void {
  if (glob.__syncCron) return;
  const minutes = Math.max(1, Number(process.env.SYNC_INTERVAL_MINUTES ?? 10));
  glob.__syncCron = setInterval(() => {
    void runSync("cron").catch(() => undefined);
  }, minutes * 60_000);
  glob.__syncCron.unref?.();
  glob.__syncBoot = setTimeout(() => {
    void runSync("cron").catch(() => undefined);
  }, 5000);
  glob.__syncBoot.unref?.();
  console.log(`[sync] cron ISAPI programado cada ${minutes} min`);
}

export async function recentRuns(limit = 8): Promise<SyncRunRow[]> {
  return db.select().from(syncRuns).orderBy(desc(syncRuns.runAt)).limit(limit);
}
