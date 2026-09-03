"use client";

import { useCallback, useEffect, useState } from "react";
import {
  Fingerprint,
  KeyRound,
  Plus,
  ServerCog,
  Users,
  X,
} from "lucide-react";

import { relTime } from "@/lib/attendance";

interface DeviceRow {
  id: number;
  name: string;
  ipAddress: string;
  port: number;
  location: string;
  deviceType: string;
  simulate: boolean;
  lastSyncAt: string | null;
  passwordSet: boolean;
}

interface EmployeeRow {
  id: number;
  legajo: string;
  firstName: string;
  lastName: string;
  department: string;
  scheduleIn: string;
  scheduleOut: string;
  toleranceMinutes: number;
  active: boolean;
}

const inputCls =
  "h-8 rounded-lg border border-white/10 bg-white/[0.04] px-2.5 text-xs text-mist-200 placeholder:text-mist-600 focus:border-brand/50 focus:outline-none";
const labelCls = "mb-1 block font-mono text-[10px] uppercase tracking-[0.1em] text-mist-500";

export default function AdminPanels({
  tick,
  notify,
}: {
  tick: number;
  notify: (kind: "ok" | "err", text: string) => void;
}) {
  const [devices, setDevices] = useState<DeviceRow[]>([]);
  const [employees, setEmployees] = useState<EmployeeRow[]>([]);
  const [showDeviceForm, setShowDeviceForm] = useState(false);
  const [showEmpForm, setShowEmpForm] = useState(false);
  const [saving, setSaving] = useState(false);

  const [deviceForm, setDeviceForm] = useState({
    name: "",
    ipAddress: "",
    port: "80",
    username: "admin",
    password: "",
    location: "",
    deviceType: "mixto",
    simulate: true,
  });
  const [empForm, setEmpForm] = useState({
    legajo: "",
    firstName: "",
    lastName: "",
    department: "",
    scheduleIn: "09:00",
    scheduleOut: "18:00",
    toleranceMinutes: "10",
  });

  const loadDevices = useCallback(async () => {
    const res = await fetch("/api/devices", { cache: "no-store" });
    if (res.ok) {
      const data = (await res.json()) as { devices: DeviceRow[] };
      setDevices(data.devices);
    }
  }, []);

  const loadEmployees = useCallback(async () => {
    const res = await fetch("/api/employees", { cache: "no-store" });
    if (res.ok) {
      const data = (await res.json()) as { employees: EmployeeRow[] };
      setEmployees(data.employees);
    }
  }, []);

  useEffect(() => {
    void loadDevices();
    void loadEmployees();
  }, [loadDevices, loadEmployees]);

  const submitDevice = async () => {
    setSaving(true);
    try {
      const res = await fetch("/api/devices", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...deviceForm, port: Number(deviceForm.port) }),
      });
      const data = (await res.json()) as { error?: string };
      if (!res.ok) throw new Error(data.error ?? "Error al crear terminal");
      notify("ok", `Terminal ${deviceForm.name} registrado`);
      setShowDeviceForm(false);
      setDeviceForm({
        name: "",
        ipAddress: "",
        port: "80",
        username: "admin",
        password: "",
        location: "",
        deviceType: "mixto",
        simulate: true,
      });
      await loadDevices();
    } catch (err) {
      notify("err", err instanceof Error ? err.message : "Error al crear terminal");
    } finally {
      setSaving(false);
    }
  };

  const submitEmployee = async () => {
    setSaving(true);
    try {
      const res = await fetch("/api/employees", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...empForm,
          toleranceMinutes: Number(empForm.toleranceMinutes),
        }),
      });
      const data = (await res.json()) as { error?: string };
      if (!res.ok) throw new Error(data.error ?? "Error al crear personal");
      notify("ok", `${empForm.firstName} ${empForm.lastName} agregado al personal`);
      setShowEmpForm(false);
      setEmpForm({
        legajo: "",
        firstName: "",
        lastName: "",
        department: "",
        scheduleIn: "09:00",
        scheduleOut: "18:00",
        toleranceMinutes: "10",
      });
      await loadEmployees();
    } catch (err) {
      notify("err", err instanceof Error ? err.message : "Error al crear personal");
    } finally {
      setSaving(false);
    }
  };

  return (
    <section className="grid gap-4 lg:grid-cols-2">
      {/* terminales */}
      <article className="card reveal p-5">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <Fingerprint size={15} className="text-brand" />
            <h2 className="font-display text-base font-bold text-mist-100">
              Terminales biométricos
            </h2>
          </div>
          <button
            type="button"
            onClick={() => setShowDeviceForm((v) => !v)}
            className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-white/10 px-2.5 text-xs text-mist-300 transition hover:border-brand/40 hover:text-brand"
          >
            {showDeviceForm ? <X size={13} /> : <Plus size={13} />}
            {showDeviceForm ? "Cerrar" : "Agregar terminal"}
          </button>
        </div>
        <p className="mt-1 text-[11px] text-mist-600">
          IP, puerto y credenciales HTTP Digest centralizados en la tabla
          access_devices (sembrada desde .env).
        </p>

        {showDeviceForm && (
          <div className="mt-3 grid grid-cols-2 gap-2 rounded-lg border border-white/8 bg-white/[0.03] p-3">
            <div className="col-span-2">
              <span className={labelCls}>Nombre</span>
              <input
                className={`${inputCls} w-full`}
                value={deviceForm.name}
                onChange={(e) => setDeviceForm({ ...deviceForm, name: e.target.value })}
                placeholder="DS-K1T671 · Recepción"
              />
            </div>
            <div>
              <span className={labelCls}>IP</span>
              <input
                className={`${inputCls} w-full`}
                value={deviceForm.ipAddress}
                onChange={(e) =>
                  setDeviceForm({ ...deviceForm, ipAddress: e.target.value })
                }
                placeholder="192.168.1.20"
              />
            </div>
            <div>
              <span className={labelCls}>Puerto</span>
              <input
                className={`${inputCls} w-full`}
                value={deviceForm.port}
                onChange={(e) => setDeviceForm({ ...deviceForm, port: e.target.value })}
              />
            </div>
            <div>
              <span className={labelCls}>Usuario Digest</span>
              <input
                className={`${inputCls} w-full`}
                value={deviceForm.username}
                onChange={(e) =>
                  setDeviceForm({ ...deviceForm, username: e.target.value })
                }
              />
            </div>
            <div>
              <span className={labelCls}>Password Digest</span>
              <input
                type="password"
                className={`${inputCls} w-full`}
                value={deviceForm.password}
                onChange={(e) =>
                  setDeviceForm({ ...deviceForm, password: e.target.value })
                }
                placeholder="••••••••"
              />
            </div>
            <div>
              <span className={labelCls}>Ubicación</span>
              <input
                className={`${inputCls} w-full`}
                value={deviceForm.location}
                onChange={(e) =>
                  setDeviceForm({ ...deviceForm, location: e.target.value })
                }
                placeholder="Recepción sur"
              />
            </div>
            <div>
              <span className={labelCls}>Tipo</span>
              <select
                className={`${inputCls} w-full bg-ink-850`}
                value={deviceForm.deviceType}
                onChange={(e) =>
                  setDeviceForm({ ...deviceForm, deviceType: e.target.value })
                }
              >
                <option value="entrada">entrada</option>
                <option value="salida">salida</option>
                <option value="mixto">mixto</option>
              </select>
            </div>
            <label className="col-span-2 flex items-center gap-2 text-xs text-mist-400">
              <input
                type="checkbox"
                checked={deviceForm.simulate}
                onChange={(e) =>
                  setDeviceForm({ ...deviceForm, simulate: e.target.checked })
                }
                className="accent-[#f2a93b]"
              />
              Modo simulado (sin hardware ISAPI reachable)
            </label>
            <button
              type="button"
              onClick={() => void submitDevice()}
              disabled={saving}
              className="col-span-2 inline-flex h-8 items-center justify-center gap-1.5 rounded-lg bg-brand text-xs font-semibold text-ink-950 transition hover:brightness-110 disabled:opacity-60"
            >
              <ServerCog size={13} /> Guardar terminal
            </button>
          </div>
        )}

        <ul className="mt-3 space-y-2">
          {devices.map((d) => (
            <li
              key={d.id}
              className="rounded-lg border border-white/6 bg-white/[0.03] p-3 transition-colors hover:border-white/12"
            >
              <div className="flex flex-wrap items-center gap-2">
                <ServerCog size={14} className="shrink-0 text-mist-500" />
                <span className="text-xs font-medium text-mist-100">{d.name}</span>
                <span className="rounded-full bg-white/8 px-2 py-0.5 font-mono text-[10px] text-mist-400">
                  {d.deviceType}
                </span>
                <span
                  className={`rounded-full px-2 py-0.5 font-mono text-[10px] ${
                    d.simulate ? "bg-lake/15 text-lake" : "bg-mint/15 text-mint"
                  }`}
                >
                  {d.simulate ? "simulado" : "ISAPI real"}
                </span>
                {d.passwordSet && (
                  <span
                    className="inline-flex items-center gap-1 font-mono text-[10px] text-mist-600"
                    title="Credencial Digest configurada"
                  >
                    <KeyRound size={10} /> digest
                  </span>
                )}
                <span className="ml-auto font-mono text-[10px] text-mist-500">
                  {relTime(d.lastSyncAt, tick)}
                </span>
              </div>
              <p className="mt-1 font-mono text-[10px] text-mist-500">
                {d.ipAddress}:{d.port} · {d.location}
              </p>
            </li>
          ))}
          {devices.length === 0 && (
            <li className="rounded-lg border border-dashed border-white/10 p-4 text-center text-xs text-mist-500">
              Sin terminales configurados.
            </li>
          )}
        </ul>
      </article>

      {/* personal */}
      <article className="card reveal p-5" style={{ animationDelay: "80ms" }}>
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <Users size={15} className="text-mint" />
            <h2 className="font-display text-base font-bold text-mist-100">
              Personal
            </h2>
          </div>
          <button
            type="button"
            onClick={() => setShowEmpForm((v) => !v)}
            className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-white/10 px-2.5 text-xs text-mist-300 transition hover:border-brand/40 hover:text-brand"
          >
            {showEmpForm ? <X size={13} /> : <Plus size={13} />}
            {showEmpForm ? "Cerrar" : "Agregar persona"}
          </button>
        </div>
        <p className="mt-1 text-[11px] text-mist-600">
          Horario contractual y tolerancia: la base para calcular estados al
          vuelo.
        </p>

        {showEmpForm && (
          <div className="mt-3 grid grid-cols-2 gap-2 rounded-lg border border-white/8 bg-white/[0.03] p-3">
            <div>
              <span className={labelCls}>Legajo</span>
              <input
                className={`${inputCls} w-full`}
                value={empForm.legajo}
                onChange={(e) => setEmpForm({ ...empForm, legajo: e.target.value })}
                placeholder="1013"
              />
            </div>
            <div>
              <span className={labelCls}>Departamento</span>
              <input
                className={`${inputCls} w-full`}
                value={empForm.department}
                onChange={(e) =>
                  setEmpForm({ ...empForm, department: e.target.value })
                }
                placeholder="Operaciones"
              />
            </div>
            <div>
              <span className={labelCls}>Nombre</span>
              <input
                className={`${inputCls} w-full`}
                value={empForm.firstName}
                onChange={(e) =>
                  setEmpForm({ ...empForm, firstName: e.target.value })
                }
                placeholder="Ana"
              />
            </div>
            <div>
              <span className={labelCls}>Apellido</span>
              <input
                className={`${inputCls} w-full`}
                value={empForm.lastName}
                onChange={(e) =>
                  setEmpForm({ ...empForm, lastName: e.target.value })
                }
                placeholder="Torres"
              />
            </div>
            <div>
              <span className={labelCls}>Entrada</span>
              <input
                type="time"
                className={`${inputCls} w-full`}
                value={empForm.scheduleIn}
                onChange={(e) =>
                  setEmpForm({ ...empForm, scheduleIn: e.target.value })
                }
              />
            </div>
            <div>
              <span className={labelCls}>Salida</span>
              <input
                type="time"
                className={`${inputCls} w-full`}
                value={empForm.scheduleOut}
                onChange={(e) =>
                  setEmpForm({ ...empForm, scheduleOut: e.target.value })
                }
              />
            </div>
            <div className="col-span-2">
              <span className={labelCls}>Tolerancia (min)</span>
              <input
                type="number"
                min={0}
                max={120}
                className={`${inputCls} w-full`}
                value={empForm.toleranceMinutes}
                onChange={(e) =>
                  setEmpForm({ ...empForm, toleranceMinutes: e.target.value })
                }
              />
            </div>
            <button
              type="button"
              onClick={() => void submitEmployee()}
              disabled={saving}
              className="col-span-2 inline-flex h-8 items-center justify-center gap-1.5 rounded-lg bg-mint text-xs font-semibold text-ink-950 transition hover:brightness-110 disabled:opacity-60"
            >
              <Users size={13} /> Guardar persona
            </button>
          </div>
        )}

        <ul className="mt-3 max-h-72 space-y-1.5 overflow-y-auto pr-1">
          {employees.map((e) => (
            <li
              key={e.id}
              className="flex items-center gap-2 rounded-lg border border-white/6 bg-white/[0.03] px-3 py-2 transition-colors hover:border-white/12"
            >
              <span className="font-mono text-[10px] text-mist-600">#{e.legajo}</span>
              <span className="truncate text-xs text-mist-200">
                {e.firstName} {e.lastName}
              </span>
              <span className="hidden truncate text-[10px] text-mist-500 sm:block">
                {e.department}
              </span>
              <span className="ml-auto shrink-0 font-mono text-[10px] text-mist-400">
                {e.scheduleIn}–{e.scheduleOut} · ±{e.toleranceMinutes}m
              </span>
            </li>
          ))}
        </ul>
      </article>
    </section>
  );
}
