import { NextResponse } from "next/server";
import { and, eq, gte, lt } from "drizzle-orm";

import { db } from "@/db";
import { accessDevices, attendanceLogs, employees, syncRuns } from "@/db/schema";
import {
  addDays,
  classifyDay,
  dateKey,
  flagsOf,
  parseKey,
  rangeForPeriod,
  workdayKeys,
  type DayCell,
  type Period,
} from "@/lib/attendance";
import { EVENT_LABEL, type EventType } from "@/lib/seed-data";
import { desc } from "drizzle-orm";

export const dynamic = "force-dynamic";

export interface EmployeeSummary {
  id: number;
  legajo: string;
  firstName: string;
  lastName: string;
  department: string;
  photoUrl: string | null;
  scheduleIn: string;
  scheduleOut: string;
  present: number;
  late: number;
  early: number;
  absent: number;
  workedMin: number;
  rate: number;
  cells: DayCell[];
}

export interface DayEventDetail {
  time: string;
  type: EventType;
  label: string;
  device: string | null;
  source: string | null;
}

export interface StatsPayload {
  period: Period;
  date: string;
  rangeLabel: string;
  days: string[];
  todayKey: string;
  generatedAt: string;
  kpis: {
    asistencias: number;
    tardanzas: number;
    salidasTempranas: number;
    ausencias: number;
    expected: number;
    presentRate: number;
  };
  deltas: {
    asistencias: number | null;
    tardanzas: number | null;
    salidasTempranas: number | null;
    ausencias: number | null;
  };
  distribution: { key: string; label: string; value: number; color: string }[];
  daily: {
    date: string;
    ok: number;
    tarde: number;
    temprano: number;
    sinCheckout: number;
    ausente: number;
  }[];
  hourly: number[];
  employees: EmployeeSummary[];
  dayDetail: {
    employeeId: number;
    legajo: string;
    name: string;
    department: string;
    events: DayEventDetail[];
  }[];
  lastRun: {
    id: number;
    runAt: string;
    trigger: string;
    status: string;
    recordsInserted: number;
    durationMs: number | null;
  } | null;
}

function pctDelta(current: number, previous: number): number | null {
  if (previous === 0) return current === 0 ? null : 100;
  return ((current - previous) / previous) * 100;
}

export async function GET(req: Request) {
  const url = new URL(req.url);
  const periodParam = url.searchParams.get("period") ?? "week";
  const period: Period =
    periodParam === "day" || periodParam === "month" ? periodParam : "week";
  const dateParam = url.searchParams.get("date") ?? "";
  const now = new Date();
  const todayKey = dateKey(now);
  const date = /^\d{4}-\d{2}-\d{2}$/.test(dateParam) ? dateParam : todayKey;

  const { start, end } = rangeForPeriod(period, date);
  const days = workdayKeys(start, end);
  const pastDays = days.filter((k) => k <= todayKey);

  const spanDays = Math.round((end.getTime() - start.getTime()) / 86_400_000) + 1;
  const prevStart = addDays(start, -spanDays);
  const prevEnd = addDays(end, -spanDays);
  const prevDays = workdayKeys(prevStart, prevEnd);

  const [employeeRows, logRows, prevLogRows, lastRunRow] = await Promise.all([
    db.select().from(employees).orderBy(employees.legajo),
    db
      .select({
        id: attendanceLogs.id,
        employeeId: attendanceLogs.employeeId,
        employeeNo: attendanceLogs.employeeNo,
        eventTime: attendanceLogs.eventTime,
        eventType: attendanceLogs.eventType,
        sourceIp: attendanceLogs.sourceIp,
        sourcePort: attendanceLogs.sourcePort,
        deviceName: accessDevices.name,
      })
      .from(attendanceLogs)
      .leftJoin(accessDevices, eq(attendanceLogs.deviceId, accessDevices.id))
      .where(and(gte(attendanceLogs.eventTime, start), lt(attendanceLogs.eventTime, addDays(end, 1))))
      .orderBy(attendanceLogs.eventTime),
    db
      .select()
      .from(attendanceLogs)
      .where(and(gte(attendanceLogs.eventTime, prevStart), lt(attendanceLogs.eventTime, addDays(prevEnd, 1)))),
    db.select().from(syncRuns).orderBy(desc(syncRuns.runAt)).limit(1),
  ]);

  const active = employeeRows.filter((e) => e.active);

  type LogLite = { eventTime: Date; eventType: string };
  const logsByEmpDay = new Map<string, LogLite[]>();
  for (const log of logRows) {
    const key = `${log.employeeId}|${dateKey(log.eventTime)}`;
    const arr = logsByEmpDay.get(key);
    if (arr) arr.push(log);
    else logsByEmpDay.set(key, [log]);
  }
  const prevByEmpDay = new Map<string, LogLite[]>();
  for (const log of prevLogRows) {
    const key = `${log.employeeId}|${dateKey(log.eventTime)}`;
    const arr = prevByEmpDay.get(key);
    if (arr) arr.push(log);
    else prevByEmpDay.set(key, [log]);
  }

  const buildKpis = (dayList: string[], map: Map<string, LogLite[]>) => {
    let asistencias = 0;
    let tardanzas = 0;
    let salidasTempranas = 0;
    let ausencias = 0;
    for (const emp of active) {
      for (const key of dayList.filter((k) => k <= todayKey)) {
        const cell = classifyDay(
          emp,
          map.get(`${emp.id}|${key}`) ?? [],
          key,
          todayKey,
          now,
        );
        const flags = flagsOf(cell);
        if (flags.present) asistencias += 1;
        if (flags.late) tardanzas += 1;
        if (flags.early) salidasTempranas += 1;
        if (flags.absent) ausencias += 1;
      }
    }
    return { asistencias, tardanzas, salidasTempranas, ausencias };
  };

  const kpis = buildKpis(pastDays, logsByEmpDay);
  const prevKpis = buildKpis(prevDays, prevByEmpDay);
  const expected = active.length * pastDays.length;

  const employeesSummary: EmployeeSummary[] = active.map((emp) => {
    const cells = days.map((key) =>
      classifyDay(emp, logsByEmpDay.get(`${emp.id}|${key}`) ?? [], key, todayKey, now),
    );
    let present = 0;
    let late = 0;
    let early = 0;
    let absent = 0;
    let workedMin = 0;
    for (const cell of cells) {
      if (cell.date > todayKey) continue;
      const flags = flagsOf(cell);
      if (flags.present) present += 1;
      if (flags.late) late += 1;
      if (flags.early) early += 1;
      if (flags.absent) absent += 1;
      workedMin += cell.workedMin;
    }
    const expectedEmp = pastDays.length;
    return {
      id: emp.id,
      legajo: emp.legajo,
      firstName: emp.firstName,
      lastName: emp.lastName,
      department: emp.department,
      photoUrl: emp.photoUrl,
      scheduleIn: emp.scheduleIn,
      scheduleOut: emp.scheduleOut,
      present,
      late,
      early,
      absent,
      workedMin,
      rate: expectedEmp > 0 ? present / expectedEmp : 0,
      cells,
    };
  });

  const distributionBuckets: Record<string, number> = {
    ok: 0,
    tarde: 0,
    temprano: 0,
    sin_checkout: 0,
    ausente: 0,
    en_curso: 0,
  };
  const daily = pastDays.map((key) => {
    const row = { date: key, ok: 0, tarde: 0, temprano: 0, sinCheckout: 0, ausente: 0 };
    for (const emp of active) {
      const cell = classifyDay(emp, logsByEmpDay.get(`${emp.id}|${key}`) ?? [], key, todayKey, now);
      if (cell.status === "ok" || cell.status === "en_curso") {
        row.ok += 1;
        distributionBuckets[cell.status] += 1;
      } else if (cell.status === "tarde") {
        row.tarde += 1;
        distributionBuckets.tarde += 1;
      } else if (cell.status === "temprano") {
        row.temprano += 1;
        distributionBuckets.temprano += 1;
      } else if (cell.status === "sin_checkout") {
        row.sinCheckout += 1;
        distributionBuckets.sin_checkout += 1;
      } else if (cell.status === "ausente") {
        row.ausente += 1;
        distributionBuckets.ausente += 1;
      }
    }
    return row;
  });

  const hourly = Array.from({ length: 24 }, () => 0);
  if (period === "day") {
    for (const log of logRows) {
      const hour = log.eventTime.getUTCHours();
      hourly[hour] += 1;
    }
  }

  const dayDetail =
    period === "day"
      ? active.map((emp) => {
          const logs = logRows.filter(
            (log) =>
              log.employeeId === emp.id && dateKey(log.eventTime) === date,
          );
          return {
            employeeId: emp.id,
            legajo: emp.legajo,
            name: `${emp.firstName} ${emp.lastName}`,
            department: emp.department,
            events: logs
              .sort((a, b) => a.eventTime.getTime() - b.eventTime.getTime())
              .map((log) => ({
                time: log.eventTime.toISOString().slice(11, 16),
                type: log.eventType as EventType,
                label: EVENT_LABEL[log.eventType as EventType] ?? log.eventType,
                device: log.deviceName,
                source: log.sourceIp ? `${log.sourceIp}:${log.sourcePort ?? 80}` : null,
              })),
          };
        })
      : [];

  const rangeLabel =
    period === "day"
      ? date
      : period === "week"
        ? `${dateKey(start)} → ${dateKey(end)}`
        : date.slice(0, 7);

  const payload: StatsPayload = {
    period,
    date,
    rangeLabel,
    days,
    todayKey,
    generatedAt: now.toISOString(),
    kpis: {
      ...kpis,
      expected,
      presentRate: expected > 0 ? kpis.asistencias / expected : 0,
    },
    deltas: {
      asistencias: pctDelta(kpis.asistencias, prevKpis.asistencias),
      tardanzas: pctDelta(kpis.tardanzas, prevKpis.tardanzas),
      salidasTempranas: pctDelta(kpis.salidasTempranas, prevKpis.salidasTempranas),
      ausencias: pctDelta(kpis.ausencias, prevKpis.ausencias),
    },
    distribution: [
      { key: "ok", label: "OK", value: distributionBuckets.ok, color: "#35c0a6" },
      { key: "tarde", label: "Tarde", value: distributionBuckets.tarde, color: "#f2a93b" },
      { key: "temprano", label: "Salida temprana", value: distributionBuckets.temprano, color: "#6fb3e8" },
      { key: "sin_checkout", label: "Sin checkout", value: distributionBuckets.sin_checkout, color: "#ff6b4a" },
      { key: "ausente", label: "Ausente", value: distributionBuckets.ausente, color: "#d1493f" },
      { key: "en_curso", label: "En curso", value: distributionBuckets.en_curso, color: "#7fd8c6" },
    ].filter((d) => d.value > 0),
    daily,
    hourly,
    employees: employeesSummary,
    dayDetail,
    lastRun: lastRunRow[0]
      ? {
          id: lastRunRow[0].id,
          runAt: lastRunRow[0].runAt.toISOString(),
          trigger: lastRunRow[0].trigger,
          status: lastRunRow[0].status,
          recordsInserted: lastRunRow[0].recordsInserted,
          durationMs: lastRunRow[0].durationMs,
        }
      : null,
  };

  return NextResponse.json(payload);
}
