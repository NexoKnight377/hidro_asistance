"use client";

import { useMemo, useState } from "react";
import {
  Coffee,
  LogIn,
  LogOut,
  Sandwich,
  Search,
  type LucideIcon,
} from "lucide-react";

import type {
  DayEventDetail,
  EmployeeSummary,
} from "@/app/api/dashboard/stats/route";
import {
  fmtDuration,
  parseKey,
  STATUS_META,
  type DayCell,
} from "@/lib/attendance";
import type { EventType } from "@/lib/seed-data";

const WEEKDAY = ["dom", "lun", "mar", "mié", "jue", "vie", "sáb"];
const AVATAR_COLORS = ["#f2a93b", "#35c0a6", "#6fb3e8", "#ff6b4a", "#b48ead", "#8aa3a0"];

export const EVENT_ICON: Record<EventType, LucideIcon> = {
  check_in: LogIn,
  check_out: LogOut,
  lunch_out: Coffee,
  lunch_in: Sandwich,
};

export function Avatar({
  name,
  legajo,
  photoUrl,
  size = 34,
}: {
  name: string;
  legajo: string;
  photoUrl?: string | null;
  size?: number;
}) {
  const initials = name
    .split(" ")
    .map((p) => p[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();
  const color =
    AVATAR_COLORS[
      Math.abs([...legajo].reduce((a, c) => a + c.charCodeAt(0), 0)) %
        AVATAR_COLORS.length
    ];
  if (photoUrl) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={photoUrl}
        alt={name}
        width={size}
        height={size}
        className="shrink-0 rounded-full object-cover"
        style={{ width: size, height: size }}
      />
    );
  }
  return (
    <span
      className="grid shrink-0 place-items-center rounded-full font-mono font-semibold"
      style={{
        width: size,
        height: size,
        backgroundColor: `${color}22`,
        color,
        fontSize: size * 0.36,
        border: `1px solid ${color}55`,
      }}
      aria-hidden="true"
    >
      {initials}
    </span>
  );
}

/* ---------------- tabla por personal ---------------- */

export function EmployeeTable({
  employees,
  expectedDays,
}: {
  employees: EmployeeSummary[];
  expectedDays: number;
}) {
  const [query, setQuery] = useState("");
  const [dept, setDept] = useState("all");

  const departments = useMemo(
    () => [...new Set(employees.map((e) => e.department))].sort(),
    [employees],
  );
  const filtered = employees.filter((e) => {
    const q = query.trim().toLowerCase();
    const matchQ =
      q === "" ||
      `${e.firstName} ${e.lastName}`.toLowerCase().includes(q) ||
      e.legajo.includes(q);
    const matchD = dept === "all" || e.department === dept;
    return matchQ && matchD;
  });

  return (
    <div>
      <div className="flex flex-wrap items-center gap-2">
        <label className="relative inline-flex items-center">
          <Search
            size={13}
            className="pointer-events-none absolute left-2.5 text-mist-500"
          />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Buscar por nombre o legajo…"
            className="h-8 w-56 rounded-lg border border-white/10 bg-white/[0.04] pl-8 pr-3 text-xs text-mist-200 placeholder:text-mist-600 focus:border-brand/50 focus:outline-none"
          />
        </label>
        <select
          value={dept}
          onChange={(e) => setDept(e.target.value)}
          className="h-8 rounded-lg border border-white/10 bg-ink-850 px-2 text-xs text-mist-300 focus:border-brand/50 focus:outline-none"
          aria-label="Filtrar por departamento"
        >
          <option value="all">Todos los departamentos</option>
          {departments.map((d) => (
            <option key={d} value={d}>
              {d}
            </option>
          ))}
        </select>
        <span className="ml-auto font-mono text-[10px] text-mist-600">
          {filtered.length} de {employees.length} personas · {expectedDays} día(s)
          hábil(es)
        </span>
      </div>

      <div className="mt-3 overflow-x-auto">
        <table className="w-full min-w-[720px] border-collapse text-xs">
          <thead>
            <tr className="border-b border-white/8 font-mono text-[10px] uppercase tracking-[0.12em] text-mist-500">
              <th className="px-2 py-2 text-left">Personal</th>
              <th className="px-2 py-2 text-left">Departamento</th>
              <th className="px-2 py-2 text-center" title="Días presentes">Pres.</th>
              <th className="px-2 py-2 text-center" title="Tardanzas">Tard.</th>
              <th className="px-2 py-2 text-center" title="Salidas tempranas">S.Temp.</th>
              <th className="px-2 py-2 text-center" title="Ausencias">Aus.</th>
              <th className="px-2 py-2 text-right">Horas trab.</th>
              <th className="px-2 py-2 text-left">Asistencia</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((emp) => (
              <tr
                key={emp.id}
                className="border-b border-white/5 transition-colors hover:bg-white/[0.03]"
              >
                <td className="px-2 py-2">
                  <div className="flex items-center gap-2.5">
                    <Avatar
                      name={`${emp.firstName} ${emp.lastName}`}
                      legajo={emp.legajo}
                      photoUrl={emp.photoUrl}
                    />
                    <div className="leading-tight">
                      <p className="font-medium text-mist-100">
                        {emp.firstName} {emp.lastName}
                      </p>
                      <p className="font-mono text-[10px] text-mist-600">
                        #{emp.legajo} · {emp.scheduleIn}–{emp.scheduleOut}
                      </p>
                    </div>
                  </div>
                </td>
                <td className="px-2 py-2 text-mist-400">{emp.department}</td>
                <td className="px-2 py-2 text-center font-mono text-mint">{emp.present}</td>
                <td className="px-2 py-2 text-center font-mono text-brand">{emp.late}</td>
                <td className="px-2 py-2 text-center font-mono text-lake">{emp.early}</td>
                <td className="px-2 py-2 text-center font-mono text-flame">{emp.absent}</td>
                <td className="px-2 py-2 text-right font-mono text-mist-300">
                  {fmtDuration(emp.workedMin)}
                </td>
                <td className="px-2 py-2">
                  <div className="flex items-center gap-2">
                    <div className="h-1.5 w-20 overflow-hidden rounded-full bg-white/8">
                      <div
                        className="h-full rounded-full bg-mint transition-[width] duration-700"
                        style={{ width: `${Math.round(emp.rate * 100)}%` }}
                      />
                    </div>
                    <span className="font-mono text-[10px] text-mist-400">
                      {Math.round(emp.rate * 100)}%
                    </span>
                  </div>
                </td>
              </tr>
            ))}
            {filtered.length === 0 && (
              <tr>
                <td colSpan={8} className="px-2 py-6 text-center text-mist-500">
                  Sin resultados para el filtro actual.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

/* ---------------- grilla día a día ---------------- */

function GridCell({ cell, compact }: { cell: DayCell; compact: boolean }) {
  const meta = STATUS_META[cell.status];
  const title = [
    cell.date,
    meta.label,
    cell.in ? `entrada ${cell.in}` : null,
    cell.out ? `salida ${cell.out}` : null,
    cell.lateMin > 0 ? `+${cell.lateMin} min tarde` : null,
    cell.earlyMin > 0 ? `-${cell.earlyMin} min antes` : null,
  ]
    .filter(Boolean)
    .join(" · ");

  if (compact) {
    return (
      <td className="px-1 py-1.5 text-center" title={title}>
        <span
          className="inline-block h-2.5 w-2.5 rounded-full transition-transform hover:scale-125"
          style={{
            backgroundColor:
              cell.status === "pendiente" ? "rgba(93,118,116,0.35)" : meta.color,
          }}
        />
      </td>
    );
  }
  return (
    <td className="px-1.5 py-1.5" title={title}>
      <div
        className="rounded-md border px-2 py-1 text-center font-mono text-[10px] leading-snug transition-transform hover:-translate-y-0.5"
        style={{
          borderColor: `${meta.color}55`,
          backgroundColor:
            cell.status === "pendiente" ? "rgba(93,118,116,0.10)" : `${meta.color}14`,
          color: cell.status === "pendiente" ? "#5d7674" : meta.color,
        }}
      >
        <span className="block">{cell.in ?? "--:--"}</span>
        <span className="block opacity-75">{cell.out ?? "——"}</span>
      </div>
    </td>
  );
}

export function GridLegend() {
  return (
    <div className="flex flex-wrap items-center gap-2.5 font-mono text-[10px] text-mist-400">
      {(
        ["ok", "tarde", "temprano", "sin_checkout", "ausente", "pendiente"] as const
      ).map((key) => (
        <span key={key} className="inline-flex items-center gap-1.5">
          <span
            className="h-2.5 w-2.5 rounded-sm"
            style={{ backgroundColor: STATUS_META[key].color }}
          />
          {STATUS_META[key].label}
        </span>
      ))}
    </div>
  );
}

export function AttendanceGrid({
  employees,
  days,
  todayKey,
  compact,
}: {
  employees: EmployeeSummary[];
  days: string[];
  todayKey: string;
  compact: boolean;
}) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full border-collapse text-xs">
        <thead>
          <tr className="border-b border-white/8 font-mono text-[10px] uppercase tracking-[0.1em] text-mist-500">
            <th className="sticky left-0 z-10 bg-ink-900 px-2 py-2 text-left">
              Personal
            </th>
            {days.map((key) => {
              const d = parseKey(key);
              const isToday = key === todayKey;
              return (
                <th
                  key={key}
                  className={`px-1.5 py-2 text-center ${isToday ? "text-brand" : ""}`}
                >
                  <span className="block">{WEEKDAY[d.getUTCDay()]}</span>
                  <span className="block text-[9px] opacity-80">
                    {key.slice(8, 10)}/{key.slice(5, 7)}
                  </span>
                </th>
              );
            })}
          </tr>
        </thead>
        <tbody>
          {employees.map((emp) => (
            <tr
              key={emp.id}
              className="border-b border-white/5 transition-colors hover:bg-white/[0.03]"
            >
              <td className="sticky left-0 z-10 bg-ink-900 px-2 py-1.5">
                <div className="flex items-center gap-2">
                  <Avatar
                    name={`${emp.firstName} ${emp.lastName}`}
                    legajo={emp.legajo}
                    photoUrl={emp.photoUrl}
                    size={26}
                  />
                  <div className="leading-tight">
                    <p className="whitespace-nowrap text-[11px] font-medium text-mist-200">
                      {emp.firstName} {emp.lastName}
                    </p>
                    <p className="font-mono text-[9px] text-mist-600">#{emp.legajo}</p>
                  </div>
                </div>
              </td>
              {emp.cells.map((cell) => (
                <GridCell key={cell.date} cell={cell} compact={compact} />
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/* ---------------- detalle del día ---------------- */

export interface DayDetailRow {
  employeeId: number;
  legajo: string;
  name: string;
  department: string;
  events: DayEventDetail[];
}

export function DayDetail({ detail }: { detail: DayDetailRow[] }) {
  return (
    <ul className="grid gap-3 md:grid-cols-2">
      {detail.map((emp) => (
        <li
          key={emp.employeeId}
          className="rounded-lg border border-white/6 bg-white/[0.03] p-3 transition-colors hover:border-white/12"
        >
          <div className="flex items-center gap-2.5">
            <Avatar name={emp.name} legajo={emp.legajo} size={28} />
            <div className="leading-tight">
              <p className="text-xs font-medium text-mist-100">{emp.name}</p>
              <p className="font-mono text-[10px] text-mist-600">
                #{emp.legajo} · {emp.department}
              </p>
            </div>
            <span className="ml-auto font-mono text-[10px] text-mist-500">
              {emp.events.length} marcaciones
            </span>
          </div>
          <div className="mt-2.5 flex flex-wrap gap-1.5">
            {emp.events.length === 0 && (
              <span className="rounded-md border border-flame/40 bg-flame/10 px-2 py-1 font-mono text-[10px] text-flame">
                Sin marcaciones el día
              </span>
            )}
            {emp.events.map((ev, i) => {
              const Icon = EVENT_ICON[ev.type];
              return (
                <span
                  key={`${ev.time}-${i}`}
                  title={`${ev.label}${ev.device ? ` · ${ev.device}` : ""}${ev.source ? ` · ${ev.source}` : ""}`}
                  className="inline-flex items-center gap-1.5 rounded-md border border-white/10 bg-white/[0.04] px-2 py-1 font-mono text-[10px] text-mist-300 transition-colors hover:border-brand/40 hover:text-brand"
                >
                  <Icon size={11} />
                  {ev.label}
                  <span className="text-mist-100">{ev.time}</span>
                  {ev.source && (
                    <span className="text-mist-600">@{ev.source}</span>
                  )}
                </span>
              );
            })}
          </div>
        </li>
      ))}
    </ul>
  );
}
