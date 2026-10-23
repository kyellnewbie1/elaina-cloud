import { NextRequest, NextResponse } from "next/server";
import { requireAdmin, sameOriginRequest } from "@/lib/server";
export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  const auth = await requireAdmin(req);
  if (auth.error) return auth.error;
  // Avoid PostgREST embedded-relation failures when the profiles FK relationship
  // is not present/recognized in an existing Supabase schema. Fetch requests first,
  // then attach profile details with a separate query.
  const { data: requests, error } = await auth.db.from("domain_requests")
    .select("id,user_id,label,ip_address,dns_type,dns_name,dns_value,dns_ttl,dns_proxied,status,admin_note,fqdn,created_at")
    .order("created_at", { ascending: false });
  if (error) return NextResponse.json({ error: `Gagal memuat permintaan: ${error.message}` }, { status: 500 });
  const userIds = [...new Set((requests || []).map((item) => item.user_id).filter(Boolean))];
  let profilesById: Record<string, { email?: string; display_name?: string }> = {};
  if (userIds.length) {
    const { data: profiles, error: profilesError } = await auth.db.from("profiles")
      .select("id,email,display_name").in("id", userIds);
    if (profilesError) return NextResponse.json({ error: `Permintaan ditemukan, tetapi profil pengguna gagal dimuat: ${profilesError.message}` }, { status: 500 });
    profilesById = Object.fromEntries((profiles || []).map((profile) => [profile.id, { email: profile.email, display_name: profile.display_name }]));
  }
  const domains = (requests || []).map((item) => ({ ...item, profiles: profilesById[item.user_id] || null }));
  return NextResponse.json({ domains });
}

export async function PATCH(req: NextRequest) {
  if (!sameOriginRequest(req)) return NextResponse.json({ error: "Permintaan lintas-origin ditolak." }, { status: 403 });
  const auth = await requireAdmin(req);
  if (auth.error) return auth.error;
  let body: { id?: string; action?: string; note?: string };
  try { body = await req.json(); } catch { return NextResponse.json({ error: "Data tidak valid." }, { status: 400 }); }
  if (!body.id || !["approve", "reject"].includes(body.action || "")) return NextResponse.json({ error: "Aksi tidak valid." }, { status: 400 });
  const { data: item, error: itemError } = await auth.db.from("domain_requests").select("*").eq("id", body.id).single();
  if (itemError || !item) return NextResponse.json({ error: "Permintaan tidak ditemukan." }, { status: 404 });
  if (item.status !== "pending") return NextResponse.json({ error: "Permintaan ini sudah diproses." }, { status: 409 });

  if (body.action === "reject") {
    const { error } = await auth.db.from("domain_requests").update({
      status: "rejected", admin_note: (body.note || "Permintaan ditolak admin.").slice(0, 500), reviewed_by: auth.user!.id, updated_at: new Date().toISOString()
    }).eq("id", item.id);
    if (error) return NextResponse.json({ error: "Gagal menolak permintaan." }, { status: 500 });
    return NextResponse.json({ message: "Permintaan ditolak." });
  }

  const token = process.env.CLOUDFLARE_API_TOKEN;
  const zone = process.env.CLOUDFLARE_ZONE_ID;
  const suffix = (process.env.DOMAIN_SUFFIX || "elaina-cloud.my.id").replace(/^\.+|\.+$/g, "");
  if (!token || !zone) return NextResponse.json({ error: "Cloudflare belum dikonfigurasi di environment Vercel." }, { status: 503 });
  const fqdn = `${item.label}.${suffix}`;
  const dnsType = ["A", "AAAA", "CNAME", "TXT"].includes(item.dns_type) ? item.dns_type : "A";
  const dnsValue = item.dns_value || item.ip_address;
  if (!dnsValue) return NextResponse.json({ error: "Nilai DNS kosong. Minta pengguna mengirim ulang permintaan." }, { status: 400 });
  const recordName = item.dns_name && item.dns_name !== "@" ? `${item.dns_name}.${fqdn}` : fqdn;
  const cf = await fetch(`https://api.cloudflare.com/client/v4/zones/${zone}/dns_records`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ type: dnsType, name: recordName, content: dnsValue, ttl: item.dns_ttl || 1, proxied: ["A", "AAAA", "CNAME"].includes(dnsType) && item.dns_proxied === true })
  });
  const cfData = await cf.json().catch(() => null);
  if (!cf.ok || !cfData?.success) {
    const msg = Array.isArray(cfData?.errors) ? cfData.errors.map((e: { message?: string }) => e.message).join("; ") : "Cloudflare menolak permintaan.";
    return NextResponse.json({ error: `Pembuatan DNS gagal: ${msg}` }, { status: 502 });
  }
  const { error } = await auth.db.from("domain_requests").update({
    status: "active", cloudflare_record_id: cfData.result.id, fqdn, reviewed_by: auth.user!.id, admin_note: (body.note || "Disetujui admin.").slice(0, 500), updated_at: new Date().toISOString()
  }).eq("id", item.id);
  if (error) {
    // Best-effort rollback to avoid an orphaned DNS record if database write fails.
    await fetch(`https://api.cloudflare.com/client/v4/zones/${zone}/dns_records/${cfData.result.id}`, {
      method: "DELETE", headers: { Authorization: `Bearer ${token}` }
    }).catch(() => null);
    return NextResponse.json({ error: "DNS dibuat tetapi penyimpanan database gagal; record telah dicoba di-rollback." }, { status: 500 });
  }
  return NextResponse.json({ message: `DNS ${dnsType} untuk ${recordName} berhasil dibuat.`, fqdn: recordName });
}
