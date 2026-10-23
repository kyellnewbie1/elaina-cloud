import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const runtime = "nodejs";
export async function GET() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return NextResponse.json({ error: "Server belum dikonfigurasi." }, { status: 503 });
  const db = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
  const { data, error } = await db.from("api_registry")
    .select("name,description,category,slug,method,path,input_schema,enabled,locked")
    .eq("enabled", true).order("category").order("name");
  if (error) return NextResponse.json({ error: "Registry API belum siap." }, { status: 500 });
  return NextResponse.json({ apis: data });
}
