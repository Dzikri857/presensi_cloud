"use client";

import { useState } from "react";
import { QRCodeSVG } from "qrcode.react";
import { generateQr, type QrGenerateResponse } from "@/lib/api";
import { ArrowLeft, QrCode, Loader2, Clock, Copy, Check } from "lucide-react";
import { useRouter } from "next/navigation";

export default function DosenPage() {
  const router = useRouter();
  const [courseId, setCourseId] = useState("");
  const [sessionId, setSessionId] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState<QrGenerateResponse | null>(null);
  const [copied, setCopied] = useState(false);

  async function handleGenerate() {
    if (!courseId.trim() || !sessionId.trim()) {
      setError("Course ID dan Session ID wajib diisi.");
      return;
    }
    setLoading(true);
    setError("");
    setResult(null);

    try {
      const res = await generateQr(courseId.trim(), sessionId.trim());
      if (res.ok) {
        console.log("[v0] QR Generated:", res.data);
        setResult(res.data);
      } else {
        setError(res.error ?? "Gagal generate QR.");
      }
    } catch (err) {
      console.error("[v0] Generate QR error:", err);
      setError("Gagal generate QR. Periksa koneksi backend.");
    }
    setLoading(false);
  }

  function handleCopyToken() {
    if (!result) return;
    navigator.clipboard.writeText(result.qr_token);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  const expiresDate = result?.expires_at
    ? new Date(result.expires_at).toLocaleString("id-ID", {
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
              disabled={loading}
              className="flex h-14 w-full items-center justify-center gap-2 rounded-2xl bg-primary text-base font-semibold text-primary-foreground shadow-md shadow-primary/20 transition-all active:scale-[0.98] hover:opacity-90 disabled:opacity-60"
            >
              {loading ? (
                <Loader2 className="h-5 w-5 animate-spin" />
              ) : (
                <QrCode className="h-5 w-5" />
              )}
              {loading ? "Generating..." : "Generate QR Code"}
            </button>
          </div>
        </div>

        {/* QR Result Card */}
        {result && (
          <div className="flex flex-col items-center gap-5 rounded-2xl bg-card p-6 shadow-sm">
            <p className="text-sm font-medium text-muted-foreground">
              QR Code Presensi
            </p>

            <div className="rounded-2xl border-2 border-dashed border-primary/30 p-4">
              <QRCodeSVG
                value={result.qr_token}
                size={220}
                level="H"
                bgColor="transparent"
                fgColor="#003DA5"
              />
            </div>

            {/* Token */}
            <div className="flex w-full items-center gap-2 rounded-xl bg-secondary px-4 py-3">
              <code className="flex-1 truncate text-xs text-foreground">
                {result.qr_token}
              </code>
              <button
                onClick={handleCopyToken}
                className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-background"
                aria-label="Copy token"
              >
                {copied ? (
                  <Check className="h-4 w-4 text-success" />
                ) : (
                  <Copy className="h-4 w-4" />
                )}
              </button>
            </div>

            {/* Expires */}
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Clock className="h-4 w-4" />
              <span>Berlaku hingga: {expiresDate}</span>
            </div>
          </div>
        )}
      </div>
    </main>
  );
}
