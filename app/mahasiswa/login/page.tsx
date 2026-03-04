"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, Loader2, Eye, EyeOff } from "lucide-react";
import { loginMahasiswa } from "@/lib/api";
import { setUserId } from "@/lib/device";

export default function MahasiswaLoginPage() {
  const router = useRouter();
  const [nim, setNim] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState("");

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault();
    setError("");

    if (!nim.trim() || !password.trim()) {
      setError("NIM dan password harus diisi");
      return;
    }

    setIsLoading(true);
    try {
      const response = await loginMahasiswa(nim, password);

      if (response.ok) {
        setUserId(response.data.user_id);
        router.push("/mahasiswa");
      } else {
        setError(response.error || "Login gagal");
      }
    } catch (err) {
      setError("Terjadi kesalahan koneksi");
      console.error("[v0] Login error:", err);
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <main className="flex min-h-dvh flex-col items-center justify-center bg-gradient-to-b from-primary/5 to-background px-4 py-8">
      <div className="flex w-full max-w-md flex-col gap-6">
        {/* Header with back button */}
        <div className="flex items-center gap-3">
          <button
            onClick={() => router.back()}
            className="flex h-10 w-10 items-center justify-center rounded-lg border border-border hover:bg-secondary transition-colors"
            aria-label="Kembali"
          >
            <ArrowLeft className="h-5 w-5" />
          </button>
          <h1 className="text-2xl font-bold text-primary">Login Mahasiswa</h1>
        </div>

        {/* Form */}
        <form onSubmit={handleLogin} className="flex flex-col gap-4">
          {/* Error message */}
          {error && (
            <div className="rounded-xl bg-destructive/10 border border-destructive/30 p-3 text-sm font-medium text-destructive">
              {error}
            </div>
          )}

          {/* NIM Input */}
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
              value={nim}
              onChange={(e) => setNim(e.target.value)}
              disabled={isLoading}
              className="h-12 rounded-xl border border-input bg-card px-4 text-foreground placeholder:text-muted-foreground disabled:opacity-50 focus:outline-none focus:ring-2 focus:ring-ring"
            />
          </div>

          {/* Password Input */}
          <div className="flex flex-col gap-2">
            <label
              htmlFor="password"
              className="text-sm font-semibold text-foreground"
            >
              Password
            </label>
            <div className="relative">
              <input
                id="password"
                type={showPassword ? "text" : "password"}
                placeholder="Masukkan password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                disabled={isLoading}
                className="w-full h-12 rounded-xl border border-input bg-card px-4 pr-12 text-foreground placeholder:text-muted-foreground disabled:opacity-50 focus:outline-none focus:ring-2 focus:ring-ring"
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                disabled={isLoading}
                className="absolute right-4 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors disabled:opacity-50"
              >
                {showPassword ? (
                  <EyeOff className="h-5 w-5" />
                ) : (
                  <Eye className="h-5 w-5" />
                )}
              </button>
            </div>
          </div>

          {/* Login Button */}
          <button
            type="submit"
            disabled={isLoading}
            className="mt-2 h-12 w-full rounded-xl bg-primary text-base font-semibold text-primary-foreground shadow-md shadow-primary/20 transition-all active:scale-[0.98] hover:opacity-90 disabled:opacity-50 flex items-center justify-center gap-2"
          >
            {isLoading ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                Memproses...
              </>
            ) : (
              "Login"
            )}
          </button>
        </form>

        {/* Footer info */}
        <p className="text-center text-xs text-muted-foreground">
          Gunakan NIM dan password akun akademik Anda
        </p>
      </div>
    </main>
  );
}
