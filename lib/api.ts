const PROXY = "/api/proxy";
console.log("NEXT_PUBLIC_BASE_URL =", process.env.NEXT_PUBLIC_BASE_URL);

interface ApiSuccess<T> {
  ok: true;
  data: T;
}

interface ApiError {
  ok: false;
  error: string;
}

type ApiResponse<T> = ApiSuccess<T> | ApiError;



async function post<T>(endpoint: string, body: Record<string, unknown>) {
  const res = await fetch(`${PROXY}?path=${encodeURIComponent(endpoint)}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify(body),
  });

  const text = await res.text();
  try {
    return JSON.parse(text) as ApiResponse<T>;
  } catch {
    throw new Error(text.slice(0, 200));
  }
}

async function get<T>(endpoint: string, params?: Record<string, string>) {
  const url = new URL(PROXY, window.location.origin);
  url.searchParams.set("path", endpoint);
  if (params) Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, v));

  const res = await fetch(url.toString(), { headers: { Accept: "application/json" } });

  const text = await res.text();
  try {
    return JSON.parse(text) as ApiResponse<T>;
  } catch {
    throw new Error(text.slice(0, 200));
  }
}

// ── Module 1: QR Presence ──

export interface QrGenerateResponse {
  qr_token: string;
  expires_at: string;
}

export function generateQr(course_id: string, session_id: string) {
  return post<QrGenerateResponse>("/presence/qr/generate", {
    course_id,
    session_id,
    ts: new Date().toISOString(),
  });
}

export interface CheckinResponse {
  presence_id: string;
  status: string;
}

export function checkin(payload: {
  user_id: string;
  device_id: string;
  course_id: string;
  session_id: string;
  qr_token: string;
}) {
  return post<CheckinResponse>("/presence/checkin", {
    ...payload,
    ts: new Date().toISOString(),
  });
}

export interface PresenceStatus {
  status: string;
  last_ts: string | null;
}

export function getPresenceStatus(user_id: string, course_id: string, session_id: string) {
  return get<PresenceStatus>("/presence/status", { user_id, course_id, session_id });
}

// ── Module 2: Accelerometer ──

// ── Module 2: Accelerometer ──

export interface AccelSample {
  t: string;   // ISO string
  x: number;
  y: number;
  z: number;
}

export function postAccel(device_id: string, samples: AccelSample[]) {
  return post<{ accepted: number }>("/telemetry/accel", {
    device_id,
    ts: new Date().toISOString(),
    samples,
  });
}

// Backend balas: { device_id, t, x, y, z }
export interface AccelLatest {
  device_id: string;
  t: string;
  x: number;
  y: number;
  z: number;
}

export function getAccelLatest(device_id: string) {
  return get<AccelLatest>("/telemetry/accel/latest", { device_id });
}
// ── Module 3: GPS ──

export function postGps(device_id: string, lat: number, lng: number, accuracy_m: number) {
  return post("/telemetry/gps", {
    device_id,
    ts: new Date().toISOString(),
    lat,
    lng,
    accuracy_m,
  });
}

export interface GpsLatest {
  lat: number;
  lng: number;
  accuracy_m: number;
  ts: string;
}

export function getGpsLatest(device_id: string) {
  return get<GpsLatest>("/telemetry/gps/latest", { device_id });
}

export interface GpsHistoryPoint {
  lat: number;
  lng: number;
  ts: string;
}

export function getGpsHistory(device_id: string, limit = 200) {
  return get<GpsHistoryData>("/telemetry/gps/history", { device_id, limit: String(limit) });
}

export interface GpsHistoryData {
  device_id: string;
  points: GpsHistoryPoint[];
}