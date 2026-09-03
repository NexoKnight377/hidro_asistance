"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type SVGProps,
} from "react";
import {
  ArcElement,
  BarElement,
  CategoryScale,
  Chart as ChartJS,
  Legend,
  LinearScale,
  Tooltip as ChartTooltip,
  type ChartOptions,
  type ChartType,
  type Plugin,
} from "chart.js";
import { Bar, Doughnut } from "react-chartjs-2";
import {
  AlarmClock,
  Calendar,
  CalendarCheck,
  CalendarDays,
  CalendarRange,
  ChevronLeft,
  ChevronRight,
  CircleCheck,
  CircleX,
  Clock3,
  Cpu,
  History,
  Loader2,
  LogOut,
  MousePointerClick,
  RefreshCw,
  TriangleAlert,
  UserCheck,
  UserX,
  type LucideIcon,
} from "lucide-react";

import type { StatsPayload } from "@/app/api/dashboard/stats/route";
import {
  fmtDuration,
  relTime,
  shiftKey,
  type Period,
} from "@/lib/attendance";
import AdminPanels from "@/components/AdminPanels";
import {
  AttendanceGrid,
  DayDetail,
  EmployeeTable,
  GridLegend,
} from "@/components/AttendanceGrid";

ChartJS.register(
  CategoryScale,
  LinearScale,
  BarElement,
  ArcElement,
  ChartTooltip,
  Legend,
);
ChartJS.defaults.font.family = '"IBM Plex Mono", ui-monospace, monospace';
ChartJS.defaults.font.size = 10;
ChartJS.defaults.color = "#7f9a97";

declare module "chart.js" {
  interface PluginOptionsByType<TType extends ChartType> {
    centerText?: { value: string; label: string };
  }
}

const GRID = "rgba(237,244,242,0.07)";
const PANEL_LINE = "rgba(237,244,242,0.12)";

const centerTextPlugin: Plugin<"doughnut"> = {
  id: "centerText",
  afterDraw(chart) {
    const cfg = chart.options.plugins?.centerText;
    if (!cfg) return;
    const value = cfg.value ?? "";
    const label = cfg.label ?? "";
    const { ctx, chartArea } = chart;
    const x = (chartArea.left + chartArea.right) / 2;
    const y = (chartArea.top + chartArea.bottom) / 2;
    ctx.save();
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.font = '600 20px "IBM Plex Mono", ui-monospace, monospace';
    ctx.fillStyle = "#edf4f2";
    ctx.fillText(value, x, y - 8);
    ctx.font = '500 9px "IBM Plex Sans", system-ui, sans-serif';
    ctx.fillStyle = "#7f9a97";
    ctx.fillText(label.toUpperCase(), x, y + 12);
    ctx.restore();
  },
};

function useCountUp(target: number, duration = 650): number {
  const [value, setValue] = useState(0);
  const fromRef = useRef(0);
  useEffect(() => {
    const from = fromRef.current;
    if (from === target) return;
    let raf = 0;
    const t0 = performance.now();
    const step = (t: number) => {
      const p = Math.min(1, (t - t0) / duration);
      const eased = 1 - Math.pow(1 - p, 3);
      setValue(from + (target - from) * eased);
      if (p < 1) raf = requestAnimationFrame(step);
      else fromRef.current = target;
    };
    raf = requestAnimationFrame(step);
    return () => {
      cancelAnimationFrame(raf);
      fromRef.current = target;
    };
  }, [target, duration]);
  return value;
}

const todayKeyUtc = () => new Date().toISOString().slice(0, 10);

const fmtDayLong = (key: string) =>
  new Intl.DateTimeFormat("es-MX", {
    weekday: "long",
    day: "2-digit",
    month: "long",
    timeZone: "UTC",
  }).format(new Date(`${key}T00:00:00Z`));

const fmtMonth = (key: string) =>
  new Intl.DateTimeFormat("es-MX", {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(`${key}T00:00:00Z`));

interface SyncRunRow {
  id: number;
  runAt: string;
  trigger: string;
  status: string;
  recordsFetched: number;
  recordsInserted: number;
  durationMs: number | null;
  errorLog: string | null;
}

interface Toast {
  kind: "ok" | "err";
  text: string;
}

function KpiCard({
  icon: Icon,
  label,
  value,
  suffix,
  hint,
  delta,
  goodWhenDown,
  color,
  delay,
}: {
  icon: LucideIcon;
  label: string;
  value: number;
  suffix?: string;
  hint: string;
  delta: number | null;
  goodWhenDown?: boolean;
  color: string;
  delay: number;
}) {
  const animated = useCountUp(value);
  const up = (delta ?? 0) >= 0;
  const good = delta === null ? true : goodWhenDown ? delta < 0 : delta >= 0;
  return (
    <article
      className="card reveal group relative overflow-hidden p-4"
      style={{ animationDelay: `${delay}ms` }}
    >
      <span
        className="absolute inset-x-0 top-0 h-[3px]"
        style={{ backgroundColor: color }}
      />
      <div className="flex items-center justify-between gap-2">
        <span className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.14em] text-mist-500">
          <span
            className="grid h-7 w-7 place-items-center rounded-md"
            style={{ backgroundColor: `${color}1f`, color }}
          >
            <Icon size={14} strokeWidth={2.2} />
          </span>
          {label}
        </span>
        {delta !== null && (
          <span
            className={`rounded-full px-2 py-0.5 font-mono text-[10px] ${
              good ? "bg-mint/15 text-mint" : "bg-flame/15 text-flame"
            }`}
            title="vs período inmediato anterior"
          >
            {up ? "▲" : "▼"} {Math.abs(delta).toFixed(0)}%
          </span>
        )}
      </div>
      <p className="mt-3 font-mono text-[30px] font-semibold leading-none tracking-tight text-mist-100 tabular-nums">
        {Math.round(animated).toLocaleString("es-MX")}
        {suffix && (
          <span className="ml-1 text-base text-mist-500">{suffix}</span>
        )}
      </p>
      <p className="mt-1.5 text-[11px] text-mist-600">{hint}</p>
    </article>
  );
}

function BrandMark(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 32 32" fill="none" aria-hidden="true" {...props}>
      <rect x="1.5" y="1.5" width="29" height="29" rx="8" stroke="#f2a93b" strokeWidth="1.6" />
      <circle cx="16" cy="16" r="8.5" stroke="#f2a93b" strokeWidth="1.6" />
      <path d="M16 10.5V16l4 2.5" stroke="#35c0a6" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

const PERIODS: { key: Period; label: string; icon: LucideIcon }[] = [
  { key: "day", label: "Día", icon: CalendarDays },
  { key: "week", label: "Semana", icon: CalendarRange },
  { key: "month", label: "Mes", icon: Calendar },
];

export default function Dashboard() {
  const [period, setPeriod] = useState<Period>("week");
  const [date, setDate] = useState(todayKeyUtc);
  const [stats, setStats] = useState<StatsPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [syncing, setSyncing] = useState(false);
  const [running, setRunning] = useState(false);
  const [intervalMinutes, setIntervalMinutes] = useState(10);
  const [runs, setRuns] = useState<SyncRunRow[]>([]);
  const [toast, setToast] = useState<Toast | null>(null);
  const [tick, setTick] = useState(() => Date.now());
  const prevRunning = useRef(false);

  useEffect(() => {
    const id = setInterval(() => setTick(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    if (!toast) return;
    const id = setTimeout(() => setToast(null), 4500);
    return () => clearTimeout(id);
  }, [toast]);

  const loadStats = useCallback(async () => {
    try {
      const res = await fetch(
        `/api/dashboard/stats?period=${period}&date=${date}`,
        { cache: "no-store" },
      );
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      setStats((await res.json()) as StatsPayload);
      setError(null);
    } catch {
      setError("No se pudo calcular el panel. Verifica la base de datos.");
    } finally {
      setLoading(false);
    }
  }, [period, date]);

  const loadRuns = useCallback(async () => {
    try {
      const res = await fetch("/api/sync", { cache: "no-store" });
      if (!res.ok) return;
      const data = (await res.json()) as {
        running: boolean;
        intervalMinutes: number;
        runs: SyncRunRow[];
      };
      setRunning(data.running);
      setIntervalMinutes(data.intervalMinutes);
      setRuns(data.runs);
    } catch {
      /* silencioso: el panel sigue funcionando */
    }
  }, []);

  useEffect(() => {
    setLoading(true);
    void loadStats();
  }, [loadStats]);

  useEffect(() => {
    void loadRuns();
  }, [loadRuns]);

  // poll mientras haya job vivo; al terminar recarga stats
  useEffect(() => {
    if (!running && !syncing) return;
    const id = setInterval(() => void loadRuns(), 3000);
    return () => clearInterval(id);
  }, [running, syncing, loadRuns]);

  useEffect(() => {
    if (prevRunning.current && !running) {
      void loadStats();
      const last = runs[0];
      if (last && last.status !== "running") {
        setToast({
          kind: last.status === "failed" ? "err" : "ok",
          text:
            last.status === "failed"
              ? `Sincronización fallida: ${last.errorLog ?? "error"}`
              : `Sincronización ${last.trigger} ok · ${last.recordsInserted} marcaciones nuevas`,
        });
      }
    }
    prevRunning.current = running;
  }, [running, runs, loadStats]);

  const handleSync = async () => {
    if (syncing || running) return;
    setSyncing(true);
    setToast({ kind: "ok", text: "Sincronización ISAPI en curso…" });
    try {
      const res = await fetch("/api/sync", { method: "POST" });
      const data = (await res.json()) as {
        running?: boolean;
        message?: string;
        run?: SyncRunRow;
      };
      if (res.status === 202) {
        setRunning(true);
        setToast({ kind: "ok", text: data.message ?? "Job en curso" });
      } else if (!res.ok) {
        throw new Error(data.message ?? "Error de sincronización");
      } else {
        await loadRuns();
        await loadStats();
        setToast({
          kind: "ok",
          text: `Sincronización completada · ${data.run?.recordsInserted ?? 0} marcaciones nuevas`,
        });
      }
    } catch (err) {
      setToast({
        kind: "err",
        text: err instanceof Error ? err.message : "Error de sincronización",
      });
    } finally {
      setSyncing(false);
    }
  };

  const periodLabel = useMemo(() => {
    if (!stats) return "";
    if (period === "day") return fmtDayLong(date);
    if (period === "month") return fmtMonth(date);
    const first = stats.days[0];
    const last = stats.days[stats.days.length - 1];
    if (!first || !last) return stats.rangeLabel;
    return `${first.slice(8, 10)}/${first.slice(5, 7)} – ${last.slice(8, 10)}/${last.slice(5, 7)}/${last.slice(0, 4)}`;
  }, [stats, period, date]);

  const doughnutData = useMemo(() => {
    if (!stats) return null;
    return {
      labels: stats.distribution.map((d) => d.label),
      datasets: [
        {
          data: stats.distribution.map((d) => d.value),
          backgroundColor: stats.distribution.map((d) => d.color),
          borderColor: "#0b181b",
          borderWidth: 3,
          hoverOffset: 8,
        },
      ],
    };
  }, [stats]);

  const doughnutOptions = useMemo<ChartOptions<"doughnut">>(() => {
    return {
      responsive: true,
      maintainAspectRatio: false,
      cutout: "68%",
      plugins: {
        legend: { display: false },
        centerText: { value: "—", label: "asistencia" },
        tooltip: {
          backgroundColor: "#0e1e22",
          borderColor: PANEL_LINE,
          borderWidth: 1,
          titleColor: "#edf4f2",
          bodyColor: "#c2d4d0",
          padding: 10,
          callbacks: {
            label: (ctx) => {
              const data = ctx.dataset.data as number[];
              const total = data.reduce((a, b) => a + b, 0);
              const value = ctx.parsed;
              const share = total > 0 ? (value / total) * 100 : 0;
              return ` ${value} persona-día · ${share.toFixed(1)}%`;
            },
          },
        },
      },
    };
  }, []);

  useEffect(() => {
    if (!stats || !doughnutOptions.plugins) return;
    doughnutOptions.plugins.centerText = {
      value: `${Math.round(stats.kpis.presentRate * 100)}%`,
      label: "asistencia",
    };
  }, [stats, doughnutOptions]);

  const barData = useMemo(() => {
    if (!stats) return null;
    if (stats.period === "day") {
      return {
        labels: stats.hourly.map((_, i) => `${String(i).padStart(2, "0")}`),
        datasets: [
          {
            label: "Marcaciones",
            data: stats.hourly,
            backgroundColor: "rgba(53,192,166,0.5)",
            hoverBackgroundColor: "#35c0a6",
            borderRadius: 3,
            maxBarThickness: 16,
          },
        ],
      };
    }
    return {
      labels: stats.daily.map((d) => `${d.date.slice(8, 10)}/${d.date.slice(5, 7)}`),
      datasets: [
        { label: "OK", data: stats.daily.map((d) => d.ok), backgroundColor: "#35c0a6", borderRadius: 2, maxBarThickness: 26 },
        { label: "Tarde", data: stats.daily.map((d) => d.tarde), backgroundColor: "#f2a93b", borderRadius: 2, maxBarThickness: 26 },
        { label: "S. temprana", data: stats.daily.map((d) => d.temprano), backgroundColor: "#6fb3e8", borderRadius: 2, maxBarThickness: 26 },
        { label: "Sin checkout", data: stats.daily.map((d) => d.sinCheckout), backgroundColor: "#ff6b4a", borderRadius: 2, maxBarThickness: 26 },
        { label: "Ausente", data: stats.daily.map((d) => d.ausente), backgroundColor: "#d1493f", borderRadius: 2, maxBarThickness: 26 },
      ],
    };
  }, [stats]);

  const barOptions = useMemo<ChartOptions<"bar">>(() => {
    const stacked = period !== "day";
    return {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: {
          display: stacked,
          position: "bottom",
          labels: { boxWidth: 8, boxHeight: 8, usePointStyle: true, pointStyle: "rectRounded" },
        },
        tooltip: {
          backgroundColor: "#0e1e22",
          borderColor: PANEL_LINE,
          borderWidth: 1,
          titleColor: "#edf4f2",
          bodyColor: "#c2d4d0",
          padding: 10,
        },
      },
      scales: {
        x: {
          stacked,
          grid: { display: false },
          border: { color: PANEL_LINE },
          ticks: { autoSkip: true, maxRotation: 0, maxTicksLimit: 12 },
        },
        y: {
          stacked,
          beginAtZero: true,
          grid: { color: GRID },
          border: { display: false },
          ticks: { precision: 0 },
        },
      },
    };
  }, [period]);

  const btnPrimary =
    "inline-flex h-9 items-center gap-2 rounded-lg bg-brand px-4 text-sm font-semibold text-ink-950 transition hover:brightness-110 active:translate-y-px disabled:cursor-not-allowed disabled:opacity-60";
  const btnGhost =
    "inline-flex h-9 items-center gap-2 rounded-lg border border-white/10 px-3 text-sm text-mist-300 transition hover:border-brand/40 hover:text-mist-100 disabled:cursor-not-allowed disabled:opacity-60";

  if (error && !stats) {
    return (
      <div className="mx-auto grid min-h-[70vh] max-w-[720px] place-items-center px-5">
        <div className="card w-full p-8 text-center">
          <TriangleAlert className="mx-auto text-flame" size={28} />
          <h2 className="mt-4 font-display text-2xl font-bold text-mist-100">
            El panel no responde
          </h2>
          <p className="mt-2 text-sm text-mist-500">{error}</p>
          <button type="button" onClick={() => void loadStats()} className={`${btnPrimary} mx-auto mt-6`}>
            <RefreshCw size={15} /> Reintentar
          </button>
        </div>
      </div>
    );
  }

  return (
    <>
      <header className="sticky top-0 z-20 border-b border-white/8 bg-ink-950/85 backdrop-blur-md">
        <div className="mx-auto flex h-16 max-w-[1240px] items-center gap-3 px-5">
          <BrandMark className="h-8 w-8 shrink-0" />
          <div className="leading-tight">
            <p className="font-display text-lg font-bold tracking-tight text-mist-100">
              ASISTE<span className="text-brand">·</span>OPS
            </p>
            <p className="hidden text-[11px] text-mist-500 sm:block">
              Control de asistencias · Hikvision ISAPI
            </p>
          </div>
          <span
            className="ml-2 hidden items-center gap-1.5 rounded-full border border-mint/25 bg-mint/10 px-2.5 py-1 font-mono text-[10px] text-mint md:inline-flex"
            title="El job ISAPI corre en segundo plano"
          >
            <span className="pulse-dot h-1.5 w-1.5 rounded-full bg-mint" />
            cron cada {intervalMinutes} min
          </span>
          <div className="ml-auto flex items-center gap-2">
            <span className="hidden items-center gap-1.5 font-mono text-xs text-mist-500 lg:inline-flex">
              <Clock3 size={13} />
              {new Date(tick).toLocaleTimeString("es-MX", {
                hour12: false,
                timeZone: "UTC",
              })}{" "}
              UTC
            </span>
            <button
              type="button"
              onClick={() => void handleSync()}
              disabled={syncing || running}
              className={btnPrimary}
              title="POST /api/sync — pull ISAPI inmediato"
            >
              <RefreshCw size={14} className={syncing || running ? "animate-spin" : undefined} />
              {running ? "Job en curso…" : syncing ? "Sincronizando…" : "Sincronizar ahora"}
            </button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-[1240px] px-5 pb-14 pt-7">
        {/* toolbar de período */}
        <div className="reveal flex flex-wrap items-center gap-3">
          <div className="inline-flex rounded-lg border border-white/10 bg-white/[0.04] p-1">
            {PERIODS.map((p) => {
              const Icon = p.icon;
              const active = period === p.key;
              return (
                <button
                  key={p.key}
                  type="button"
                  onClick={() => setPeriod(p.key)}
                  className={`inline-flex h-8 items-center gap-1.5 rounded-md px-3 text-xs font-medium transition ${
                    active
                      ? "bg-brand text-ink-950"
                      : "text-mist-400 hover:text-mist-100"
                  }`}
                >
                  <Icon size={13} /> {p.label}
                </button>
              );
            })}
          </div>

          <div className="inline-flex items-center gap-1">
            <button
              type="button"
              onClick={() => setDate(shiftKey(period, date, -1))}
              className={`${btnGhost} h-8 w-8 justify-center px-0`}
              title="Período anterior"
              aria-label="Período anterior"
            >
              <ChevronLeft size={14} />
            </button>
            <label className="relative">
              <input
                type="date"
                value={date}
                onChange={(e) => e.target.value && setDate(e.target.value)}
                className="h-8 rounded-lg border border-white/10 bg-white/[0.04] px-2.5 font-mono text-xs text-mist-200 focus:border-brand/50 focus:outline-none"
                aria-label="Fecha base del período"
              />
            </label>
            <button
              type="button"
              onClick={() => setDate(shiftKey(period, date, 1))}
              className={`${btnGhost} h-8 w-8 justify-center px-0`}
              title="Período siguiente"
              aria-label="Período siguiente"
            >
              <ChevronRight size={14} />
            </button>
            <button
              type="button"
              onClick={() => setDate(todayKeyUtc())}
              className={`${btnGhost} h-8`}
              title="Volver al día de hoy"
            >
              <CalendarCheck size={13} /> Hoy
            </button>
          </div>

          <h1 className="font-display text-lg font-bold capitalize tracking-tight text-mist-100">
            {loading && !stats ? "cargando…" : periodLabel}
          </h1>

          {stats?.lastRun && (
            <span className="ml-auto inline-flex items-center gap-1.5 font-mono text-[10px] text-mist-500">
              {stats.lastRun.trigger === "cron" ? (
                <Cpu size={11} className="text-lake" />
              ) : (
                <MousePointerClick size={11} className="text-brand" />
              )}
              última sync {relTime(stats.lastRun.runAt, tick)} ·{" "}
              {stats.lastRun.recordsInserted} reg.
            </span>
          )}
        </div>

        {!stats ? (
          <div className="mt-6 space-y-4">
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
              {[0, 1, 2, 3].map((i) => (
                <div key={i} className="skeleton h-28 rounded-xl" />
              ))}
            </div>
            <div className="grid gap-4 lg:grid-cols-3">
              <div className="skeleton h-72 rounded-xl" />
              <div className="skeleton h-72 rounded-xl lg:col-span-2" />
            </div>
            <p className="flex items-center gap-2 font-mono text-xs text-mist-500">
              <Loader2 size={13} className="animate-spin" /> calculando estados
              desde attendance_logs…
            </p>
          </div>
        ) : (
          <>
            {/* KPIs */}
            <section className="mt-6 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
              <KpiCard
                icon={UserCheck}
                label="Asistencias"
                value={stats.kpis.asistencias}
                hint={`${stats.kpis.expected} persona-día esperadas (Lun-Sáb)`}
                delta={stats.deltas.asistencias}
                color="#35c0a6"
                delay={40}
              />
              <KpiCard
                icon={AlarmClock}
                label="Tardanzas"
                value={stats.kpis.tardanzas}
                hint={`entrada fuera de tolerancia · ${
                  stats.kpis.asistencias > 0
                    ? Math.round((stats.kpis.tardanzas / stats.kpis.asistencias) * 100)
                    : 0
                }% de asistencias`}
                delta={stats.deltas.tardanzas}
                goodWhenDown
                color="#f2a93b"
                delay={100}
              />
              <KpiCard
                icon={LogOut}
                label="Salidas tempranas"
                value={stats.kpis.salidasTempranas}
                hint="checkout antes del horario menos tolerancia"
                delta={stats.deltas.salidasTempranas}
                goodWhenDown
                color="#6fb3e8"
                delay={160}
              />
              <KpiCard
                icon={UserX}
                label="Ausencias"
                value={stats.kpis.ausencias}
                hint="días hábiles sin marcación de entrada"
                delta={stats.deltas.ausencias}
                goodWhenDown
                color="#d1493f"
                delay={220}
              />
            </section>

            {/* charts */}
            <section className="mt-4 grid gap-4 lg:grid-cols-3">
              <article className="card reveal p-5">
                <h2 className="font-display text-base font-bold text-mist-100">
                  Distribución de estados
                </h2>
                <p className="text-[11px] text-mist-500">
                  persona-día por estado primario · {periodLabel}
                </p>
                <div className="relative mt-4 h-48">
                  {doughnutData && stats.distribution.length > 0 ? (
                    <Doughnut
                      data={doughnutData}
                      options={doughnutOptions}
                      plugins={[centerTextPlugin]}
                    />
                  ) : (
                    <p className="grid h-full place-items-center text-xs text-mist-500">
                      Sin marcaciones en el período.
                    </p>
                  )}
                </div>
                <ul className="mt-4 space-y-1">
                  {stats.distribution.map((d) => (
                    <li key={d.key} className="flex items-center gap-2 font-mono text-[11px] text-mist-400">
                      <span className="h-2 w-2 rounded-sm" style={{ backgroundColor: d.color }} />
                      <span className="text-mist-300">{d.label}</span>
                      <span className="ml-auto tabular-nums">{d.value}</span>
                    </li>
                  ))}
                </ul>
              </article>

              <article className="card reveal p-5 lg:col-span-2" style={{ animationDelay: "80ms" }}>
                <h2 className="font-display text-base font-bold text-mist-100">
                  {stats.period === "day" ? "Marcaciones por hora" : "Asistencia por día"}
                </h2>
                <p className="text-[11px] text-mist-500">
                  {stats.period === "day"
                    ? "todas las marcaciones del día · UTC"
                    : "apilado por estado · días hábiles Lun-Sáb"}
                </p>
                <div className="relative mt-4 h-64">
                  {barData && <Bar data={barData} options={barOptions} />}
                </div>
              </article>
            </section>

            {/* tabla por personal */}
            <section className="card reveal mt-4 p-5" style={{ animationDelay: "60ms" }}>
              <h2 className="font-display text-base font-bold text-mist-100">
                Resumen por personal
              </h2>
              <p className="mb-3 text-[11px] text-mist-500">
                contadores acumulados de la selección actual
              </p>
              <EmployeeTable
                employees={stats.employees}
                expectedDays={stats.days.filter((d) => d <= stats.todayKey).length}
              />
            </section>

            {/* grilla día a día */}
            <section className="card reveal mt-4 p-5" style={{ animationDelay: "100ms" }}>
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <h2 className="font-display text-base font-bold text-mist-100">
                    Grilla día a día
                  </h2>
                  <p className="text-[11px] text-mist-500">
                    entrada / salida por día hábil · pasa el cursor para el
                    detalle
                  </p>
                </div>
                <GridLegend />
              </div>
              <div className="mt-3">
                <AttendanceGrid
                  employees={stats.employees}
                  days={stats.days}
                  todayKey={stats.todayKey}
                  compact={period === "month"}
                />
              </div>
            </section>

            {/* detalle del día */}
            {stats.period === "day" && (
              <section className="card reveal mt-4 p-5" style={{ animationDelay: "120ms" }}>
                <h2 className="font-display text-base font-bold text-mist-100">
                  Marcaciones del día
                </h2>
                <p className="mb-3 text-[11px] text-mist-500">
                  evento por evento, con terminal y origen IP:puerto
                </p>
                <DayDetail detail={stats.dayDetail} />
              </section>
            )}

            {/* bitácora + administración */}
            <section className="mt-4 grid gap-4 lg:grid-cols-3">
              <article className="card reveal p-5">
                <div className="flex items-center gap-2">
                  <History size={15} className="text-lake" />
                  <h2 className="font-display text-base font-bold text-mist-100">
                    Bitácora de sync
                  </h2>
                </div>
                <ul className="mt-3 max-h-64 space-y-2 overflow-y-auto pr-1">
                  {runs.length === 0 && (
                    <li className="rounded-lg border border-dashed border-white/10 p-4 text-center text-xs text-mist-500">
                      Aún no hay ejecuciones.
                    </li>
                  )}
                  {runs.map((run) => (
                    <li
                      key={run.id}
                      className="rounded-lg border border-white/6 bg-white/[0.03] p-2.5 transition-colors hover:border-white/12"
                    >
                      <div className="flex items-center gap-2">
                        {run.status === "success" ? (
                          <CircleCheck size={13} className="shrink-0 text-mint" />
                        ) : run.status === "running" ? (
                          <Loader2 size={13} className="shrink-0 animate-spin text-brand" />
                        ) : run.status === "partial" ? (
                          <TriangleAlert size={13} className="shrink-0 text-brand" />
                        ) : (
                          <CircleX size={13} className="shrink-0 text-flame" />
                        )}
                        <span className="inline-flex items-center gap-1 text-xs text-mist-200">
                          {run.trigger === "cron" ? (
                            <Cpu size={11} className="text-lake" />
                          ) : (
                            <MousePointerClick size={11} className="text-brand" />
                          )}
                          {run.trigger}
                        </span>
                        <span className="ml-auto font-mono text-[10px] text-mist-500">
                          {relTime(run.runAt, tick)}
                        </span>
                      </div>
                      <p
                        className="mt-1 truncate font-mono text-[10px] text-mist-500"
                        title={run.errorLog ?? undefined}
                      >
                        {run.recordsFetched} leídos · {run.recordsInserted} nuevos ·{" "}
                        {run.durationMs !== null ? `${run.durationMs} ms` : "—"}
                        {run.errorLog ? ` · ${run.errorLog}` : ""}
                      </p>
                    </li>
                  ))}
                </ul>
                <p className="mt-3 font-mono text-[10px] text-mist-600">
                  horas trabajadas totales del período:{" "}
                  {fmtDuration(
                    stats.employees.reduce((a, e) => a + e.workedMin, 0),
                  )}
                </p>
              </article>

              <div className="lg:col-span-2">
                <AdminPanels
                  tick={tick}
                  notify={(kind, text) => setToast({ kind, text })}
                />
              </div>
            </section>
          </>
        )}

        <footer className="mt-10 flex flex-wrap items-center justify-between gap-2 border-t border-white/6 pt-5 font-mono text-[10px] text-mist-600">
          <span>
            ASISTE·OPS — marcaciones crudas en PostgreSQL, estados calculados al
            vuelo
          </span>
          <span>next.js · drizzle · hikvision isapi · chart.js</span>
        </footer>
      </main>

      <div aria-live="polite" className="pointer-events-none fixed bottom-5 right-5 z-50">
        {toast && (
          <div
            className={`toast-in card flex items-center gap-2.5 px-4 py-3 text-sm shadow-2xl ${
              toast.kind === "ok" ? "text-mist-200" : "text-flame"
            }`}
          >
            {toast.kind === "ok" ? (
              syncing || running ? (
                <Loader2 size={15} className="animate-spin text-brand" />
              ) : (
                <CircleCheck size={15} className="text-mint" />
              )
            ) : (
              <TriangleAlert size={15} />
            )}
            {toast.text}
          </div>
        )}
      </div>
    </>
  );
}
