import { createClient } from "@supabase/supabase-js";
import { NextRequest, NextResponse } from "next/server";

export function adminDb() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("Supabase server environment variables are missing.");
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}

export async function requireUser(req: NextRequest) {
  const token = req.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  if (!token) return { error: NextResponse.json({ error: "Login diperlukan." }, { status: 401 }) };
  const db = adminDb();
  const { data, error } = await db.auth.getUser(token);
  if (error || !data.user) return { error: NextResponse.json({ error: "Sesi tidak valid. Silakan login ulang." }, { status: 401 }) };
  return { user: data.user, db };
}

export async function requireAdmin(req: NextRequest) {
  const result = await requireUser(req);
  if (result.error) return result;
  const { data: profile, error } = await result.db.from("profiles").select("role").eq("id", result.user!.id).single();
  if (error || profile?.role !== "admin") {
    return { error: NextResponse.json({ error: "Akses admin diperlukan." }, { status: 403 }) };
  }
  return result;
}

export function validLabel(input: unknown): input is string {
  return typeof input === "string" && input.length >= 1 && input.length <= 40 &&
    /^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/.test(input);
}


/** Reject unexpected or oversized strings before using them in database/API operations. */
export function safeText(input: unknown, maxLength = 2000): string | null {
  if (typeof input !== "string") return null;
  const value = input.trim();
  if (!value || value.length > maxLength) return null;
  // Remove control characters; output should still be rendered as text, never raw HTML.
  return value.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, "");
}

/** Require same-origin browser requests for state-changing routes. */
export function sameOriginRequest(req: NextRequest): boolean {
  const origin = req.headers.get("origin");
  if (!origin) return false;
  try { return new URL(origin).origin === new URL(req.url).origin; }
  catch { return false; }
}
