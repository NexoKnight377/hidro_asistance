import { NextResponse } from "next/server";

import {
  isSyncRunning,
  recentRuns,
  runSync,
  type SyncSummary,
} from "@/lib/sync-service";

export const dynamic = "force-dynamic";

/** POST /api/sync — dispara manualmente la sincronización ISAPI. */
export async function POST() {
  const summary: SyncSummary | null = await runSync("manual").catch((err) => {
    throw err;
  });
  if (!summary) {
    return NextResponse.json(
      { running: true, message: "Ya hay una sincronización en curso" },
      { status: 202 },
    );
  }
  return NextResponse.json({
    running: false,
    run: summary.run,
    perDevice: summary.perDevice,
  });
}

/** GET /api/sync — bitácora reciente + estado del job. */
export async function GET() {
  const [runs] = await Promise.all([recentRuns(8)]);
  return NextResponse.json({
    running: isSyncRunning(),
    intervalMinutes: Math.max(
      1,
      Number(process.env.SYNC_INTERVAL_MINUTES ?? 10),
    ),
    runs,
  });
}
