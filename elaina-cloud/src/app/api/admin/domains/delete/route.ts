import { NextRequest, NextResponse } from "next/server";
import { requireAdmin, sameOriginRequest } from "@/lib/server";
export const runtime = "nodejs";
export async function POST(req: NextRequest) {
  if (!sameOriginRequest(req)) return NextResponse.json({ error: "Permintaan lintas-origin ditolak." }, { status: 403 });
  const auth = await requireAdmin(req);
  if (auth.error) return auth.error;
  let body: { id?: string };
  try { body = await req.json(); } catch { return NextResponse.json({ error: "Data tidak valid." }, { status: 400 }); }
  if (!body.id) return NextResponse.json({ error: "ID domain diperlukan." }, { status: 400 });
  const { data: item, error } = await auth.db.from("domain_requests").select("*").eq("id", body.id).single();
  if (error || !item) return NextResponse.json({ error: "Domain tidak ditemukan." }, { status: 404 });
  if (item.cloudflare_record_id) {
    const token = process.env.CLOUDFLARE_API_TOKEN, zone = process.env.CLOUDFLARE_ZONE_ID;
    if (!token || !zone) return NextResponse.json({ error: "Cloudflare belum dikonfigurasi." }, { status: 503 });
    const cf = await fetch(`https://api.cloudflare.com/client/v4/zones/${zone}/dns_records/${item.cloudflare_record_id}`, {
      method: "DELETE", headers: { Authorization: `Bearer ${token}` }
    });
    const result = await cf.json().catch(() => null);
    if (!cf.ok || !result?.success) return NextResponse.json({ error: "Penghapusan DNS di Cloudflare gagal." }, { status: 502 });
  }
  const { error: deleteError } = await auth.db.from("domain_requests").delete().eq("id", body.id);
  if (deleteError) return NextResponse.json({ error: "DNS sudah dihapus tetapi data database gagal dihapus." }, { status: 500 });
  return NextResponse.json({ message: "Domain berhasil dihapus." });
}
