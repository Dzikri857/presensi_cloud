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
  type AccelSample,
} from "@/lib/api";
import { getDeviceId, getUserId } from "@/lib/device";

interface CheckinState {
  idle: boolean;
  scanning: boolean;
  processing: boolean;
  done: boolean;
}

export default function MahasiswaPage() {
  const router = useRouter();

  // State
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
    setLogMessages((prev) => [...prev, `[${new Date().toLocaleTimeString("id-ID")}] ${msg}`]);
  }, []);

  // User ID modal
  const [showUserIdModal, setShowUserIdModal] = useState(false);
  const [userIdInput, setUserIdInput] = useState("");
  const pendingTokenRef = useRef("");

  useEffect(() => {
    // Check if user_id exists
    const uid = getUserId();
    if (uid) setUserIdInput(uid);
  }, []);

  // ── QR Scanned ──
  const handleQrScan = useCallback(
    (token: string) => {
      setQrToken(token);
      setPhase({ idle: false, scanning: false, processing: false, done: false });
      addLog(`QR scanned: ${token.substring(0, 20)}...`);

      const uid = getUserId();
      if (!uid) {
        pendingTokenRef.current = token;
        setShowUserIdModal(true);
      } else {
        runCheckinFlow(token, uid);
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    []
  );

  function handleUserIdSubmit() {
    if (!userIdInput.trim()) return;
    if (typeof window !== "undefined") {
      localStorage.setItem("user_id", userIdInput.trim());
    }
    setShowUserIdModal(false);
    runCheckinFlow(pendingTokenRef.current, userIdInput.trim());
  }

  // ── Full Check-in Flow (Steps 1-15) ──
  async function runCheckinFlow(token: string, userId: string) {
    setPhase({ idle: false, scanning: false, processing: true, done: false });
    setError("");

    const deviceId = getDeviceId();

    // Attempt to parse course_id & session_id from token
    // SESUAI MODUL: course_id & session_id harus dikirim eksplisit
const courseId = "cloud-101";
const sessionId = "sesi-02";

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
      addLog(gpsRes.ok ? "GPS dikirim." : `GPS error: ${gpsRes.ok === false ? gpsRes.error : "unknown"}`);

      // Step 7-9: Accelerometer batch 3s
      addLog("Mengumpulkan data accelerometer (3 detik)...");
      const samples = await collectAccelSamples(3000);
      setAccelSamples(samples);

      const accelRes = await postAccel(deviceId, samples);
      addLog(accelRes.ok ? "Accel dikirim." : `Accel error: ${accelRes.ok === false ? accelRes.error : "unknown"}`);

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
  addLog(`Check-in sukses: ${checkinRes.data.status} (presence_id: ${checkinRes.data.presence_id})`);
} else {
  addLog(`Check-in error: ${checkinRes.error}`);
}

      // Step 11-14: Fetch all status data
      addLog("Memuat data status...");

      const [statusRes, accelLatestRes, gpsLatestRes, gpsHistoryRes] = await Promise.all([
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
  const points = (gpsHistoryRes.data as any).points ?? [];
  setGpsHistory(points);
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
        { enableHighAccuracy: true, timeout: 10000 }
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
        resolve(samples.length > 0 ? samples : [
          { t: new Date().toISOString(), x: 0, y: 0, z: 9.8 },
        ]);
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
            <h1 className="text-lg font-bold text-foreground">Presensi Mahasiswa</h1>
            <div className="mt-0.5 h-0.5 w-12 rounded-full bg-primary" />
          </div>
        </div>
      </header>

      <div className="mx-auto flex w-full max-w-md flex-col gap-4 px-4 py-6">
        {/* Status Badge */}
        {status && (
          <div className="flex justify-center">
            <StatusBadge status={status} />
          </div>
        )}

        {/* QR Scanner */}
        <div className="rounded-2xl bg-card p-5 shadow-sm">
          <QrScanner
            onScan={handleQrScan}
            scanning={phase.scanning}
            onToggle={toggleScanning}
          />
        </div>

        {/* Processing indicator */}
        {phase.processing && (
          <div className="flex items-center justify-center gap-3 rounded-2xl bg-primary/5 p-5">
            <Loader2 className="h-5 w-5 animate-spin text-primary" />
            <span className="text-sm font-medium text-primary">Memproses check-in...</span>
          </div>
        )}

        {/* Error */}
        {error && (
          <p className="rounded-2xl bg-destructive/10 px-5 py-3 text-sm text-destructive">
            {error}
          </p>
        )}

        {/* GPS Card */}
        <GpsCard data={gpsData} />

        {/* Map */}
        {(gpsData || gpsHistory.length > 0) && (
          <LocationMap latest={gpsData} history={gpsHistory} />
        )}

        {/* Accelerometer */}
        <AccelerometerCard latest={accelLatest} samples={accelSamples} />

        {/* Log */}
        {logMessages.length > 0 && (
          <div className="rounded-2xl bg-card p-5 shadow-sm">
            <h3 className="pb-3 text-sm font-semibold text-foreground">Log Aktivitas</h3>
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
            <h3 className="pb-2 text-sm font-semibold text-foreground">QR Token</h3>
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

      {/* User ID Modal */}
      {showUserIdModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-foreground/50 px-4">
          <div className="w-full max-w-sm rounded-2xl bg-card p-6 shadow-xl">
            <h2 className="pb-1 text-lg font-bold text-foreground">Masukkan User ID</h2>
            <p className="pb-4 text-sm text-muted-foreground">
              User ID diperlukan untuk presensi.
            </p>
            <input
              type="text"
              placeholder="Contoh: mhs001"
              value={userIdInput}
              onChange={(e) => setUserIdInput(e.target.value)}
              className="mb-4 h-12 w-full rounded-xl border border-input bg-background px-4 text-foreground placeholder:text-muted-foreground focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
              autoFocus
            />
            <button
              onClick={handleUserIdSubmit}
              disabled={!userIdInput.trim()}
              className="flex h-12 w-full items-center justify-center rounded-2xl bg-primary text-sm font-semibold text-primary-foreground transition-all active:scale-[0.98] hover:opacity-90 disabled:opacity-60"
            >
              Simpan & Lanjutkan
            </button>
          </div>
        </div>
      )}
    </main>
  );
}
