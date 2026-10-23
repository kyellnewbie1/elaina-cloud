import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const runtime = "nodejs";
const allowedHosts = (process.env.API_PROXY_ALLOWED_HOSTS || "").split(",").map(s => s.trim().toLowerCase()).filter(Boolean);
async function execute(req: NextRequest, ctx: { params: Promise<{ path: string[] }> }) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL, key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return NextResponse.json({ status: false, creator: "FranxHost", error: "Server belum dikonfigurasi." }, { status: 503 });
  const { path } = await ctx.params;
  const slug = path.join("/");
  const db = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
  const { data: api, error } = await db.from("api_registry").select("*").eq("path", `/api/v1/${slug}`).maybeSingle();
  if (error || !api) return NextResponse.json({ status: false, creator: "FranxHost", error: "Endpoint tidak ditemukan." }, { status: 404 });
  if (!api.enabled || api.locked) return NextResponse.json({ status: false, creator: "FranxHost", error: "Endpoint sedang dinonaktifkan atau dikunci." }, { status: 423 });
  if (req.method !== api.method) return NextResponse.json({ status: false, creator: "FranxHost", error: `Gunakan method ${api.method}.` }, { status: 405, headers: { Allow: api.method } });
  let target: URL;
  try { target = new URL(api.target_url); } catch { return NextResponse.json({ status: false, creator: "FranxHost", error: "URL tujuan salah konfigurasi." }, { status: 500 }); }
  // Allowlist is mandatory to prevent SSRF and access to private/internal network services.
  if (!allowedHosts.length || !allowedHosts.includes(target.hostname.toLowerCase())) {
    return NextResponse.json({ status: false, creator: "FranxHost", error: "Host tujuan belum masuk API_PROXY_ALLOWED_HOSTS." }, { status: 403 });
  }
  let input: any = {};
  if (req.method !== "GET" && req.method !== "DELETE") {
    try { input = await req.json(); } catch { return NextResponse.json({ status: false, creator: "FranxHost", error: "Body harus JSON." }, { status: 400 }); }
  } else {
    req.nextUrl.searchParams.forEach((v, k) => { target.searchParams.set(k, v); });
  }
  if (input && typeof input === "object" && !Array.isArray(input)) {
    for (const field of (api.input_schema || [])) {
      if (input[field.name] !== undefined && !["string", "number", "boolean"].includes(typeof input[field.name])) {
        return NextResponse.json({ status: false, creator: "FranxHost", error: `Parameter ${field.name} tidak valid.` }, { status: 400 });
      }
    }
  }
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 15000);
  try {
    const response = await fetch(target, {
      method: req.method,
      headers: { "Accept": "application/json", ...(req.method !== "GET" && req.method !== "DELETE" ? { "Content-Type": "application/json" } : {}) },
      ...(req.method !== "GET" && req.method !== "DELETE" ? { body: JSON.stringify(input) } : {}),
      redirect: "error",
      signal: controller.signal
    });
    const contentType = response.headers.get("content-type") || "";
    if (!contentType.includes("application/json")) return NextResponse.json({ status: false, creator: "FranxHost", error: "API tujuan tidak mengembalikan JSON." }, { status: 502 });
    const result = await response.json();
    return NextResponse.json({ status: response.ok, creator: "FranxHost", result }, { status: response.status });
  } catch {
    return NextResponse.json({ status: false, creator: "FranxHost", error: "API tujuan gagal dihubungi." }, { status: 502 });
  } finally { clearTimeout(timer); }
}
export async function GET(req: NextRequest, ctx: any) { return execute(req, ctx); }
export async function POST(req: NextRequest, ctx: any) { return execute(req, ctx); }
export async function PUT(req: NextRequest, ctx: any) { return execute(req, ctx); }
export async function DELETE(req: NextRequest, ctx: any) { return execute(req, ctx); }
