import { createHash, randomBytes } from "node:crypto";

/**
 * Cliente Hikvision ISAPI con HTTP Digest Authentication (RFC 7616, MD5/qop=auth).
 * Endpoints usados:
 *   POST /ISAPI/AccessControl/AcsEvent?format=json      -> marcaciones
 *   POST /ISAPI/AccessControl/UserInfo/Search?format=json -> personal del panel
 *   PUT  /ISAPI/System/time                              -> sincronizar hora
 */

export interface DeviceConfig {
  id?: number;
  name: string;
  ipAddress: string;
  port: number;
  username: string;
  password: string;
  deviceType: string;
}

export interface DigestChallenge {
  realm: string;
  nonce: string;
  qop?: string;
  opaque?: string;
}

export interface RawAcsEvent {
  employeeNo: string;
  time: Date;
  majorMinor: string;
  eventId: string;
}

export interface RawUserInfo {
  employeeNo: string;
  name: string;
  department: string | null;
}

const md5 = (input: string) =>
  createHash("md5").update(input, "utf8").digest("hex");

export function parseChallenge(header: string): DigestChallenge | null {
  const match = /Digest\s+(.*)$/i.exec(header);
  if (!match) return null;
  const params: Record<string, string> = {};
  const re = /(\w+)=(?:"([^"]*)"|([^,\s]+))/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(match[1]))) {
    params[m[1].toLowerCase()] = m[2] ?? m[3] ?? "";
  }
  if (!params.realm || !params.nonce) return null;
  return {
    realm: params.realm,
    nonce: params.nonce,
    qop: params.qop?.split(",")[0].trim(),
    opaque: params.opaque,
  };
}

export function digestAuthHeader(
  method: string,
  uri: string,
  challenge: DigestChallenge,
  username: string,
  password: string,
): string {
  const ha1 = md5(`${username}:${challenge.realm}:${password}`);
  const ha2 = md5(`${method}:${uri}`);
  const nc = "00000001";
  const cnonce = randomBytes(8).toString("hex");
  const response = challenge.qop
    ? md5(`${ha1}:${challenge.nonce}:${nc}:${cnonce}:${challenge.qop}:${ha2}`)
    : md5(`${ha1}:${challenge.nonce}:${ha2}`);

  let header =
    `Digest username="${username}", realm="${challenge.realm}", ` +
    `nonce="${challenge.nonce}", uri="${uri}", algorithm=MD5`;
  if (challenge.qop) header += `, qop=${challenge.qop}, nc=${nc}, cnonce="${cnonce}"`;
  header += `, response="${response}"`;
  if (challenge.opaque) header += `, opaque="${challenge.opaque}"`;
  return header;
}

async function requestWithDigest(
  device: DeviceConfig,
  method: "GET" | "POST" | "PUT",
  path: string,
  body?: unknown,
  isXml = false,
): Promise<Response> {
  const url = `http://${device.ipAddress}:${device.port}${path}`;
  const timeoutMs = Number(process.env.ISAPI_TIMEOUT_MS ?? 30000);
  
  const contentType = isXml ? "application/xml" : "application/json";
  const formattedBody = body
    ? (typeof body === "string" ? body : JSON.stringify(body))
    : undefined;

  const init = (auth?: string): RequestInit => ({
    method,
    headers: {
      Accept: isXml ? "application/xml, */*" : "application/json",
      ...(body ? { "Content-Type": contentType } : {}),
      ...(auth ? { Authorization: auth } : {}),
    },
    body: formattedBody,
    signal: AbortSignal.timeout(timeoutMs),
  });

  const first = await fetch(url, init());
  if (first.status !== 401) return first;
  const challenge = parseChallenge(first.headers.get("www-authenticate") ?? "");
  if (!challenge) return first;
  return fetch(url, init(digestAuthHeader(method, path, challenge, device.username, device.password)));
}

/** Marcaciones del terminal desde AcsEvent. */
export async function fetchAcsEvents(
  device: DeviceConfig,
  since: Date,
): Promise<RawAcsEvent[]> {
  const path = "/ISAPI/AccessControl/AcsEvent?format=json";
  const res = await requestWithDigest(device, "POST", path, {
    AcsEventParamData: {
      searchID: randomBytes(10).toString("hex"),
      maxResults: 500,
      eventType: "all",
      startTime: since.toISOString(),
      endTime: new Date().toISOString(),
    },
  });
  if (!res.ok) {
    throw new Error(`ISAPI AcsEvent respondió ${res.status} en ${device.ipAddress}`);
  }
  const json = (await res.json()) as Record<string, unknown>;
  const list =
    (json?.AcsEventList as Record<string, unknown>[]) ??
    (json?.AccessControlEventList as Record<string, unknown>[]) ??
    [];
  return list
    .map((ev) => {
      const rawTime = String(ev.localTime ?? ev.time ?? "");
      const parsed = new Date(rawTime);
      return {
        employeeNo: String(ev.employeeNoString ?? ev.employeeNo ?? ""),
        time: parsed,
        majorMinor: `${ev.majorEventType ?? ""}:${ev.subEventType ?? ""}`,
        eventId: String(ev.eventID ?? ev.sequence ?? `${rawTime}-${ev.employeeNo ?? ""}`),
      };
    })
    .filter((ev) => ev.employeeNo !== "" && !Number.isNaN(ev.time.getTime()));
}

/** Personal cargado en el panel del terminal (UserInfo/Search) con paginación ISAPI. */
export async function fetchUsers(device: DeviceConfig): Promise<RawUserInfo[]> {
  const path = "/ISAPI/AccessControl/UserInfo/Search?format=json";
  const allUsers: RawUserInfo[] = [];
  let position = 0;
  const maxResults = 50;

  while (true) {
    const res = await requestWithDigest(device, "POST", path, {
      UserInfoSearchCond: {
        searchID: randomBytes(10).toString("hex"),
        maxResults: maxResults,
        searchResultPosition: position,
      },
    });

    if (!res.ok) {
      throw new Error(`ISAPI UserInfo respondió ${res.status} en ${device.ipAddress}`);
    }

    const json = (await res.json()) as Record<string, unknown>;
    const searchData = (json?.UserInfoSearch as Record<string, unknown>) ?? {};
    const list = (searchData?.UserInfo as Record<string, unknown>[]) ?? [];

    const mappedUsers: RawUserInfo[] = list
      .map((u) => ({
        employeeNo: String(u.employeeNo ?? ""),
        name: String(u.name ?? ""),
        department: u.department ? String(u.department) : null,
      }))
      .filter((u) => u.employeeNo !== "");

    allUsers.push(...mappedUsers);

    // Si el terminal ya no reporta estado 'MORE' o no retornó más usuarios, salimos
    if (searchData?.responseStatusStrg !== "MORE" || list.length === 0) {
      break;
    }

    position += list.length;
  }

  return allUsers;
}

/**
 * Sincroniza la fecha y hora del biométrico Hikvision con la hora local del servidor.
 */
export async function syncDeviceTime(device: DeviceConfig): Promise<boolean> {
  const path = "/ISAPI/System/time";

  const date = new Date();
  const pad = (n: number) => n.toString().padStart(2, "0");
  const localTime = `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`;

  const xmlData = `<?xml version="1.0" encoding="UTF-8"?>
<Time xmlns="http://www.hikvision.com/ver20/XMLSchema" version="2.0">
  <timeMode>manual</timeMode>
  <localTime>${localTime}</localTime>
  <timeZone>CST-4:00</timeZone>
</Time>`;

  const res = await requestWithDigest(device, "PUT", path, xmlData, true);

  if (!res.ok) {
    console.error(`Error al sincronizar hora con el biométrico (${device.ipAddress}): Status ${res.status}`);
    return false;
  }

  return true;
}

/**
 * Heurística de mapeo evento ISAPI -> tipo de marcación.
 * Los terminales Hikvision reportan apertura de puerta; el sentido se
 * resuelve con el device_type configurado y la ventana horaria del día.
 */
export function classifyRawEvent(
  time: Date,
  deviceType: string,
  seenToday: Set<string>,
): "check_in" | "check_out" | "lunch_out" | "lunch_in" {
  const hour = time.getUTCHours();
  if (deviceType === "entrada") {
    if (!seenToday.has("check_in")) return "check_in";
    if (!seenToday.has("lunch_out") && hour >= 11 && hour <= 15) return "lunch_out";
    if (seenToday.has("lunch_out") && !seenToday.has("lunch_in")) return "lunch_in";
    return "check_in";
  }
  if (deviceType === "salida") {
    if (!seenToday.has("check_in") && hour < 12) return "check_in";
    if (seenToday.has("check_in") && !seenToday.has("check_out")) return "check_out";
    return "check_out";
  }
  // mixto
  if (!seenToday.has("check_in")) return "check_in";
  if (!seenToday.has("lunch_out") && hour >= 11 && hour <= 15) return "lunch_out";
  if (seenToday.has("lunch_out") && !seenToday.has("lunch_in") && hour <= 16)
    return "lunch_in";
  return "check_out";
}