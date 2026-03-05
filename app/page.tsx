"use client";

import Image from "next/image";
import { useRouter } from "next/navigation";
import { GraduationCap, BookOpen } from "lucide-react";
import { useEffect, useState } from "react";

export default function OnboardingPage() {
  const router = useRouter();
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  return (
    <main className="flex min-h-dvh flex-col bg-gradient-to-b from-blue-100 via-blue-50 to-white px-6 transition-colors duration-700">
      {/* Center Content */}
      <div
        className={`mx-auto flex w-full max-w-md flex-1 flex-col items-center justify-center gap-8 py-12 transition-all duration-700 ${
          mounted ? "opacity-100 translate-y-0" : "opacity-0 translate-y-6"
        }`}
      >
        {/* University Name */}
        <p className="text-xs font-semibold uppercase tracking-[0.25em] text-blue-900">
          Universitas Airlangga
        </p>

        {/* Logo */}
        <Image
          src="/logo-unair.png"
          alt="Logo Universitas Airlangga"
          width={100}
          height={100}
          priority
          className="object-contain"
        />

        {/* Title */}
        <div className="flex flex-col items-center gap-2 text-center">
          <h1 className="text-2xl font-semibold text-blue-900">
            Sistem Presensi Digital
          </h1>
          <p className="text-xs text-gray-600">
            Berbasis QR Code, GPS & Sensor
          </p>
        </div>

        {/* Action Buttons */}
        <div className="flex w-full flex-col items-center gap-3 pt-4">
          <button
            onClick={() => router.push("/mahasiswa")}
            className="flex h-11 w-60 items-center justify-center gap-2 rounded-xl bg-blue-900 text-sm font-medium text-white shadow-md transition-all duration-200 hover:bg-blue-800 hover:shadow-lg active:scale-[0.98]"
          >
            <GraduationCap className="h-4 w-4" />
            Masuk sebagai Mahasiswa
          </button>

          <button
            onClick={() => router.push("/dosen")}
            className="flex h-11 w-60 items-center justify-center gap-2 rounded-xl border border-blue-900 bg-white text-sm font-medium text-blue-900 transition-all duration-200 hover:bg-blue-50 active:scale-[0.98]"
          >
            <BookOpen className="h-4 w-4" />
            Masuk sebagai Dosen
          </button>
        </div>
      </div>

      {/* Footer */}
      <footer className="border-t border-blue-200 py-4 text-center text-xs text-gray-600">
        © {new Date().getFullYear()} Universitas Airlangga
      </footer>
    </main>
  );
}
