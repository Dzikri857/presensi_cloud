"use client";

import { useState } from "react";
import { QRCodeSVG } from "qrcode.react";
import { ArrowLeft, QrCode, Copy, Check, Users, RefreshCw } from "lucide-react";
import { useRouter } from "next/navigation";

// QR now contains session info instead of a one-time token
interface SessionQR {
  type: "session";
  course_id: string;
  session_id: string;
  created_at: string;
  expires_at: string;
}

export default function DosenPage() {
  const router = useRouter();
  const [courseId, setCourseId] = useState("");
  const [sessionId, setSessionId] = useState("");
  const [error, setError] = useState("");
  const [sessionQR, setSessionQR] = useState<SessionQR | null>(null);
  const [copied, setCopied] = useState(false);

  function handleGenerate() {
    if (!courseId.trim() || !sessionId.trim()) {
      setError("Course ID dan Session ID wajib diisi.");
      return;
    }
    setError("");

    // Create session QR data (valid for 2 hours)
    const now = new Date();
    const expiresAt = new Date(now.getTime() + 2 * 60 * 60 * 1000); // 2 hours

    const qrData: SessionQR = {
      type: "session",
      course_id: courseId.trim(),
      session_id: sessionId.trim(),
      created_at: now.toISOString(),
      expires_at: expiresAt.toISOString(),
    };

    console.log("[v0] Session QR Generated:", qrData);
    setSessionQR(qrData);
  }

  function handleCopyData() {
    if (!sessionQR) return;
    navigator.clipboard.writeText(JSON.stringify(sessionQR));
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  const expiresDate = sessionQR?.expires_at
    ? new Date(sessionQR.expires_at).toLocaleString("id-ID", {
        dateStyle: "medium",
        timeStyle: "medium",
      })
    : "";

  return (
    <main className="flex min-h-dvh flex-col bg-background">
      {/* Header */}
      <header className="sticky top-0 z-10 flex items-center gap-3 border-b border-border bg-card px-4 py-3">
        <button
          onClick={() => router.push("/")}
          className="flex h-9 w-9 items-center justify-center rounded-xl text-muted-foreground transition-colors hover:bg-secondary"
          aria-label="Kembali"
        >
          <ArrowLeft className="h-5 w-5" />
        </button>
        <div>
          <h1 className="text-lg font-bold text-foreground">
            Generate QR Presensi
          </h1>
          <p className="text-xs text-muted-foreground">Panel Dosen</p>
        </div>
      </header>

      <div className="mx-auto flex w-full max-w-md flex-1 flex-col gap-4 px-4 py-6">
        {/* Input Card */}
        <div className="rounded-2xl bg-card p-5 shadow-sm">
          <div className="flex flex-col gap-4">
            <div className="flex flex-col gap-1.5">
              <label
                htmlFor="course_id"
                className="text-sm font-medium text-foreground"
              >
                Course ID
              </label>
              <input
                id="course_id"
                type="text"
                placeholder="Contoh: CC101"
                value={courseId}
                onChange={(e) => setCourseId(e.target.value)}
                className="h-12 rounded-xl border border-input bg-background px-4 text-foreground placeholder:text-muted-foreground focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <label
                htmlFor="session_id"
                className="text-sm font-medium text-foreground"
              >
                Session ID
              </label>
              <input
                id="session_id"
                type="text"
                placeholder="Contoh: S01"
                value={sessionId}
                onChange={(e) => setSessionId(e.target.value)}
                className="h-12 rounded-xl border border-input bg-background px-4 text-foreground placeholder:text-muted-foreground focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
              />
            </div>

            {error && (
              <p className="rounded-xl bg-destructive/10 px-4 py-2.5 text-sm text-destructive">
                {error}
              </p>
            )}

            <button
              onClick={handleGenerate}
              className="flex h-14 w-full items-center justify-center gap-2 rounded-2xl bg-primary text-base font-semibold text-primary-foreground shadow-md shadow-primary/20 transition-all active:scale-[0.98] hover:opacity-90 disabled:opacity-60"
            >
              <QrCode className="h-5 w-5" />
              {sessionQR ? "Generate Ulang QR" : "Generate QR Code"}
            </button>
          </div>
        </div>

        {/* QR Result Card */}
        {sessionQR && (
          <div className="flex flex-col items-center gap-5 rounded-2xl bg-card p-6 shadow-sm">
            {/* Multi-user indicator */}
            <div className="flex items-center gap-2 rounded-xl bg-green-50 dark:bg-green-950/30 px-4 py-2 text-green-700 dark:text-green-300">
              <Users className="h-4 w-4" />
              <span className="text-sm font-medium">
                QR ini bisa digunakan banyak mahasiswa
              </span>
            </div>

            <p className="text-sm font-medium text-muted-foreground">
              QR Code Presensi - {sessionQR.course_id} / {sessionQR.session_id}
            </p>

            <div className="rounded-2xl border-2 border-dashed border-primary/30 p-4">
              <QRCodeSVG
                value={JSON.stringify(sessionQR)}
                size={220}
                level="H"
                bgColor="transparent"
                fgColor="#003DA5"
              />
            </div>

            {/* Session Info */}
            <div className="w-full space-y-2">
              <div className="flex items-center justify-between rounded-xl bg-secondary px-4 py-3">
                <span className="text-sm text-muted-foreground">Course ID</span>
                <span className="text-sm font-medium text-foreground">{sessionQR.course_id}</span>
              </div>
              <div className="flex items-center justify-between rounded-xl bg-secondary px-4 py-3">
                <span className="text-sm text-muted-foreground">Session ID</span>
                <span className="text-sm font-medium text-foreground">{sessionQR.session_id}</span>
              </div>
            </div>

            {/* Copy Button */}
            <button
              onClick={handleCopyData}
              className="flex items-center gap-2 rounded-xl bg-secondary px-4 py-2 text-sm text-muted-foreground transition-colors hover:bg-secondary/80"
            >
              {copied ? (
                <>
                  <Check className="h-4 w-4 text-green-600" />
                  <span>Tersalin!</span>
                </>
              ) : (
                <>
                  <Copy className="h-4 w-4" />
                  <span>Salin Data QR</span>
                </>
              )}
            </button>

            {/* Expires */}
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <RefreshCw className="h-4 w-4" />
              <span>Berlaku hingga: {expiresDate}</span>
            </div>
          </div>
        )}
      </div>
    </main>
  );
}
