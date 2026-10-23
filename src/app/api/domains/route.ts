import { NextRequest, NextResponse } from "next/server";
import { requireUser, validLabel, sameOriginRequest } from "@/lib/server";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  const auth = await requireUser(req);
  if (auth.error) return auth.error;
  const { data, error } = await auth.db.from("domain_requests")
    .select("id,label,ip_address,dns_type,dns_name,dns_value,dns_ttl,dns_proxied,status,admin_note,fqdn,created_at,updated_at")
    .eq("user_id", auth.user!.id).order("created_at", { ascending: false });
  if (error) return NextResponse.json({ error: "Gagal memuat domain." }, { status: 500 });
  return NextResponse.json({ domains: data });
}

export async function POST(req: NextRequest) {
  if (!sameOriginRequest(req)) return NextResponse.json({ error: "Permintaan lintas-origin ditolak." }, { status: 403 });
  const auth = await requireUser(req);
  if (auth.error) return auth.error;
  let body: { label?: unknown; ip_address?: unknown; dns_type?: unknown; dns_value?: unknown; dns_name?: unknown; dns_ttl?: unknown; dns_proxied?: unknown };
  try { body = await req.json(); } catch { return NextResponse.json({ error: "Data tidak valid." }, { status: 400 }); }
  const label = typeof body.label === "string" ? body.label.trim().toLowerCase() : "";
  const dnsType = typeof body.dns_type === "string" ? body.dns_type.toUpperCase() : "A";
  const target = typeof body.dns_value === "string" ? body.dns_value.trim() : (typeof body.ip_address === "string" ? body.ip_address.trim() : "");
  const dnsName = typeof body.dns_name === "string" ? body.dns_name.trim() : "@";
  const ttl = typeof body.dns_ttl === "number" && [1,60,120,300,600,900,1800,3600,7200,18000,43200,86400].includes(body.dns_ttl) ? body.dns_ttl : 1;
  const proxied = dnsType === "A" || dnsType === "AAAA" || dnsType === "CNAME" ? body.dns_proxied === true : false;
  if (!validLabel(label)) return NextResponse.json({ error: "Nama subdomain 1–40 karakter; gunakan huruf kecil, angka, dan tanda hubung." }, { status: 400 });
  if (!["A", "AAAA", "CNAME", "TXT"].includes(dnsType)) return NextResponse.json({ error: "Tipe DNS tidak didukung. Pilih A, AAAA, CNAME, atau TXT." }, { status: 400 });
  if (!/^(?:@|[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)(?:\.(?:[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?))*$/.test(dnsName)) return NextResponse.json({ error: "Nama record DNS tidak valid." }, { status: 400 });
  if (!target || target.length > 255) return NextResponse.json({ error: "Nilai tujuan DNS wajib diisi (maksimal 255 karakter)." }, { status: 400 });
  if (dnsType === "A") {
    const o = target.split(".");
    if (o.length !== 4 || !o.every(v => /^\d{1,3}$/.test(v) && Number(v) >= 0 && Number(v) <= 255)) return NextResponse.json({ error: "Untuk A record, masukkan IPv4 yang valid." }, { status: 400 });
  } else if (dnsType === "AAAA") {
    if (!target.includes(":") || !/^[0-9a-fA-F:.]+$/.test(target)) return NextResponse.json({ error: "Untuk AAAA record, masukkan IPv6 yang valid." }, { status: 400 });
  } else if (dnsType === "CNAME") {
    if (!/^(?=.{1,253}$)(?:[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?\.)+[a-zA-Z]{2,63}\.?$/.test(target)) return NextResponse.json({ error: "Untuk CNAME, masukkan hostname tujuan, bukan alamat IP." }, { status: 400 });
  } else if (/[\r\n]/.test(target)) return NextResponse.json({ error: "TXT record tidak boleh mengandung baris baru." }, { status: 400 });
  const db = auth.db!;
  const { count, error: countError } = await db.from("domain_requests").select("id", { count: "exact", head: true })
    .eq("user_id", auth.user!.id).in("status", ["pending", "approved", "provisioning", "active"]);
  if (countError) return NextResponse.json({ error: "Gagal memeriksa kuota." }, { status: 500 });
  if ((count ?? 0) >= 3) return NextResponse.json({ error: "Batas maksimal 3 domain/permintaan aktif per akun sudah tercapai." }, { status: 409 });
  const { data: existing } = await db.from("domain_requests").select("id")
    .eq("label", label).in("status", ["pending", "approved", "provisioning", "active"]).maybeSingle();
  if (existing) return NextResponse.json({ error: "Nama subdomain sudah digunakan atau sedang menunggu persetujuan." }, { status: 409 });
  const { data, error } = await db.from("domain_requests").insert({
    user_id: auth.user!.id, label, ip_address: dnsType === "A" ? target : null, dns_type: dnsType, dns_name: dnsName, dns_value: target, dns_ttl: ttl, dns_proxied: proxied, status: "pending"
  }).select("id,label,ip_address,dns_type,dns_name,dns_value,dns_ttl,dns_proxied,status,created_at").single();
  if (error) return NextResponse.json({ error: "Permintaan gagal disimpan. Pastikan SQL schema sudah dijalankan." }, { status: 500 });
  return NextResponse.json({ domain: data, message: "Permintaan dikirim. Domain baru dibuat setelah admin menyetujui." }, { status: 201 });
}
