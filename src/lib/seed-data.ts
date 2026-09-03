/**
 * Catálogos base + simulador determinista de marcaciones.
 *
 * En producción real, las marcaciones llegan desde el cliente ISAPI
 * (src/lib/isapi.ts). Cuando un terminal está marcado como `simulate`
 * (o no hay hardware reachable), este módulo genera eventos crudos con
 * la misma forma que devolvería el lector, para que toda la capa de
 * métricas se ejercite igual.
 */

export const EVENT_TYPES = [
  "check_in",
  "check_out",
  "lunch_out",
  "lunch_in",
] as const;

export type EventType = (typeof EVENT_TYPES)[number];

export const EVENT_LABEL: Record<EventType, string> = {
  check_in: "Entrada",
  check_out: "Salida",
  lunch_out: "Salida a almuerzo",
  lunch_in: "Entrada de almuerzo",
};

export interface EmployeeSeed {
  legajo: string;
  firstName: string;
  lastName: string;
  department: string;
  scheduleIn: string;
  scheduleOut: string;
  toleranceMinutes: number;
}

export const EMPLOYEE_SEEDS: EmployeeSeed[] = [
  { legajo: "1001", firstName: "Valeria", lastName: "Ríos", department: "Operaciones", scheduleIn: "09:00", scheduleOut: "18:00", toleranceMinutes: 10 },
  { legajo: "1002", firstName: "Marco", lastName: "Aguirre", department: "Operaciones", scheduleIn: "09:00", scheduleOut: "18:00", toleranceMinutes: 10 },
  { legajo: "1003", firstName: "Sofía", lastName: "Delgado", department: "Ventas", scheduleIn: "08:30", scheduleOut: "17:30", toleranceMinutes: 8 },
  { legajo: "1004", firstName: "Iván", lastName: "Cabrera", department: "Ventas", scheduleIn: "09:00", scheduleOut: "18:00", toleranceMinutes: 10 },
  { legajo: "1005", firstName: "Lucía", lastName: "Ferrer", department: "Logística", scheduleIn: "07:00", scheduleOut: "16:00", toleranceMinutes: 15 },
  { legajo: "1006", firstName: "Diego", lastName: "Montalvo", department: "Logística", scheduleIn: "07:00", scheduleOut: "16:00", toleranceMinutes: 15 },
  { legajo: "1007", firstName: "Paula", lastName: "Sandoval", department: "Administración", scheduleIn: "08:00", scheduleOut: "17:00", toleranceMinutes: 10 },
  { legajo: "1008", firstName: "Rodrigo", lastName: "Bustos", department: "Administración", scheduleIn: "08:00", scheduleOut: "17:00", toleranceMinutes: 10 },
  { legajo: "1009", firstName: "Elena", lastName: "Villar", department: "Soporte", scheduleIn: "10:00", scheduleOut: "19:00", toleranceMinutes: 12 },
  { legajo: "1010", firstName: "Jorge", lastName: "Peralta", department: "Soporte", scheduleIn: "10:00", scheduleOut: "19:00", toleranceMinutes: 12 },
  { legajo: "1011", firstName: "Camila", lastName: "Ortega", department: "Ventas", scheduleIn: "09:30", scheduleOut: "18:30", toleranceMinutes: 10 },
  { legajo: "1012", firstName: "Andrés", lastName: "Guzmán", department: "Logística", scheduleIn: "07:30", scheduleOut: "16:30", toleranceMinutes: 15 },
];

export interface DeviceSeed {
  name: string;
  ipAddress: string;
  port: number;
  username: string;
  password: string;
  location: string;
  deviceType: "entrada" | "salida" | "mixto";
  simulate: boolean;
}

const FALLBACK_DEVICES: DeviceSeed[] = [
  {
    name: "DS-K1T671 · Acceso Principal",
    ipAddress: "192.168.1.10",
    port: 80,
    username: "admin",
    password: "hik digest secret",
    location: "Lobby Norte",
    deviceType: "entrada",
    simulate: true,
  },
  {
    name: "DS-K1T341 · Comedor",
    ipAddress: "192.168.1.11",
    port: 80,
    username: "admin",
    password: "hik digest secret",
    location: "Planta baja · comedor",
    deviceType: "mixto",
    simulate: true,
  },
  {
    name: "DS-K1T671 · Estacionamiento",
    ipAddress: "192.168.1.12",
    port: 80,
    username: "admin",
    password: "hik digest secret",
    location: "Salida poniente",
    deviceType: "salida",
    simulate: true,
  },
];

/**
 * Los terminales se declaran de forma centralizada en .env (HIK_DEVICES,
 * JSON array) y se reflejan en la tabla access_devices al primer arranque.
 */
export function devicesFromEnv(): DeviceSeed[] {
  const raw = process.env.HIK_DEVICES;
  if (!raw || !raw.trim()) return FALLBACK_DEVICES;
  try {
    const parsed = JSON.parse(raw) as Partial<DeviceSeed>[];
    if (!Array.isArray(parsed) || parsed.length === 0) return FALLBACK_DEVICES;
    return parsed.map((d, i) => ({
      name: String(d.name ?? `Terminal ${i + 1}`),
      ipAddress: String(d.ipAddress ?? "127.0.0.1"),
      port: Number(d.port ?? 80),
      username: String(d.username ?? process.env.HIK_DEFAULT_USER ?? "admin"),
      password: String(d.password ?? process.env.HIK_DEFAULT_PASS ?? ""),
      location: String(d.location ?? "Sin ubicación"),
      deviceType: (d.deviceType as DeviceSeed["deviceType"]) ?? "mixto",
      simulate:
        d.simulate !== undefined
          ? Boolean(d.simulate)
          : process.env.ISAPI_SIMULATE !== "false",
    }));
  } catch {
    return FALLBACK_DEVICES;
  }
}

/* ---------- PRNG determinista ---------- */

export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function hashStr(value: string): number {
  let h = 2166136261;
  for (let i = 0; i < value.length; i++) {
    h ^= value.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/* ---------- simulación de marcaciones crudas ---------- */

export interface SimulatedLog {
  employeeNo: string;
  eventType: EventType;
  eventTime: Date;
  /** 1 = terminal de entrada, 2 = comedor, 3 = salida */
  slot: 1 | 2 | 3;
  rawEventId: string;
}

const DAY_MS = 86_400_000;
const hhmmToMin = (v: string) => {
  const [h, m] = v.split(":").map(Number);
  return (h || 0) * 60 + (m || 0);
};

function atMinute(day: Date, minute: number, rand: () => number): Date {
  const d = new Date(day);
  d.setUTCHours(0, 0, 0, 0);
  return new Date(d.getTime() + minute * 60_000 + Math.floor(rand() * 55) * 1000);
}

/** Historial de días hábiles (Lun-Sáb) previos a hoy. */
export function simulateHistory(days = 35): SimulatedLog[] {
  const rows: SimulatedLog[] = [];
  const nowDate = new Date();
  const nowMin = nowDate.getUTCHours() * 60 + nowDate.getUTCMinutes();
  const today = new Date(nowDate);
  today.setUTCHours(0, 0, 0, 0);

  for (const emp of EMPLOYEE_SEEDS) {
    const rand = mulberry32(hashStr(emp.legajo) ^ 0x5eed);
    const schedIn = hhmmToMin(emp.scheduleIn);
    const schedOut = hhmmToMin(emp.scheduleOut);

    for (let back = days; back >= 0; back--) {
      const day = new Date(today.getTime() - back * DAY_MS);
      const dow = day.getUTCDay();
      if (dow === 0) continue; // domingo cerrado
      if (rand() < 0.07) continue; // ausencia

      const isToday = back === 0;
      const key = day.toISOString().slice(0, 10);
      const lateRoll = rand();
      const inDelta =
        lateRoll < 0.2
          ? emp.toleranceMinutes + 1 + Math.floor(rand() * 38)
          : -15 + Math.floor(rand() * (emp.toleranceMinutes + 15));
      const inMin = schedIn + inDelta;
      // hoy: si aún no llega su hora de entrada, el día queda pendiente
      if (isToday && inMin > nowMin) continue;
      rows.push({
        employeeNo: emp.legajo,
        eventType: "check_in",
        eventTime: atMinute(day, inMin, rand),
        slot: 1,
        rawEventId: `hist-${emp.legajo}-${key}-check_in`,
      });

      if (rand() < 0.78) {
        const lunchOut = 12 * 60 + 30 + Math.floor(rand() * 60);
        const lunchIn = lunchOut + 40 + Math.floor(rand() * 35);
        if (!isToday || lunchOut <= nowMin) {
          rows.push({
            employeeNo: emp.legajo,
            eventType: "lunch_out",
            eventTime: atMinute(day, lunchOut, rand),
            slot: 2,
            rawEventId: `hist-${emp.legajo}-${key}-lunch_out`,
          });
        }
        if (!isToday || lunchIn <= nowMin) {
          rows.push({
            employeeNo: emp.legajo,
            eventType: "lunch_in",
            eventTime: atMinute(day, lunchIn, rand),
            slot: 2,
            rawEventId: `hist-${emp.legajo}-${key}-lunch_in`,
          });
        }
      }

      const missingCheckout = !isToday && rand() < 0.05; // día sin checkout
      if (missingCheckout) continue;

      const earlyRoll = rand();
      const outDelta =
        earlyRoll < 0.15
          ? -(16 + Math.floor(rand() * 55))
          : -5 + Math.floor(rand() * 55);
      const outMin = schedOut + outDelta;
      // hoy: solo hay salida si ya pasó su hora (el resto queda "en curso")
      if (!isToday || outMin <= nowMin) {
        rows.push({
          employeeNo: emp.legajo,
          eventType: "check_out",
          eventTime: atMinute(day, outMin, rand),
          slot: 3,
          rawEventId: `hist-${emp.legajo}-${key}-check_out`,
        });
      }
    }
  }
  return rows.sort((a, b) => a.eventTime.getTime() - b.eventTime.getTime());
}

/**
 * Lote "en vivo": eventos anclados a buckets de 5 minutos para que
 * re-ejecutar el sync dentro del mismo bucket no duplique marcaciones.
 */
export function simulateLiveBatch(bucket: number): SimulatedLog[] {
  const rand = mulberry32(bucket);
  const bucketStart = bucket * 300_000;
  const now = new Date();
  const nowMin = now.getUTCHours() * 60 + now.getUTCMinutes();
  const rows: SimulatedLog[] = [];

  for (const emp of EMPLOYEE_SEEDS) {
    if (rand() > 0.22) continue;
    const schedIn = hhmmToMin(emp.scheduleIn);
    const schedOut = hhmmToMin(emp.scheduleOut);
    let type: EventType;
    if (nowMin < schedIn + 120) type = "check_in";
    else if (nowMin >= 12 * 60 && nowMin <= 14 * 60 + 30)
      type = rand() < 0.5 ? "lunch_out" : "lunch_in";
    else if (nowMin > schedOut - 90) type = "check_out";
    else type = rand() < 0.5 ? "lunch_out" : "lunch_in";

    const slot: 1 | 2 | 3 = type === "check_in" ? 1 : type === "check_out" ? 3 : 2;
    rows.push({
      employeeNo: emp.legajo,
      eventType: type,
      eventTime: new Date(bucketStart + Math.floor(rand() * 290) * 1000),
      slot,
      rawEventId: `live-${bucket}-${emp.legajo}-${type}`,
    });
  }
  return rows;
}

export const CURRENT_BUCKET = () => Math.floor(Date.now() / 300_000);
