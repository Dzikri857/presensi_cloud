"use client";

import { useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, Loader2, Send, QrCode, Users, CheckCircle2 } from "lucide-react";
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

interface AttendanceRecord {
  nim: string;
  status: string;
  timestamp: string;
}

export default function MahasiswaPage() {
  const router = useRouter();

  // State - New flow: Scan QR first, then input NIM
  const [qrToken, setQrToken] = useState("");
  const [qrScanned, setQrScanned] = useState(false);
  const [currentNim, setCurrentNim] = useState("");
  const [nimError, setNimError] = useState("");
  const [isProcessing, setIsProcessing] = useState(false);
  const [showSuccess, setShowSuccess] = useState(false);
  const [attendanceList, setAttendanceList] = useState<AttendanceRecord[]>([]);
  
  const [phase, setPhase] = useState<CheckinState>({
    idle: true,
    scanning: false,
    processing: false,
    done: false,
  });
  const [status, setStatus] = useState<string | null>(null);
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

  // ── QR Scanned - Now just stores the token, doesn't process yet ──
  const handleQrScan = useCallback(
    (token: string) => {
      setQrToken(token);
      setQrScanned(true);
      setPhase({
        idle: false,
        scanning: false,
        processing: false,
        done: false,
      });
      addLog(`QR scanned: ${token.substring(0, 20)}...`);
    },
    [addLog],
  );

  // ── Handle NIM Submit - Process check-in for this student ──
  async function handleNimSubmit(e: React.FormEvent) {
    e.preventDefault();
    setNimError("");

    if (!currentNim.trim()) {
      setNimError("NIM harus diisi");
      return;
    }

    // Check if this NIM already checked in with this QR
    if (attendanceList.some((record) => record.nim === currentNim.trim())) {
      setNimError("NIM ini sudah melakukan presensi");
      return;
    }

    setIsProcessing(true);
    
    try {
      // Login first
      const loginRes = await loginMahasiswa(currentNim, "");
      if (!loginRes.ok) {
        setNimError(loginRes.error || "NIM tidak valid");
        setIsProcessing(false);
        return;
      }

      setUserId(loginRes.data.user_id);
      addLog(`Login berhasil: ${loginRes.data.user_id}`);

      // Run check-in flow
      await runCheckinFlow(qrToken, currentNim);
    } catch (err) {
      setNimError("Terjadi kesalahan koneksi");
      console.error("Submit error:", err);
      setIsProcessing(false);
    }
  }

  // ── Full Check-in Flow for a single student ──
  async function runCheckinFlow(token: string, nim: string) {
    setPhase({ idle: false, scanning: false, processing: true, done: false });
    setError("");

    const deviceId = getDeviceId();
    const userId = nim;

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
      console.log("JWT parse failed, trying other formats");
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
        console.log("URL parse failed");
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
        
        // Add to attendance list
        setAttendanceList((prev) => [
          ...prev,
          {
            nim: nim,
            status: checkinRes.data.status,
            timestamp: new Date().toLocaleTimeString("id-ID"),
          },
        ]);
        
        setShowSuccess(true);
        setTimeout(() => setShowSuccess(false), 2000);
        
        // Reset NIM input for next student
        setCurrentNim("");
      } else {
        addLog(`Check-in error: ${checkinRes.error}`);
        setNimError(checkinRes.error || "Gagal melakukan presensi");
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
      setPhase({ idle: false, scanning: false, processing: false, done: false });
      setIsProcessing(false);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unknown error";
      setError(message);
      addLog(`Error: ${message}`);
      setPhase({ idle: false, scanning: false, processing: false, done: false });
      setIsProcessing(false);
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
        {/* Step 1: Scan QR First */}
        {!qrScanned && (
          <>
            <div className="text-center mb-2">
              <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-primary/10">
                <QrCode className="h-8 w-8 text-primary" />
              </div>
              <h2 className="text-2xl font-bold text-foreground">
                Scan QR Presensi
              </h2>
              <p className="text-sm text-muted-foreground mt-1">
                Scan QR Code dari dosen untuk memulai presensi
              </p>
            </div>

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

        {/* Step 2: After QR Scanned - Input NIM */}
        {qrScanned && (
          <>
            {/* QR Active Indicator */}
            <div className="flex items-center gap-3 rounded-2xl bg-green-50 dark:bg-green-950/30 border border-green-200 dark:border-green-900 p-4">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-green-100 dark:bg-green-900">
                <CheckCircle2 className="h-5 w-5 text-green-600 dark:text-green-400" />
              </div>
              <div className="flex-1">
                <p className="text-sm font-semibold text-green-800 dark:text-green-200">
                  QR Code Aktif
                </p>
                <p className="text-xs text-green-600 dark:text-green-400">
                  Masukkan NIM untuk presensi
                </p>
              </div>
              <button
                onClick={() => {
                  setQrScanned(false);
                  setQrToken("");
                  setAttendanceList([]);
                  setCurrentNim("");
                  setLogMessages([]);
                }}
                className="text-xs text-green-700 dark:text-green-300 hover:underline"
              >
                Scan Ulang
              </button>
            </div>

            {/* NIM Input Form */}
            <form onSubmit={handleNimSubmit} className="flex flex-col gap-4 rounded-2xl bg-card p-5 shadow-sm">
              <div className="flex items-center gap-2 mb-2">
                <Users className="h-5 w-5 text-primary" />
                <h3 className="text-base font-semibold text-foreground">
                  Input NIM Mahasiswa
                </h3>
              </div>

              {nimError && (
                <div className="rounded-xl bg-destructive/10 border border-destructive/30 p-3 text-sm font-medium text-destructive">
                  {nimError}
                </div>
              )}

              <div className="flex flex-col gap-2">
                <label
                  htmlFor="nim"
                  className="text-sm font-medium text-foreground"
                >
                  Nomor Induk Mahasiswa (NIM)
                </label>
                <input
                  id="nim"
                  type="text"
                  placeholder="Contoh: 081211833001"
                  value={currentNim}
                  onChange={(e) => setCurrentNim(e.target.value)}
                  disabled={isProcessing}
                  className="h-12 rounded-xl border border-input bg-background px-4 text-foreground placeholder:text-muted-foreground disabled:opacity-50 focus:outline-none focus:ring-2 focus:ring-primary/20"
                  autoFocus
                />
              </div>

              <button
                type="submit"
                disabled={isProcessing || !currentNim.trim()}
                className="h-12 w-full rounded-xl bg-primary text-base font-semibold text-primary-foreground shadow-md shadow-primary/20 transition-all active:scale-[0.98] hover:opacity-90 disabled:opacity-50 flex items-center justify-center gap-2"
              >
                {isProcessing ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Memproses Presensi...
                  </>
                ) : (
                  <>
                    <Send className="h-4 w-4" />
                    Kirim Presensi
                  </>
                )}
              </button>
            </form>

            {/* Attendance List */}
            {attendanceList.length > 0 && (
              <div className="rounded-2xl bg-card p-5 shadow-sm">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-sm font-semibold text-foreground">
                    Daftar Presensi
                  </h3>
                  <span className="rounded-full bg-primary/10 px-3 py-1 text-xs font-semibold text-primary">
                    {attendanceList.length} mahasiswa
                  </span>
                </div>
                <div className="flex flex-col gap-2 max-h-60 overflow-y-auto">
                  {attendanceList.map((record, index) => (
                    <div
                      key={record.nim}
                      className="flex items-center justify-between rounded-xl bg-secondary/50 px-4 py-3"
                    >
                      <div className="flex items-center gap-3">
                        <span className="flex h-7 w-7 items-center justify-center rounded-full bg-primary/10 text-xs font-semibold text-primary">
                          {index + 1}
                        </span>
                        <div>
                          <p className="text-sm font-medium text-foreground">
                            {record.nim}
                          </p>
                          <p className="text-xs text-muted-foreground">
                            {record.timestamp}
                          </p>
                        </div>
                      </div>
                      <StatusBadge status={record.status} />
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Status Badge */}
            {status && (
              <div className="flex justify-center">
                <StatusBadge status={status} />
              </div>
            )}
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

        {/* Data Section (visible after QR scanned and at least one attendance) */}
        {qrScanned && attendanceList.length > 0 && (
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

      {/* Sticky bottom button - only show when not yet scanned QR */}
      {!qrScanned && !phase.scanning && (
        <div className="fixed inset-x-0 bottom-0 z-20 bg-gradient-to-t from-background via-background to-transparent px-4 pb-6 pt-4">
          <div className="mx-auto max-w-md">
            <button
              onClick={toggleScanning}
              className="flex h-14 w-full items-center justify-center gap-2 rounded-2xl bg-primary text-base font-semibold text-primary-foreground shadow-lg shadow-primary/25 transition-all active:scale-[0.98] hover:opacity-90"
            >
              <QrCode className="h-5 w-5" />
              Mulai Scan QR
            </button>
          </div>
        </div>
      )}

      {/* Success Popup */}
      {showSuccess && (
        <div className="fixed inset-0 flex items-center justify-center bg-black/40 z-50">
          <div className="bg-card rounded-2xl shadow-xl p-6 text-center animate-scale border border-border max-w-xs mx-4">
            <div className="flex justify-center mb-3">
              <div className="flex h-12 w-12 items-center justify-center rounded-full bg-green-100 dark:bg-green-900">
                <CheckCircle2 className="h-6 w-6 text-green-600 dark:text-green-400" />
              </div>
            </div>
            <h2 className="text-xl font-bold text-foreground">Presensi Berhasil</h2>
            <p className="text-sm text-muted-foreground mt-2">
              Presensi untuk NIM {attendanceList[attendanceList.length - 1]?.nim} sudah tercatat.
            </p>
            <p className="text-xs text-primary mt-3 font-medium">
              Total: {attendanceList.length} mahasiswa sudah presensi
            </p>
          </div>
        </div>
      )}
    </main>
  );
}
