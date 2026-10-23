import { NextRequest, NextResponse } from "next/server";
import { requireUser, validLabel } from "@/lib/server";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  const auth = await requireUser(req);
  if (auth.error) return auth.error;
  const { data, error } = await auth.db.from("domain_requests")
    .select("id,label,ip_address,status,admin_note,created_at,updated_at")
    .eq("user_id", auth.user!.id).order("created_at", { ascending: false });
  if (error) return NextResponse.json({ error: "Gagal memuat domain." }, { status: 500 });
  return NextResponse.json({ domains: data });
}

export async function POST(req: NextRequest) {
  const auth = await requireUser(req);
  if (auth.error) return auth.error;
  let body: { label?: unknown; ip_address?: unknown };
  try { body = await req.json(); } catch { return NextResponse.json({ error: "Data tidak valid." }, { status: 400 }); }
  const label = typeof body.label === "string" ? body.label.trim().toLowerCase() : "";
  const ip = typeof body.ip_address === "string" ? body.ip_address.trim() : "";
  if (!validLabel(label)) return NextResponse.json({ error: "Nama subdomain 1–40 karakter; gunakan huruf kecil, angka, dan tanda hubung." }, { status: 400 });
  // Strict IPv4 validation to prevent arbitrary DNS targets in this initial version.
  const octets = ip.split(".");
  if (octets.length !== 4 || !octets.every(o => /^\d{1,3}$/.test(o) && Number(o) >= 0 && Number(o) <= 255)) {
    return NextResponse.json({ error: "Masukkan alamat IPv4 yang valid." }, { status: 400 });
  }
  const db = auth.db!;
  const { count, error: countError } = await db.from("domain_requests").select("id", { count: "exact", head: true })
    .eq("user_id", auth.user!.id).in("status", ["pending", "approved", "provisioning", "active"]);
  if (countError) return NextResponse.json({ error: "Gagal memeriksa kuota." }, { status: 500 });
  if ((count ?? 0) >= 3) return NextResponse.json({ error: "Batas maksimal 3 domain/permintaan aktif per akun sudah tercapai." }, { status: 409 });
  const { data: existing } = await db.from("domain_requests").select("id")
    .eq("label", label).in("status", ["pending", "approved", "provisioning", "active"]).maybeSingle();
  if (existing) return NextResponse.json({ error: "Nama subdomain sudah digunakan atau sedang menunggu persetujuan." }, { status: 409 });
  const { data, error } = await db.from("domain_requests").insert({
    user_id: auth.user!.id, label, ip_address: ip, status: "pending"
  }).select("id,label,ip_address,status,created_at").single();
  if (error) return NextResponse.json({ error: "Permintaan gagal disimpan. Pastikan SQL schema sudah dijalankan." }, { status: 500 });
  return NextResponse.json({ domain: data, message: "Permintaan dikirim. Domain baru dibuat setelah admin menyetujui." }, { status: 201 });
}
