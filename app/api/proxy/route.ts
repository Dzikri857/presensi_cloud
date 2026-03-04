import { NextResponse } from "next/server";

const GAS_BASE = process.env.NEXT_PUBLIC_BASE_URL!;

function buildUrlPathMode(reqUrl: string) {
  const { searchParams } = new URL(reqUrl);
  const path = searchParams.get("path") || "/";
  searchParams.delete("path");

  const url = new URL(`${GAS_BASE}${path}`);
  for (const [k, v] of searchParams.entries()) url.searchParams.set(k, v);
  return url.toString();
}

function buildUrlQueryMode(reqUrl: string) {
  const { searchParams } = new URL(reqUrl);
  const path = searchParams.get("path") || "/";
  searchParams.delete("path");

  const url = new URL(GAS_BASE);
  url.searchParams.set("path", path);
  for (const [k, v] of searchParams.entries()) url.searchParams.set(k, v);
  return url.toString();
}

async function fetchWithFallback(method: "GET" | "POST", req: Request, bodyText?: string) {
  const headers: Record<string, string> = { Accept: "application/json" };
  if (method === "POST") headers["Content-Type"] = "application/json";

  // 1) coba mode modul: /exec/<path>
  let r = await fetch(buildUrlPathMode(req.url), {
    method,
    headers,
    body: method === "POST" ? bodyText : undefined,
  });

  let text = await r.text();
  const ct = (r.headers.get("content-type") || "").toLowerCase();

  // kalau gagal / tidak json, fallback ke ?path=
  const looksHtml = text.trim().startsWith("<!DOCTYPE") || ct.includes("text/html");
  if (!r.ok || looksHtml) {
    r = await fetch(buildUrlQueryMode(req.url), {
      method,
      headers,
      body: method === "POST" ? bodyText : undefined,
    });
    text = await r.text();
  }

  return { r, text };
}

export async function GET(req: Request) {
  const { r, text } = await fetchWithFallback("GET", req);

  return new NextResponse(text, {
    status: r.status,
    headers: { "Content-Type": r.headers.get("content-type") || "application/json" },
  });
}

export async function POST(req: Request) {
  const body = await req.text();
  const { r, text } = await fetchWithFallback("POST", req, body);

  return new NextResponse(text, {
    status: r.status,
    headers: { "Content-Type": r.headers.get("content-type") || "application/json" },
  });
}