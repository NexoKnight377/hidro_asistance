import { NextResponse } from "next/server";

import { db } from "@/db";
import { employees } from "@/db/schema";

export const dynamic = "force-dynamic";

const HHMM = /^([01]\d|2[0-3]):[0-5]\d$/;

/** GET /api/employees — listado de personal activo e inactivo. */
export async function GET() {
  const rows = await db.select().from(employees).orderBy(employees.legajo);
  return NextResponse.json({ employees: rows });
}

/** POST /api/employees — alta de personal con horario y tolerancia. */
export async function POST(req: Request) {
  const body = (await req.json().catch(() => null)) as Record<
    string,
    unknown
  > | null;
  if (!body) {
    return NextResponse.json({ error: "Cuerpo JSON inválido" }, { status: 400 });
  }

  const legajo = String(body.legajo ?? "").trim();
  const firstName = String(body.firstName ?? "").trim();
  const lastName = String(body.lastName ?? "").trim();
  const department = String(body.department ?? "").trim();
  const scheduleIn = String(body.scheduleIn ?? "09:00").trim();
  const scheduleOut = String(body.scheduleOut ?? "18:00").trim();
  const toleranceMinutes = Number(body.toleranceMinutes ?? 10);

  if (!legajo || !firstName || !lastName || !department) {
    return NextResponse.json(
      { error: "legajo, firstName, lastName y department son obligatorios" },
      { status: 400 },
    );
  }
  if (!HHMM.test(scheduleIn) || !HHMM.test(scheduleOut)) {
    return NextResponse.json(
      { error: "scheduleIn y scheduleOut deben tener formato HH:MM" },
      { status: 400 },
    );
  }

  try {
    const [row] = await db
      .insert(employees)
      .values({
        legajo,
        firstName,
        lastName,
        department,
        photoUrl: body.photoUrl ? String(body.photoUrl) : null,
        scheduleIn,
        scheduleOut,
        toleranceMinutes: Number.isFinite(toleranceMinutes)
          ? Math.max(0, Math.min(120, Math.round(toleranceMinutes)))
          : 10,
      })
      .returning();
    return NextResponse.json({ employee: row }, { status: 201 });
  } catch (err) {
    const e = err as { code?: string; cause?: { code?: string }; message?: string };
    const code = e?.code ?? e?.cause?.code;
    const message = e?.message ?? "";
    if (code === "23505" || /duplicate key value|unique constraint/i.test(message)) {
      return NextResponse.json(
        { error: `Ya existe una persona con el legajo ${legajo}` },
        { status: 409 },
      );
    }
    return NextResponse.json(
      { error: "No se pudo crear el registro" },
      { status: 500 },
    );
  }
}
