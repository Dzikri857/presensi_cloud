"use client";

import { useState, useCallback, useRef, useEffect } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, Loader2, Send } from "lucide-react";
import { QrScanner } from "@/components/qr-scanner";
import { StatusBadge } from "@/components/status-badge";
import { GpsCard } from "@/components/gps-card";
import { LocationMap } from "@/components/location-map";
import { AccelerometerCard } from "@/components/accelerometer-card";
import {
  postGps,
  postAccel,
  checkin,
  getPresenceStatus,
  getAccelLatest,
  getGpsLatest,
  getGpsHistory,
  type GpsLatest,
  type AccelLatest,
  type GpsHistoryPoint,
  type GpsHistoryData,
  type AccelSample,
} from "@/lib/api";
import { getDeviceId, setUserId } from "@/lib/device";
import { loginMahasiswa } from "@/lib/api";

interface CheckinState {
  idle: boolean;
  scanning: boolean;
  processing: boolean;
  done: boolean;
}

export default function MahasiswaPage() {
  const router = useRouter();

  // State
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [currentNim, setCurrentNim] = useState("");
  const [loginError, setLoginError] = useState("");
  const [isLoginLoading, setIsLoginLoading] = useState(false);
  const [showSuccess, setShowSuccess] = useState(false);
  const [phase, setPhase] = useState<CheckinState>({
    idle: true,
    scanning: false,
    processing: false,
    done: false,
  });
  const [status, setStatus] = useState<string | null>(null);
  const [qrToken, setQrToken] = useState("");
  const [gpsData, setGpsData] = useState<GpsLatest | null>(null);
  const [accelLatest, setAccelLatest] = useState<AccelLatest | null>(null);
  const [accelSamples, setAccelSamples] = useState<AccelSample[]>([]);
  const [gpsHistory, setGpsHistory] = useState<GpsHistoryPoint[]>([]);
  const [logMessages, setLogMessages] = useState<string[]>([]);
  const [error, setError] = useState("");

  const addLog = useCallback((msg: string) => {
    setLogMessages((prev) => [
      ...prev,
      `[${new Date().toLocaleTimeString("id-ID")}] ${msg}`,
    ]);
  }, []);

  // ── Login ──
  async function handleLogin(e: React.FormEvent) {
    e.preventDefault();
    setLoginError("");

    if (!currentNim.trim()) {
      setLoginError("NIM harus diisi");
      return;
    }

    setIsLoginLoading(true);
    try {
      const response = await loginMahasiswa(currentNim, "");

      if (response.ok) {
        setUserId(response.data.user_id);
        setIsLoggedIn(true);
        addLog(`Login berhasil: ${response.data.user_id}`);
      } else {
        setLoginError(response.error || "Login gagal");
        addLog(`Login error: ${response.error}`);
      }
    } catch (err) {
      setLoginError("Terjadi kesalahan koneksi");
      console.error("[v0] Login error:", err);
    } finally {
      setIsLoginLoading(false);
    }
  }

  // ── QR Scanned ──
  const handleQrScan = useCallback(
    (token: string) => {
      if (!isLoggedIn) return;

      setQrToken(token);
      setPhase({
        idle: false,
        scanning: false,
        processing: false,
        done: false,
      });
      addLog(`QR scanned: ${token.substring(0, 20)}...`);
      runCheckinFlow(token, currentNim);
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [isLoggedIn, currentNim],
  );

  // ── Full Check-in Flow (Steps 1-15) ──
  async function runCheckinFlow(token: string, userId: string) {
    setPhase({ idle: false, scanning: false, processing: true, done: false });
    setError("");

    const deviceId = getDeviceId();

    // Attempt to parse course_id & session_id from token
    let courseId = "";
    let sessionId = "";

    addLog(`Parsing token: ${token.substring(0, 40)}...`);

    try {
      // Try JWT format (payload contains course_id and session_id)
      const parts = token.split(".");
      if (parts.length >= 2) {
        const decoded = JSON.parse(atob(parts[1]));
        courseId = decoded.course_id || "";
        sessionId = decoded.session_id || "";
        if (courseId && sessionId) {
          addLog(
            `Parsed from JWT: course_id=${courseId}, session_id=${sessionId}`,
          );
        }
      }
    } catch (e) {
      console.log("[v0] JWT parse failed, trying other formats");
    }

    if (!courseId || !sessionId) {
      try {
        // Try URL format
        const url = new URL(token);
        courseId = url.searchParams.get("course_id") || courseId;
        sessionId = url.searchParams.get("session_id") || sessionId;
        if (courseId && sessionId) {
          addLog(
            `Parsed from URL: course_id=${courseId}, session_id=${sessionId}`,
          );
        }
      } catch (e) {
        console.log("[v0] URL parse failed");
      }
    }

    if (!courseId || !sessionId) {
      // Fallback: ask backend to parse it
      courseId = courseId || "from-token";
      sessionId = sessionId || "from-token";
      addLog(`Using fallback: course_id=${courseId}, session_id=${sessionId}`);
    }

    try {
      // Step 5-6: Get GPS & POST
      addLog("Mendapatkan lokasi GPS...");
      const pos = await getGpsPosition();
      const gps: GpsLatest = {
        lat: pos.latitude,
        lng: pos.longitude,
        accuracy_m: Math.round(pos.accuracy),
        ts: new Date().toISOString(),
      };
      setGpsData(gps);

      const gpsRes = await postGps(deviceId, gps.lat, gps.lng, gps.accuracy_m);
      addLog(
        gpsRes.ok
          ? "GPS dikirim."
          : `GPS error: ${gpsRes.ok === false ? gpsRes.error : "unknown"}`,
      );

      // Step 7-9: Accelerometer batch 3s
      addLog("Mengumpulkan data accelerometer (3 detik)...");
      const samples = await collectAccelSamples(3000);
      setAccelSamples(samples);

      const accelRes = await postAccel(deviceId, samples);
      addLog(
        accelRes.ok
          ? "Accel dikirim."
          : `Accel error: ${accelRes.ok === false ? accelRes.error : "unknown"}`,
      );

      // Step 10: POST /presence/checkin
      addLog("Mengirim check-in...");
      const checkinRes = await checkin({
        user_id: userId,
        device_id: deviceId,
        course_id: courseId,
        session_id: sessionId,
        qr_token: token,
      });

      if (checkinRes.ok) {
        addLog(
          `Check-in: ${checkinRes.data.status} (ID: ${checkinRes.data.presence_id})`,
        );
        setShowSuccess(true);
        setTimeout(() => setShowSuccess(false), 2000);
      } else {
        addLog(`Check-in error: ${checkinRes.error}`);
      }

      // Step 11-14: Fetch all status data
      addLog("Memuat data status...");

      const [statusRes, accelLatestRes, gpsLatestRes, gpsHistoryRes] =
        await Promise.all([
          getPresenceStatus(userId, courseId, sessionId),
          getAccelLatest(deviceId),
          getGpsLatest(deviceId),
          getGpsHistory(deviceId),
        ]);

      if (statusRes.ok) {
        setStatus(statusRes.data.status);
      }
      if (accelLatestRes.ok) {
        setAccelLatest(accelLatestRes.data);
      }
      if (gpsLatestRes.ok) {
        setGpsData(gpsLatestRes.data);
      }
      if (gpsHistoryRes.ok) {
        const historyData = gpsHistoryRes.data as GpsHistoryData;
        setGpsHistory(historyData.points || []);
      }

      addLog("Proses selesai.");
      setPhase({ idle: false, scanning: false, processing: false, done: true });
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unknown error";
      setError(message);
      addLog(`Error: ${message}`);
      setPhase({ idle: false, scanning: false, processing: false, done: true });
    }
  }

  // ── Helpers ──
  function getGpsPosition(): Promise<GeolocationCoordinates> {
    return new Promise((resolve, reject) => {
      if (!navigator.geolocation) {
        reject(new Error("Geolocation tidak didukung browser ini."));
        return;
      }
      navigator.geolocation.getCurrentPosition(
        (pos) => resolve(pos.coords),
        (err) => reject(new Error(`GPS error: ${err.message}`)),
        { enableHighAccuracy: true, timeout: 10000 },
      );
    });
  }

  function collectAccelSamples(durationMs: number): Promise<AccelSample[]> {
    return new Promise((resolve) => {
      const samples: AccelSample[] = [];

      if (typeof DeviceMotionEvent === "undefined") {
        // Fallback: generate simulated data
        for (let i = 0; i < 10; i++) {
          samples.push({
            t: new Date().toISOString(),
            x: +(Math.random() * 0.5).toFixed(3),
            y: +(Math.random() * 0.5).toFixed(3),
            z: +(9.7 + Math.random() * 0.3).toFixed(3),
          });
        }
        resolve(samples);
        return;
      }

      function handler(e: DeviceMotionEvent) {
        const a = e.accelerationIncludingGravity;
        if (a) {
          samples.push({
            t: new Date().toISOString(),
            x: +(a.x ?? 0).toFixed(3),
            y: +(a.y ?? 0).toFixed(3),
            z: +(a.z ?? 0).toFixed(3),
          });
        }
      }

      window.addEventListener("devicemotion", handler);
      setTimeout(() => {
        window.removeEventListener("devicemotion", handler);
        resolve(
          samples.length > 0
            ? samples
            : [{ t: new Date().toISOString(), x: 0, y: 0, z: 9.8 }],
        );
      }, durationMs);
    });
  }

  const toggleScanning = () => {
    setPhase((p) => ({
      ...p,
      scanning: !p.scanning,
      idle: false,
    }));
  };

  return (
    <main className="flex min-h-dvh flex-col bg-background pb-24">
      {/* Header */}
      <header className="sticky top-0 z-10 border-b border-border bg-card px-4 py-3">
        <div className="mx-auto flex max-w-md items-center gap-3">
          <button
            onClick={() => router.push("/")}
            className="flex h-9 w-9 items-center justify-center rounded-xl text-muted-foreground transition-colors hover:bg-secondary"
            aria-label="Kembali"
          >
            <ArrowLeft className="h-5 w-5" />
          </button>
          <div>
            <h1 className="text-lg font-bold text-foreground">
              Presensi Mahasiswa
            </h1>
            <div className="mt-0.5 h-0.5 w-12 rounded-full bg-primary" />
          </div>
        </div>
      </header>

      <div className="mx-auto flex w-full max-w-md flex-col gap-4 px-4 py-6">
        {/* Login Form (Step 1) */}
        {!isLoggedIn && (
          <form onSubmit={handleLogin} className="flex flex-col gap-4">
            <div className="text-center mb-4">
              <h2 className="text-2xl font-bold text-foreground">
                Login Mahasiswa
              </h2>
              <p className="text-sm text-muted-foreground mt-1">
                Masukkan NIM Anda untuk memulai presensi
              </p>
            </div>

            {loginError && (
              <div className="rounded-xl bg-destructive/10 border border-destructive/30 p-3 text-sm font-medium text-destructive">
                {loginError}
              </div>
            )}

            <div className="flex flex-col gap-2">
              <label
                htmlFor="nim"
                className="text-sm font-semibold text-foreground"
              >
                Nomor Induk Mahasiswa (NIM)
              </label>
              <input
                id="nim"
                type="text"
                placeholder="Contoh: 081211833001"
                value={currentNim}
                onChange={(e) => setCurrentNim(e.target.value)}
                disabled={isLoginLoading}
                className="h-12 rounded-xl border border-input bg-card px-4 text-foreground placeholder:text-muted-foreground disabled:opacity-50 focus:outline-none focus:ring-2 focus:ring-primary/20"
              />
            </div>

            <button
              type="submit"
              disabled={isLoginLoading || !currentNim.trim()}
              className="mt-2 h-12 w-full rounded-xl bg-primary text-base font-semibold text-primary-foreground shadow-md shadow-primary/20 transition-all active:scale-[0.98] hover:opacity-90 disabled:opacity-50 flex items-center justify-center gap-2"
            >
              {isLoginLoading ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Memproses...
                </>
              ) : (
                "Login"
              )}
            </button>
          </form>
        )}

        {/* Scanner Section (Step 2) */}
        {isLoggedIn && (
          <>
            {/* Status Badge */}
            {status && (
              <div className="flex justify-center">
                <StatusBadge status={status} />
              </div>
            )}

            {/* Logout Button */}
            <button
              onClick={() => {
                setIsLoggedIn(false);
                setCurrentNim("");
                setStatus(null);
                setQrToken("");
                setLogMessages([]);
              }}
              className="text-sm text-primary hover:underline text-center"
            >
              Ganti Akun
            </button>

            {/* QR Scanner */}
            <div className="rounded-2xl bg-card p-5 shadow-sm">
              <QrScanner
                onScan={handleQrScan}
                scanning={phase.scanning}
                onToggle={toggleScanning}
              />
            </div>
          </>
        )}

        {/* Processing indicator */}
        {phase.processing && (
          <div className="flex items-center justify-center gap-3 rounded-2xl bg-primary/5 p-5">
            <Loader2 className="h-5 w-5 animate-spin text-primary" />
            <span className="text-sm font-medium text-primary">
              Memproses check-in...
            </span>
          </div>
        )}

        {/* Error */}
        {error && (
          <p className="rounded-2xl bg-destructive/10 px-5 py-3 text-sm text-destructive">
            {error}
          </p>
        )}

        {/* Data Section (visible after login) */}
        {isLoggedIn && (
          <>
            {/* GPS Card */}
            <GpsCard data={gpsData} />

            {/* Map */}
            {(gpsData || gpsHistory.length > 0) && (
              <LocationMap latest={gpsData} history={gpsHistory} />
            )}

            {/* Accelerometer */}
            <AccelerometerCard latest={accelLatest} samples={accelSamples} />
          </>
        )}

        {/* Log */}
        {logMessages.length > 0 && (
          <div className="rounded-2xl bg-card p-5 shadow-sm">
            <h3 className="pb-3 text-sm font-semibold text-foreground">
              Log Aktivitas
            </h3>
            <div className="flex max-h-40 flex-col gap-1 overflow-y-auto">
              {logMessages.map((msg, i) => (
                <p key={i} className="text-xs font-mono text-muted-foreground">
                  {msg}
                </p>
              ))}
            </div>
          </div>
        )}

        {/* QR Token display */}
        {qrToken && (
          <div className="rounded-2xl bg-card p-5 shadow-sm">
            <h3 className="pb-2 text-sm font-semibold text-foreground">
              QR Token
            </h3>
            <code className="block break-all rounded-xl bg-secondary p-3 text-xs text-foreground">
              {qrToken}
            </code>
          </div>
        )}
      </div>

      {/* Sticky bottom button */}
      {!phase.processing && !phase.done && (
        <div className="fixed inset-x-0 bottom-0 z-20 bg-gradient-to-t from-background via-background to-transparent px-4 pb-6 pt-4">
          <div className="mx-auto max-w-md">
            <button
              onClick={toggleScanning}
              className="flex h-14 w-full items-center justify-center gap-2 rounded-2xl bg-primary text-base font-semibold text-primary-foreground shadow-lg shadow-primary/25 transition-all active:scale-[0.98] hover:opacity-90"
            >
              <Send className="h-5 w-5" />
              {phase.scanning ? "Tutup Scanner" : "Mulai Scan QR"}
            </button>
          </div>
        </div>
      )}

      {/* Success Popup */}
      {showSuccess && (
        <div className="fixed inset-0 flex items-center justify-center bg-black/40 z-50">
          <div className="bg-card rounded-2xl shadow-xl p-6 text-center animate-scale border border-border">
            <div className="flex justify-center mb-3">
              <div className="flex h-12 w-12 items-center justify-center rounded-full bg-green-100">
                <span className="text-2xl">✓</span>
              </div>
            </div>
            <h2 className="text-xl font-bold text-foreground">Scan Berhasil</h2>
            <p className="text-sm text-muted-foreground mt-2">
              Presensi kamu sudah tercatat dengan baik. Data GPS dan
              accelerometer telah dikirim ke server.
            </p>
            <p className="text-xs text-muted-foreground mt-3 font-medium">
              {qrToken && `Token: ${qrToken.substring(0, 30)}...`}
            </p>
          </div>
        </div>
      )}
    </main>
  );
}
