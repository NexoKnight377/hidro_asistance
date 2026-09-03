import { NextResponse } from "next/server";

import { db } from "@/db";
import { accessDevices } from "@/db/schema";

export const dynamic = "force-dynamic";

const IP_RE = /^[\w.: -]{3,60}$/;

/** GET /api/devices — terminales configurados (credenciales enmascaradas). */
export async function GET() {
  const rows = await db.select().from(accessDevices).orderBy(accessDevices.id);
  return NextResponse.json({
    devices: rows.map((row) => ({
      ...row,
      password: undefined,
      passwordSet: row.password.length > 0,
    })),
  });
}

/** POST /api/devices — alta de terminal biométrico (config ISAPI). */
export async function POST(req: Request) {
  const body = (await req.json().catch(() => null)) as Record<
    string,
    unknown
  > | null;
  if (!body) {
    return NextResponse.json({ error: "Cuerpo JSON inválido" }, { status: 400 });
  }

  const name = String(body.name ?? "").trim();
  const ipAddress = String(body.ipAddress ?? "").trim();
  const port = Number(body.port ?? 80);
  const username = String(
    body.username ?? process.env.HIK_DEFAULT_USER ?? "admin",
  );
  const password = String(
    body.password ?? process.env.HIK_DEFAULT_PASS ?? "",
  );
  const location = String(body.location ?? "").trim();
  const deviceType = String(body.deviceType ?? "mixto");
  const simulate =
    body.simulate !== undefined
      ? Boolean(body.simulate)
      : process.env.ISAPI_SIMULATE !== "false";

  if (!name || !IP_RE.test(ipAddress) || !location) {
    return NextResponse.json(
      { error: "name, ipAddress y location son obligatorios" },
      { status: 400 },
    );
  }
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    return NextResponse.json({ error: "port inválido (1-65535)" }, { status: 400 });
  }
  if (!["entrada", "salida", "mixto"].includes(deviceType)) {
    return NextResponse.json(
      { error: "deviceType debe ser entrada, salida o mixto" },
      { status: 400 },
    );
  }

  try {
    const [row] = await db
      .insert(accessDevices)
      .values({
        name,
        ipAddress,
        port,
        username,
        password,
        location,
        deviceType,
        simulate,
      })
      .returning();
    return NextResponse.json(
      { device: { ...row, password: undefined, passwordSet: row.password.length > 0 } },
      { status: 201 },
    );
  } catch {
    return NextResponse.json(
      { error: "No se pudo crear el terminal" },
      { status: 500 },
    );
  }
}
