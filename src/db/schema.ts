import {
  boolean,
  index,
  integer,
  pgTable,
  serial,
  text,
  timestamp,
  uniqueIndex,
  varchar,
} from "drizzle-orm/pg-core";

/**
 * Personal con horario contractual. Ningún contador calculado vive aquí:
 * todo KPI se deriva al vuelo desde attendance_logs.
 */
export const employees = pgTable("employees", {
  id: serial("id").primaryKey(),
  legajo: varchar("legajo", { length: 20 }).notNull().unique(),
  firstName: varchar("first_name", { length: 60 }).notNull(),
  lastName: varchar("last_name", { length: 60 }).notNull(),
  department: varchar("department", { length: 60 }).notNull(),
  photoUrl: varchar("photo_url", { length: 255 }),
  scheduleIn: varchar("schedule_in", { length: 5 }).notNull().default("09:00"),
  scheduleOut: varchar("schedule_out", { length: 5 }).notNull().default("18:00"),
  toleranceMinutes: integer("tolerance_minutes").notNull().default(10),
  active: boolean("active").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

/**
 * Tabla de configuración de terminales biométricos: IP, puerto y
 * credenciales HTTP Digest centralizadas (sembradas desde .env).
 */
export const accessDevices = pgTable("access_devices", {
  id: serial("id").primaryKey(),
  name: varchar("name", { length: 80 }).notNull(),
  ipAddress: varchar("ip_address", { length: 45 }).notNull(),
  port: integer("port").notNull().default(80),
  username: varchar("username", { length: 60 }).notNull(),
  password: varchar("password", { length: 120 }).notNull(),
  location: varchar("location", { length: 80 }).notNull(),
  deviceType: varchar("device_type", { length: 10 }).notNull().default("mixto"),
  simulate: boolean("simulate").notNull().default(true),
  lastSyncAt: timestamp("last_sync_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

/**
 * Marcaciones CRUDAS del lector. Sin status ni offsets almacenados:
 * el estado (OK / Tarde / Temprano / Sin checkout) se calcula al vuelo
 * contra el horario del empleado. Unicidad doble para que re-sincronizar
 * nunca duplique registros.
 */
export const attendanceLogs = pgTable(
  "attendance_logs",
  {
    id: serial("id").primaryKey(),
    employeeId: integer("employee_id")
      .notNull()
      .references(() => employees.id, { onDelete: "cascade" }),
    employeeNo: varchar("employee_no", { length: 20 }).notNull(),
    eventTime: timestamp("event_time", { withTimezone: true }).notNull(),
    eventType: varchar("event_type", { length: 12 }).notNull(),
    deviceId: integer("device_id").references(() => accessDevices.id, {
      onDelete: "set null",
    }),
    sourceIp: varchar("source_ip", { length: 45 }),
    sourcePort: integer("source_port"),
    rawEventId: varchar("raw_event_id", { length: 80 }),
  },
  (table) => [
    index("logs_employee_idx").on(table.employeeId),
    index("logs_event_time_idx").on(table.eventTime),
    uniqueIndex("logs_employee_time_type_uq").on(
      table.employeeId,
      table.eventTime,
      table.eventType,
    ),
    uniqueIndex("logs_device_raw_uq").on(table.deviceId, table.rawEventId),
  ],
);

/** Bitácora de ejecuciones del job ISAPI (manual o cron). */
export const syncRuns = pgTable("sync_runs", {
  id: serial("id").primaryKey(),
  runAt: timestamp("run_at", { withTimezone: true }).notNull().defaultNow(),
  trigger: varchar("trigger", { length: 10 }).notNull().default("manual"),
  status: varchar("status", { length: 10 }).notNull().default("running"),
  recordsFetched: integer("records_fetched").notNull().default(0),
  recordsInserted: integer("records_inserted").notNull().default(0),
  durationMs: integer("duration_ms"),
  errorLog: text("error_log"),
  finishedAt: timestamp("finished_at", { withTimezone: true }),
});

export type EmployeeRow = typeof employees.$inferSelect;
export type DeviceRow = typeof accessDevices.$inferSelect;
export type AttendanceLogRow = typeof attendanceLogs.$inferSelect;
export type SyncRunRow = typeof syncRuns.$inferSelect;
