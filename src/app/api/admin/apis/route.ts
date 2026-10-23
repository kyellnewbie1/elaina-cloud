import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/server";

export const runtime = "nodejs";

const slugPattern = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const allowedMethods = ["GET", "POST", "PUT", "DELETE"];

/** Admin-managed API registry. URL targets are stored as configuration, never executed as code. */
export async function GET(req: NextRequest) {
  const auth = await requireAdmin(req);
  if (auth.error) return auth.error;
  const { data, error } = await auth.db.from("api_registry")
    .select("id,name,description,category,method,path,target_url,input_schema,enabled,locked,created_at,updated_at")
    .order("created_at", { ascending: false });
  if (error) return NextResponse.json({ error: "Gagal memuat daftar API. Jalankan schema terbaru." }, { status: 500 });
  return NextResponse.json({ apis: data });
}

export async function POST(req: NextRequest) {
  const auth = await requireAdmin(req);
  if (auth.error) return auth.error;
  let b: any;
  try { b = await req.json(); } catch { return NextResponse.json({ error: "JSON tidak valid." }, { status: 400 }); }
  const name = typeof b.name === "string" ? b.name.trim().slice(0, 80) : "";
  const description = typeof b.description === "string" ? b.description.trim().slice(0, 500) : "";
  const category = typeof b.category === "string" ? b.category.trim().toLowerCase().slice(0, 40) : "tools";
  const slug = typeof b.slug === "string" ? b.slug.trim().toLowerCase() : "";
  const method = typeof b.method === "string" ? b.method.toUpperCase() : "GET";
  const target = typeof b.target_url === "string" ? b.target_url.trim() : "";
  let targetUrl: URL;
  try { targetUrl = new URL(target); } catch { return NextResponse.json({ error: "URL tujuan tidak valid." }, { status: 400 }); }
  if (!name || !slugPattern.test(slug)) return NextResponse.json({ error: "Nama wajib diisi dan slug hanya boleh huruf kecil, angka, serta tanda hubung." }, { status: 400 });
  if (!["https:"].includes(targetUrl.protocol)) return NextResponse.json({ error: "URL tujuan wajib menggunakan HTTPS." }, { status: 400 });
  if (!allowedMethods.includes(method)) return NextResponse.json({ error: "Method tidak didukung." }, { status: 400 });
  const inputSchema = Array.isArray(b.input_schema) ? b.input_schema.filter((x: any) => x && typeof x.name === "string" && /^[a-zA-Z][a-zA-Z0-9_]{0,39}$/.test(x.name)).slice(0, 20) : [];
  const { data, error } = await auth.db.from("api_registry").insert({
    name, description, category, slug, method, target_url: targetUrl.toString(),
    input_schema: inputSchema, enabled: b.enabled !== false, locked: b.locked === true,
    created_by: auth.user!.id
  }).select("id,name,description,category,slug,method,path,target_url,input_schema,enabled,locked,created_at").single();
  if (error) return NextResponse.json({ error: "Gagal menyimpan API. Pastikan slug belum dipakai dan schema sudah dijalankan." }, { status: 500 });
  return NextResponse.json({ api: data }, { status: 201 });
}

export async function PATCH(req: NextRequest) {
  const auth = await requireAdmin(req);
  if (auth.error) return auth.error;
  let b: any;
  try { b = await req.json(); } catch { return NextResponse.json({ error: "JSON tidak valid." }, { status: 400 }); }
  if (typeof b.id !== "string") return NextResponse.json({ error: "ID API wajib diisi." }, { status: 400 });
  const patch: Record<string, unknown> = {};
  for (const key of ["name", "description", "category", "enabled", "locked", "input_schema"] as const) {
    if (b[key] !== undefined) patch[key] = b[key];
  }
  if (b.method !== undefined) {
    const m = String(b.method).toUpperCase();
    if (!allowedMethods.includes(m)) return NextResponse.json({ error: "Method tidak didukung." }, { status: 400 });
    patch.method = m;
  }
  if (b.target_url !== undefined) {
    try { const u = new URL(String(b.target_url)); if (u.protocol !== "https:") throw new Error(); patch.target_url = u.toString(); }
    catch { return NextResponse.json({ error: "URL tujuan harus berupa HTTPS yang valid." }, { status: 400 }); }
  }
  patch.updated_at = new Date().toISOString();
  const { data, error } = await auth.db.from("api_registry").update(patch).eq("id", b.id)
    .select("id,name,description,category,slug,method,path,target_url,input_schema,enabled,locked,created_at,updated_at").single();
  if (error) return NextResponse.json({ error: "Gagal memperbarui API." }, { status: 500 });
  return NextResponse.json({ api: data });
}

export async function DELETE(req: NextRequest) {
  const auth = await requireAdmin(req);
  if (auth.error) return auth.error;
  const id = new URL(req.url).searchParams.get("id");
  if (!id) return NextResponse.json({ error: "ID API wajib diisi." }, { status: 400 });
  const { error } = await auth.db.from("api_registry").delete().eq("id", id);
  if (error) return NextResponse.json({ error: "Gagal menghapus API." }, { status: 500 });
  return NextResponse.json({ message: "API dihapus dari registry." });
}
