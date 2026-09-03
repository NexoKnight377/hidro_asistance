/**
 * Motor de métricas: todo estado (OK / Tarde / Temprano / Sin checkout /
 * Ausente) se CALCULA al vuelo desde las marcaciones crudas contra el
 * horario contractual. Nada de esto se persiste.
 */

export type DayStatus =
  | "ok"
  | "tarde"
  | "temprano"
  | "sin_checkout"
  | "ausente"
  | "en_curso"
  | "pendiente";

export const STATUS_META: Record<
  DayStatus,
  { label: string; color: string; short: string }
> = {
  ok: { label: "OK", color: "#35c0a6", short: "OK" },
  tarde: { label: "Tarde", color: "#f2a93b", short: "T" },
  temprano: { label: "Salida temprana", color: "#6fb3e8", short: "ST" },
  sin_checkout: { label: "Sin checkout", color: "#ff6b4a", short: "SC" },
  ausente: { label: "Ausente", color: "#d1493f", short: "A" },
  en_curso: { label: "En curso", color: "#7fd8c6", short: "EC" },
  pendiente: { label: "Pendiente", color: "#5d7674", short: "·" },
};

export interface DayCell {
  date: string;
  status: DayStatus;
  in: string | null;
  out: string | null;
  lateMin: number;
  earlyMin: number;
  workedMin: number;
}

export interface ScheduleLike {
  scheduleIn: string;
  scheduleOut: string;
  toleranceMinutes: number;
}

export interface LogLike {
  eventTime: Date;
  eventType: string;
}

export const DAY_MS = 86_400_000;

export const hhmmToMin = (v: string): number => {
  const [h, m] = v.split(":").map(Number);
  return (h || 0) * 60 + (m || 0);
};

export const fmtTime = (d: Date): string => d.toISOString().slice(11, 16);

export const dateKey = (d: Date): string => d.toISOString().slice(0, 10);

export const parseKey = (key: string): Date => new Date(`${key}T00:00:00Z`);

export function addDays(d: Date, n: number): Date {
  const x = new Date(d);
  x.setUTCDate(x.getUTCDate() + n);
  return x;
}

/** Semana laboral: Lunes a Sábado. */
export const isWorkday = (d: Date): boolean => {
  const dow = d.getUTCDay();
  return dow >= 1 && dow <= 6;
};

export function workdayKeys(start: Date, end: Date): string[] {
  const out: string[] = [];
  for (let d = new Date(start); d <= end; d = addDays(d, 1)) {
    if (isWorkday(d)) out.push(dateKey(d));
  }
  return out;
}

export type Period = "day" | "week" | "month";

export function rangeForPeriod(
  period: Period,
  key: string,
): { start: Date; end: Date } {
  const base = parseKey(key);
  if (period === "day") return { start: base, end: base };
  if (period === "week") {
    const dow = (base.getUTCDay() + 6) % 7; // lunes = 0
    const start = addDays(base, -dow);
    return { start, end: addDays(start, 5) }; // Lun-Sáb
  }
  const start = new Date(Date.UTC(base.getUTCFullYear(), base.getUTCMonth(), 1));
  const end = new Date(Date.UTC(base.getUTCFullYear(), base.getUTCMonth() + 1, 0));
  return { start, end };
}

export function shiftKey(period: Period, key: string, direction: 1 | -1): string {
  const base = parseKey(key);
  if (period === "day") return dateKey(addDays(base, direction));
  if (period === "week") return dateKey(addDays(base, 7 * direction));
  const moved = new Date(
    Date.UTC(base.getUTCFullYear(), base.getUTCMonth() + direction, 1),
  );
  return dateKey(moved);
}

const EMPTY_CELL = (date: string, status: DayStatus): DayCell => ({
  date,
  status,
  in: null,
  out: null,
  lateMin: 0,
  earlyMin: 0,
  workedMin: 0,
});

/** Clasifica un día completo de un empleado a partir de sus logs crudos. */
export function classifyDay(
  schedule: ScheduleLike,
  logs: LogLike[],
  key: string,
  todayKey: string,
  now: Date,
): DayCell {
  const sorted = [...logs].sort(
    (a, b) => a.eventTime.getTime() - b.eventTime.getTime(),
  );
  const checkIn = sorted.find((l) => l.eventType === "check_in");
  const checkOut = [...sorted].reverse().find((l) => l.eventType === "check_out");
  const lunchOut = sorted.find((l) => l.eventType === "lunch_out");
  const lunchIn = sorted.find(
    (l) => l.eventType === "lunch_in" && (!lunchOut || l.eventTime >= lunchOut.eventTime),
  );

  const schedIn = hhmmToMin(schedule.scheduleIn);
  const schedOut = hhmmToMin(schedule.scheduleOut);
  const dayStart = parseKey(key);

  if (!checkIn) {
    if (key > todayKey) return EMPTY_CELL(key, "pendiente");
    if (key === todayKey) {
      const nowMin = (now.getTime() - dayStart.getTime()) / 60_000;
      if (nowMin < schedIn + schedule.toleranceMinutes)
        return EMPTY_CELL(key, "pendiente");
    }
    return EMPTY_CELL(key, "ausente");
  }

  const inMin = (checkIn.eventTime.getTime() - dayStart.getTime()) / 60_000;
  const lateMin = Math.max(0, Math.round(inMin - schedIn - schedule.toleranceMinutes));

  let earlyMin = 0;
  let workedMin = 0;
  if (checkOut) {
    const outMin = (checkOut.eventTime.getTime() - dayStart.getTime()) / 60_000;
    earlyMin = Math.max(0, Math.round(schedOut - schedule.toleranceMinutes - outMin));
    const lunchMin =
      lunchOut && lunchIn
        ? Math.max(0, (lunchIn.eventTime.getTime() - lunchOut.eventTime.getTime()) / 60_000)
        : 0;
    workedMin = Math.max(0, Math.round(outMin - inMin - lunchMin));
  }

  let status: DayStatus;
  if (!checkOut) status = key === todayKey ? "en_curso" : "sin_checkout";
  else if (lateMin > 0) status = "tarde";
  else if (earlyMin > 0) status = "temprano";
  else status = "ok";

  return {
    date: key,
    status,
    in: fmtTime(checkIn.eventTime),
    out: checkOut ? fmtTime(checkOut.eventTime) : null,
    lateMin,
    earlyMin,
    workedMin,
  };
}

export interface DayFlags {
  present: boolean;
  late: boolean;
  early: boolean;
  absent: boolean;
}

export function flagsOf(cell: DayCell): DayFlags {
  return {
    present: cell.in !== null,
    late: cell.in !== null && cell.lateMin > 0,
    early: cell.out !== null && cell.earlyMin > 0,
    absent: cell.status === "ausente",
  };
}

export const fmtDuration = (min: number): string =>
  `${Math.floor(min / 60)}h ${String(Math.round(min % 60)).padStart(2, "0")}m`;

export function relTime(iso: string | null, tick: number): string {
  if (!iso) return "nunca";
  const diff = Math.max(0, tick - new Date(iso).getTime());
  const sec = Math.floor(diff / 1000);
  if (sec < 10) return "hace unos s";
  if (sec < 60) return `hace ${sec} s`;
  const min = Math.floor(sec / 60);
  if (min < 60) return `hace ${min} min`;
  const hours = Math.floor(min / 60);
  if (hours < 24) return `hace ${hours} h`;
  return `hace ${Math.floor(hours / 24)} d`;
}
