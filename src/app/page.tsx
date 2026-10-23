"use client";
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabase-browser";
import { Activity, ArrowUpRight, BadgeCheck, Bell, Check, ChevronRight, CircleHelp, Cloud, Code2, Globe2, LayoutDashboard, LogOut, Menu, Moon, Plus, RefreshCw, ShieldCheck, Sun, Trash2, UserRound, X, Zap } from "lucide-react";

type Domain = { id:string; label:string; ip_address:string|null; dns_type?:string; dns_name?:string; dns_value?:string|null; dns_ttl?:number; dns_proxied?:boolean; status:string; admin_note?:string|null; fqdn?:string|null; created_at:string; user_id?:string; profiles?:{email?:string;display_name?:string}|null };
type Profile = { id:string; email:string; display_name:string|null; role:string; avatar_url?:string|null };
const suffix = "elaina-cloud.my.id";
type Announcement = { id:string; title:string; body:string; created_at:string; created_by?:string|null };
type BannerSettings = { title:string; description:string; image_url:string; button_text:string; button_url:string };
type ApiTool = { id?:string; name:string; description:string; category:string; slug:string; method:string; path:string; target_url?:string; input_schema?:{name:string;type?:string;required?:boolean}[]; enabled:boolean; locked:boolean };

export default function Home() {
  const [session, setSession] = useState<any>(null);
  const [profile, setProfile] = useState<Profile|null>(null);
  const [domains, setDomains] = useState<Domain[]>([]);
  const [adminDomains, setAdminDomains] = useState<Domain[]>([]);
  const [email, setEmail] = useState(""); const [password, setPassword] = useState("");
  const [displayName, setDisplayName] = useState(""); const [authMode, setAuthMode] = useState<"login"|"signup">("login");
  const [label, setLabel] = useState(""); const [ip, setIp] = useState(""); const [dnsType, setDnsType] = useState("A"); const [dnsName, setDnsName] = useState("@"); const [dnsProxied, setDnsProxied] = useState(false);
  const [page, setPage] = useState("Overview"); const [dark, setDark] = useState(false); const [mobileMenu, setMobileMenu] = useState(false);
  const [loading, setLoading] = useState(true); const [busy, setBusy] = useState(false); const [notice, setNotice] = useState<{kind:"ok"|"err";text:string}|null>(null);
  const [adminNote, setAdminNote] = useState<Record<string,string>>({}); const [profileName, setProfileName] = useState("");
  const [adEnabled, setAdEnabled] = useState(true);
  const [announcements, setAnnouncements] = useState<Announcement[]>([]);
  const [banner, setBanner] = useState<BannerSettings>({title:"Your domain journey starts here.",description:"Semua subdomain dalam satu dashboard. Kamu yang mengajukan, admin yang menyetujui, Cloudflare yang menghubungkan.",image_url:"",button_text:"Buat domain pertamamu",button_url:"Create Domain"});
  const [bannerDraft, setBannerDraft] = useState<BannerSettings>({title:"Your domain journey starts here.",description:"Semua subdomain dalam satu dashboard. Kamu yang mengajukan, admin yang menyetujui, Cloudflare yang menghubungkan.",image_url:"",button_text:"Buat domain pertamamu",button_url:"Create Domain"});
  const [announcementTitle, setAnnouncementTitle] = useState(""); const [announcementBody, setAnnouncementBody] = useState("");
  const [notifOpen, setNotifOpen] = useState(false); const [popupAnnouncement, setPopupAnnouncement] = useState<Announcement|null>(null);
  const [adModal, setAdModal] = useState(false); const [adCountdown, setAdCountdown] = useState(5); const [adPassed, setAdPassed] = useState(false);
  const [apiTools, setApiTools] = useState<ApiTool[]>([]);
  const [apiDraft, setApiDraft] = useState({name:"",description:"",category:"tools",slug:"",method:"POST",target_url:"",input_name:"url"});
  const [apiInputValues, setApiInputValues] = useState<Record<string,string>>({});
  const [apiResults, setApiResults] = useState<Record<string,string>>({});
  const [apiBusyId, setApiBusyId] = useState<string|null>(null);

  useEffect(() => {
    const saved = localStorage.getItem("elaina-theme"); setDark(saved === "dark");
    if (!supabase) { setLoading(false); return; }
    supabase.auth.getSession().then(({data}) => { setSession(data.session); setLoading(false); if(data.session) void loadUser(data.session); });
    const { data: listener } = supabase.auth.onAuthStateChange((_event, next) => {
      setSession(next); if (next) void loadUser(next); else { setProfile(null); setDomains([]); setAdminDomains([]); }
    });
    return () => listener.subscription.unsubscribe();
  }, []);
  useEffect(() => { document.documentElement.dataset.theme = dark ? "dark" : "light"; localStorage.setItem("elaina-theme", dark ? "dark" : "light"); }, [dark]);
  useEffect(() => {
    if (!session?.user?.id || !supabase) return;
    let alive = true;
    (async () => {
      try {
        const [{data: a}, {data: b}] = await Promise.all([
          supabase!.from("announcements").select("id,title,body,created_at,created_by").order("created_at", {ascending:false}).limit(30),
          supabase!.from("site_settings").select("value").eq("key", "hero_banner").maybeSingle()
        ]);
        if (!alive) return;
        const items = (a || []) as Announcement[]; setAnnouncements(items);
        if (b?.value) { const next = {...banner, ...(b.value as Partial<BannerSettings>)}; setBanner(next); setBannerDraft(next); }
        // Cache each user's notification feed locally in IndexedDB; Supabase remains the shared source of truth.
        const dbReq = indexedDB.open("elaina-user-cache", 2);
        dbReq.onupgradeneeded = () => { const db = dbReq.result; if (!db.objectStoreNames.contains("auth")) db.createObjectStore("auth"); if (!db.objectStoreNames.contains("feeds")) db.createObjectStore("feeds", {keyPath:"userId"}); if (!db.objectStoreNames.contains("messages")) db.createObjectStore("messages", {keyPath:"id"}); };
        dbReq.onsuccess = () => { const db = dbReq.result; const tx = db.transaction("feeds", "readwrite"); tx.objectStore("feeds").put({userId:session.user.id, announcements:items, cachedAt:Date.now()}); tx.oncomplete = () => db.close(); };
        const lastSeen = localStorage.getItem(`elaina-notice-seen-${session.user.id}`);
        if (items[0] && items[0].id !== lastSeen) setPopupAnnouncement(items[0]);
      } catch { /* tables may not exist until schema.sql is applied */ }
    })();
    return () => { alive = false; };
  }, [session?.user?.id]);
  useEffect(() => { if (!adModal || adCountdown <= 0) return; const timer = window.setTimeout(() => setAdCountdown(v => Math.max(0, v-1)), 1000); return () => window.clearTimeout(timer); }, [adModal, adCountdown]);

  async function api(path:string, init:RequestInit={}) {
    const { data: { session: latestSession } } = await supabase?.auth.getSession() ?? { data: { session: null } };
    const token = latestSession?.access_token || session?.access_token;
    const response = await fetch(path, {...init, headers:{"Content-Type":"application/json", ...(token ? {Authorization:`Bearer ${token}`} : {}), ...(init.headers||{})}});
    const data = await response.json().catch(()=>({error:"Respons server tidak valid."}));
    if (!response.ok) throw new Error(data.error || "Permintaan gagal.");
    return data;
  }
  async function loadUser(current:any) {
    if (!supabase || !current?.user) return;
    const {data: p} = await supabase.from("profiles").select("*").eq("id", current.user.id).maybeSingle();
    const nextProfile = p || {id:current.user.id,email:current.user.email||"",display_name:current.user.user_metadata?.display_name||"",role:"user"};
    setProfile(nextProfile as Profile); setProfileName(nextProfile.display_name||"");
    try { const result = await api("/api/domains"); setDomains(result.domains||[]); } catch(e:any) { setNotice({kind:"err",text:e.message}); }
    try { const toolResult = await api("/api/tools"); setApiTools(toolResult.apis||[]); } catch {}
    if (nextProfile.role === "admin") {
      try { const result = await api("/api/admin/domains"); setAdminDomains(result.domains||[]); } catch {}
      try { const result = await api("/api/admin/apis"); setApiTools(result.apis||[]); } catch {}
    }
  }
  async function authSubmit(e:React.FormEvent) {
    e.preventDefault(); if (!supabase) { setNotice({kind:"err",text:"Isi environment Supabase terlebih dahulu."}); return; }
    setBusy(true); setNotice(null);
    try {
      if (authMode === "signup") {
        const {data,error} = await supabase.auth.signUp({email,password,options:{data:{display_name:displayName}}});
        if (error) throw error;
        if (data.session) setNotice({kind:"ok",text:"Akun berhasil dibuat. Selamat datang!"});
        else setNotice({kind:"ok",text:"Pendaftaran berhasil. Cek email untuk konfirmasi, lalu login."});
      } else {
        const {error} = await supabase.auth.signInWithPassword({email,password}); if (error) throw error;
        setNotice({kind:"ok",text:"Login berhasil."});
      }
    } catch(e:any) { setNotice({kind:"err",text:e.message||"Autentikasi gagal."}); }
    finally { setBusy(false); }
  }
  async function logout() { await supabase?.auth.signOut(); setSession(null); setProfile(null); setPage("Overview"); }
  async function createDomain(e:React.FormEvent) {
    e.preventDefault();
    // The demo ad gate was preventing submissions for users who closed the modal
    // or whose browser dropped the delayed requestSubmit. Keep submission direct.
    setAdPassed(false); setAdModal(false); setBusy(true); setNotice(null);
    try {
      const result=await api("/api/domains",{method:"POST",body:JSON.stringify({label,dns_type:dnsType,dns_name:dnsName,dns_value:ip,dns_proxied:dnsProxied})});
      setNotice({kind:"ok",text:result.message}); setLabel(""); setIp(""); setDnsType("A"); setDnsName("@");
      if (session) await loadUser(session);
      setPage("My Domains");
    } catch(e:any) { setNotice({kind:"err",text:e.message || "Permintaan domain gagal dikirim."}); }
    finally { setBusy(false); }
  }
  async function reviewDomain(id:string, action:"approve"|"reject") {
    const note=adminNote[id]||""; if(action==="reject"&&!note.trim()&&!confirm("Tolak permintaan tanpa alasan?")) return;
    setBusy(true); setNotice(null);
    try { const result=await api("/api/admin/domains",{method:"PATCH",body:JSON.stringify({id,action,note})}); setNotice({kind:"ok",text:result.message}); await loadUser(session); }
    catch(e:any) { setNotice({kind:"err",text:e.message}); } finally { setBusy(false); }
  }
  async function deleteDomain(id:string) {
    if (!confirm("Hapus domain dan DNS record Cloudflare? Tindakan ini tidak bisa dibatalkan.")) return;
    setBusy(true);
    try { const result=await api("/api/admin/domains/delete",{method:"POST",body:JSON.stringify({id})}); setNotice({kind:"ok",text:result.message}); await loadUser(session); }
    catch(e:any) { setNotice({kind:"err",text:e.message}); } finally { setBusy(false); }
  }
  async function publishAnnouncement(e:React.FormEvent) {
    e.preventDefault(); if (!supabase || profile?.role !== "admin") return;
    setBusy(true);
    try { const {error} = await supabase.from("announcements").insert({title:announcementTitle.trim(),body:announcementBody.trim(),created_by:profile.id}); if(error) throw error;
      setAnnouncementTitle(""); setAnnouncementBody(""); const {data} = await supabase.from("announcements").select("id,title,body,created_at,created_by").order("created_at",{ascending:false}).limit(30); setAnnouncements((data||[]) as Announcement[]); setNotice({kind:"ok",text:"Pengumuman berhasil dikirim ke semua pengguna."});
    } catch(e:any) { setNotice({kind:"err",text:e.message || "Gagal mengirim pengumuman. Pastikan schema.sql terbaru sudah dijalankan."}); } finally { setBusy(false); }
  }
  async function uploadBannerImage(e:React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]; if (!file || !supabase || profile?.role !== "admin") return;
    if (!file.type.startsWith("image/")) { setNotice({kind:"err",text:"Pilih file gambar."}); e.target.value=""; return; }
    if (file.size > 5 * 1024 * 1024) { setNotice({kind:"err",text:"Ukuran gambar maksimal 5 MB."}); e.target.value=""; return; }
    setBusy(true);
    try { const path = `${profile.id}/${Date.now()}-${file.name.replace(/[^a-zA-Z0-9._-]/g,"-")}`; const {error} = await supabase.storage.from("site-assets").upload(path,file,{upsert:true,contentType:file.type}); if(error) throw error; const {data} = supabase.storage.from("site-assets").getPublicUrl(path); setBannerDraft(v=>({...v,image_url:data.publicUrl})); setNotice({kind:"ok",text:"Gambar berhasil diunggah. Klik Simpan banner untuk menerbitkannya."}); }
    catch(e:any) { setNotice({kind:"err",text:e.message || "Upload gagal. Jalankan schema terbaru dan coba lagi."}); } finally { setBusy(false); e.target.value=""; }
  }
  async function saveBanner(e:React.FormEvent) {
    e.preventDefault(); if (!supabase || profile?.role !== "admin") return; setBusy(true);
    try { const {error} = await supabase.from("site_settings").upsert({key:"hero_banner",value:bannerDraft,updated_by:profile.id,updated_at:new Date().toISOString()},{onConflict:"key"}); if(error) throw error; setBanner(bannerDraft); setNotice({kind:"ok",text:"Banner berhasil diperbarui untuk semua pengguna."}); }
    catch(e:any) { setNotice({kind:"err",text:e.message || "Gagal menyimpan banner. Pastikan schema.sql terbaru sudah dijalankan."}); } finally { setBusy(false); }
  }
  async function refreshApiTools() {
    try { const result = await api(profile?.role === "admin" ? "/api/admin/apis" : "/api/tools"); setApiTools(result.apis||[]); }
    catch(e:any) { setNotice({kind:"err",text:e.message||"Gagal memuat Tools."}); }
  }
  async function saveApiTool(e:React.FormEvent) {
    e.preventDefault(); if(profile?.role!=="admin") return;
    setBusy(true);
    try {
      const payload = {name:apiDraft.name.trim(),description:apiDraft.description.trim(),category:apiDraft.category.trim().toLowerCase(),slug:apiDraft.slug.trim().toLowerCase(),method:apiDraft.method,target_url:apiDraft.target_url.trim(),input_schema:apiDraft.input_name.trim()?[{name:apiDraft.input_name.trim(),type:"string",required:true}]:[],enabled:true,locked:false};
      const result=await api("/api/admin/apis",{method:"POST",body:JSON.stringify(payload)});
      setApiDraft({name:"",description:"",category:"tools",slug:"",method:"POST",target_url:"",input_name:"url"});
      setNotice({kind:"ok",text:`API berhasil didaftarkan: ${result.api?.path||""}`}); await refreshApiTools();
    } catch(e:any) { setNotice({kind:"err",text:e.message||"Gagal menambahkan API."}); }
    finally { setBusy(false); }
  }
  async function changeApiTool(tool:ApiTool, action:"toggle"|"lock"|"delete") {
    if(profile?.role!=="admin"||!tool.id) return;
    if(action==="delete"&&!confirm(`Hapus API ${tool.name} dari registry?`)) return;
    setBusy(true);
    try {
      if(action==="delete") await api(`/api/admin/apis?id=${encodeURIComponent(tool.id)}`,{method:"DELETE"});
      else await api("/api/admin/apis",{method:"PATCH",body:JSON.stringify({id:tool.id,...(action==="toggle"?{enabled:!tool.enabled}:{locked:!tool.locked})})});
      setNotice({kind:"ok",text:action==="delete"?"API dihapus.":"Pengaturan API diperbarui."}); await refreshApiTools();
    } catch(e:any) { setNotice({kind:"err",text:e.message||"Gagal memperbarui API."}); }
    finally { setBusy(false); }
  }
  async function runApiTool(tool:ApiTool) {
    const key=tool.path; setApiBusyId(key); setApiResults(v=>({...v,[key]:"Memproses…"}));
    try {
      let input:any={}; try { input=JSON.parse(apiInputValues[key]||"{}"); } catch { throw new Error("Input harus berupa JSON valid."); }
      const response=await fetch(key,{method:tool.method,headers:{"Content-Type":"application/json"},...(tool.method==="GET"||tool.method==="DELETE"?{}:{body:JSON.stringify(input)})});
      const data=await response.json().catch(()=>({error:"Respons bukan JSON"}));
      setApiResults(v=>({...v,[key]:JSON.stringify(data,null,2)}));
    } catch(e:any) { setApiResults(v=>({...v,[key]:JSON.stringify({status:false,creator:"FranxHost",error:e.message||"Permintaan gagal."},null,2)})); }
    finally { setApiBusyId(null); }
  }
  function dismissAnnouncement(item:Announcement) { if(profile?.id) localStorage.setItem(`elaina-notice-seen-${profile.id}`, item.id); setPopupAnnouncement(null); }
  async function saveProfile(e:React.FormEvent) {
    e.preventDefault(); if(!supabase||!profile) return; setBusy(true);
    try { const {error}=await supabase.from("profiles").update({display_name:profileName.trim()}).eq("id",profile.id); if(error)throw error; setProfile({...profile,display_name:profileName.trim()}); setNotice({kind:"ok",text:"Profil berhasil diperbarui."}); }
    catch(e:any){setNotice({kind:"err",text:e.message});} finally{setBusy(false);}
  }
  const active = domains.filter(d=>d.status==="active").length;
  const pending = domains.filter(d=>d.status==="pending").length;
  const usedSlots = domains.filter(d=>["pending","approved","provisioning","active"].includes(d.status)).length;
  const nav = [{name:"Overview",icon:LayoutDashboard},{name:"My Domains",icon:Globe2},{name:"Create Domain",icon:Plus},{name:"Profile",icon:UserRound},{name:"Settings",icon:Zap},{name:"Notifications",icon:Bell},{name:"Tools",icon:Code2},{name:"Help Center",icon:CircleHelp}];
  const visibleDomains = useMemo(()=>domains, [domains]);
  if (loading) return <div className="loading"><span className="brand-mark"><Cloud size={22}/></span><b>ELAINA CLOUD</b><span className="muted">Menyiapkan workspace…</span></div>;
  if (!session) return <main className="auth-layout">
    <section className="auth-visual"><div className="brand"><span className="brand-mark"><Cloud size={21}/></span> ELAINA <span className="brand-light">CLOUD</span></div>
      <div className="visual-copy"><span className="eyebrow"><span className="pulse"/> DOMAIN MANAGEMENT, SIMPLIFIED</span><h1>Your domains.<br/><em>Your control.</em></h1><p>Kelola subdomain dengan lebih mudah, aman, dan teratur. Semua permintaan diproses dengan persetujuan admin.</p>
      <div className="visual-stats"><div><b>3</b><span>Domain per akun</span></div><div><b>DNS</b><span>Powered by Cloudflare</span></div><div><b>24/7</b><span>Dashboard access</span></div></div></div>
      <div className="auth-footer">© 2026 ELAINA CLOUD <span>Built for a simpler web.</span></div></section>
    <section className="auth-form-wrap"><button className="theme-toggle floating" onClick={()=>setDark(!dark)} aria-label="Ganti tema">{dark?<Sun size={18}/>:<Moon size={18}/>}</button>
      <div className="auth-form"><div className="mobile-brand brand"><span className="brand-mark"><Cloud size={20}/></span> ELAINA <span className="brand-light">CLOUD</span></div><span className="eyebrow">WELCOME TO ELAINA</span><h2>{authMode==="login"?"Welcome back.":"Create your account."}</h2><p className="muted">{authMode==="login"?"Masuk untuk melanjutkan ke dashboard kamu.":"Mulai kelola domain kamu dalam satu tempat."}</p>
      {notice&&<div className={`notice ${notice.kind}`}>{notice.text}</div>}
      {!supabase&&<div className="notice err">Supabase belum dikonfigurasi. Salin .env.example ke .env.local dan isi nilainya.</div>}
      <form onSubmit={authSubmit} className="stack">{authMode==="signup"&&<label>Nama tampilan<input value={displayName} onChange={e=>setDisplayName(e.target.value)} placeholder="Nama kamu" required maxLength={60}/></label>}
        <label>Email<input type="email" value={email} onChange={e=>setEmail(e.target.value)} placeholder="nama@email.com" required autoComplete="email"/></label>
        <label>Password<input type="password" value={password} onChange={e=>setPassword(e.target.value)} placeholder="Minimal 8 karakter" minLength={8} required autoComplete={authMode==="login"?"current-password":"new-password"}/></label>
        <button className="btn primary full" disabled={busy||!supabase}>{busy?"Memproses…":authMode==="login"?"Sign in":"Create account"} <ArrowUpRight size={17}/></button></form>
      <div className="auth-switch">{authMode==="login"?"Belum punya akun?":"Sudah punya akun?"} <button onClick={()=>{setAuthMode(authMode==="login"?"signup":"login");setNotice(null)}}>{authMode==="login"?"Daftar sekarang":"Login"}</button></div>
      <div className="secure-note"><ShieldCheck size={16}/> Login aman dengan Supabase Auth</div></div><div className="auth-bottom">Terms of service <span>·</span> Privacy policy</div></section></main>;

  return <div className="app-shell">
    {mobileMenu&&<div className="mobile-backdrop" onClick={()=>setMobileMenu(false)}/>}
    <aside className={`sidebar ${mobileMenu?"open":""}`}><div className="brand sidebar-brand"><span className="brand-mark"><Cloud size={21}/></span><span>ELAINA <span className="brand-light">CLOUD</span><small>DOMAIN CONTROL</small></span><button className="close-menu" onClick={()=>setMobileMenu(false)}><X size={19}/></button></div>
      <div className="workspace-label">WORKSPACE</div><nav>{nav.map(n=><button key={n.name} className={`nav-item ${page===n.name?"selected":""}`} onClick={()=>{setPage(n.name);setMobileMenu(false)}}><n.icon size={18}/><span>{n.name}</span>{n.name==="My Domains"&&<small>{domains.length}</small>}</button>)}
      {profile?.role==="admin"&&<><div className="workspace-label admin-label">ADMINISTRATION</div><button className={`nav-item ${page==="Admin Panel"?"selected":""}`} onClick={()=>{setPage("Admin Panel");setMobileMenu(false)}}><ShieldCheck size={18}/><span>Admin Panel</span>{adminDomains.filter(d=>d.status==="pending").length>0&&<small className="count-badge">{adminDomains.filter(d=>d.status==="pending").length}</small>}</button></>}</nav>
      <div className="sidebar-bottom"><div className="support-card"><div className="support-icon"><CircleHelp size={17}/></div><b>Need a hand?</b><p>Temukan jawaban di pusat bantuan kami.</p><button onClick={()=>setPage("Help Center")}>Visit help center <ArrowUpRight size={14}/></button></div><div className="user-card"><div className="avatar">{(profile?.display_name||profile?.email||"U").slice(0,1).toUpperCase()}</div><div className="user-meta"><b className="user-name-with-badge">{profile?.display_name||profile?.email?.split("@")[0]||"User"}{profile?.role==="admin"&&<VerifiedBadge/>}</b><span>{profile?.role==="admin"?"Administrator":"Free plan"}</span></div><button className="icon-button" title="Logout" onClick={logout}><LogOut size={17}/></button></div></div>
    </aside>
    <main className="main-panel"><header className="topbar"><div className="top-left"><button className="hamburger icon-button" onClick={()=>setMobileMenu(true)} aria-label="Buka menu"><Menu size={22}/></button><div className="breadcrumbs">Workspace <ChevronRight size={14}/> <b>{page}</b></div></div><div className="top-actions"><span className="system-status"><span className="pulse"/> All systems normal</span><div className="notification-wrap"><button className="icon-button notification-button" onClick={()=>setNotifOpen(!notifOpen)} aria-label="Buka notifikasi" title="Notifikasi"><Bell size={18}/>{announcements.length>0&&<i/>}</button>{notifOpen&&<div className="notification-popover"><div className="popover-head"><b>Notifikasi & pengumuman</b><button className="icon-button" onClick={()=>setNotifOpen(false)}><X size={15}/></button></div>{announcements.length===0?<p className="muted">Belum ada pengumuman.</p>:announcements.map(a=><article key={a.id} className="notification-item"><b>{a.title}</b><p>{a.body}</p><small>{new Date(a.created_at).toLocaleString("id-ID")}</small></article>)}</div>}</div><button className="theme-toggle" onClick={()=>setDark(!dark)} title="Ganti tema">{dark?<Sun size={18}/>:<Moon size={18}/>}</button><div className="avatar small-avatar">{(profile?.display_name||profile?.email||"U").slice(0,1).toUpperCase()}</div></div></header>
    <div className="content">
      {notice&&<div className={`notice global-notice ${notice.kind}`}>{notice.text}<button onClick={()=>setNotice(null)}><X size={16}/></button></div>}
      {page==="Overview"&&<><div className="page-heading"><div><span className="eyebrow">YOUR WORKSPACE</span><h1>Good to see you, {(profile?.display_name||profile?.email?.split("@")[0]||"there").split(" ")[0]}.</h1><p>Ini ringkasan aktivitas domain kamu hari ini.</p></div><button className="btn primary" onClick={()=>setPage("Create Domain")}><Plus size={17}/> Create domain</button></div>
        <section className="hero-banner" style={banner.image_url?{backgroundImage:`linear-gradient(90deg,rgba(10,12,16,.88),rgba(10,12,16,.22)),url(${JSON.stringify(banner.image_url)})`,backgroundSize:"cover",backgroundPosition:"center"}:{}}><div className="hero-grid"/><div className="hero-copy"><span className="hero-pill"><Zap size={13}/> SIMPLE. SECURE. CONNECTED.</span><h2>{banner.title}</h2><p>{banner.description}</p><button className="hero-link" onClick={()=>setPage(banner.button_url==="Create Domain"?"Create Domain":"Overview")}>{banner.button_text} <ArrowUpRight size={16}/></button></div><div className="hero-art"><div className="orbit orbit-one"/><div className="orbit orbit-two"/><div className="domain-window"><div className="window-dots"><i/><i/><i/></div><div className="mini-globe"><Globe2 size={31}/></div><b>elaina-cloud.my.id</b><span><span className="pulse"/> DNS ready</span><div className="window-lines"><i/><i/><i/></div></div><div className="float-tag"><ShieldCheck size={15}/> Protected workflow</div></div><div className="hero-ratio">ELAINA CLOUD <span>16:9 · DOMAIN CONTROL</span></div></section>
        <div className="stats-grid"><Stat title="Total requests" value={domains.length} note="All your domain requests" icon={<Globe2 size={18}/>} /><Stat title="Active domains" value={active} note="Successfully provisioned" icon={<Check size={18}/>} /><Stat title="Awaiting review" value={pending} note="Pending admin approval" icon={<Activity size={18}/>} /><Stat title="Available slots" value={Math.max(0,3-usedSlots)} note="Up to 3 per account" icon={<Zap size={18}/>} /></div>
        <div className="section-row"><div><h3>Recent domains</h3><p>Aktivitas domain terbaru kamu.</p></div><button className="text-button" onClick={()=>setPage("My Domains")}>View all <ArrowUpRight size={15}/></button></div><DomainTable domains={visibleDomains.slice(0,5)} empty="Belum ada domain. Mulai dengan membuat permintaan pertama." onDelete={()=>{}} isAdmin={false}/>
        <div className="bottom-grid"><div className="info-card"><div className="info-icon"><ShieldCheck size={20}/></div><div><h3>Approval-first security</h3><p>Setiap permintaan ditinjau admin sebelum DNS record dibuat. Ini membantu menjaga kualitas dan keamanan zona domain.</p><button className="text-button" onClick={()=>setPage("Help Center")}>Pelajari alur <ArrowUpRight size={14}/></button></div></div><div className="info-card"><div className="info-icon"><Code2 size={20}/></div><div><h3>Built for developers</h3><p>Kelola record A, AAAA, CNAME, dan TXT dengan alur persetujuan yang jelas.</p><button className="text-button" onClick={()=>setPage("Create Domain")}>Mulai sekarang <ArrowUpRight size={14}/></button></div></div></div>
      </>}
      {page==="My Domains"&&<><div className="page-heading"><div><span className="eyebrow">DOMAIN MANAGEMENT</span><h1>My domains</h1><p>Kelola permintaan dan lihat status DNS kamu.</p></div><button className="btn primary" onClick={()=>setPage("Create Domain")}><Plus size={17}/> Create domain</button></div><div className="filter-bar"><div><b>{domains.length}</b> total records</div><button className="btn secondary small" onClick={()=>loadUser(session)}><RefreshCw size={15}/> Refresh</button></div><DomainTable domains={domains} empty="Belum ada domain. Klik Create domain untuk mulai." onDelete={()=>{}} isAdmin={false}/></>}
      {page==="Create Domain"&&<><div className="page-heading"><div><span className="eyebrow">NEW DNS REQUEST</span><h1>Create a domain</h1><p>Ajukan subdomain baru. Admin harus menyetujui sebelum DNS dibuat.</p></div><div className="quota-chip"><span>{usedSlots}/3</span> slots used</div></div><div className="create-layout"><section className="panel form-panel"><div className="panel-heading"><div className="panel-icon"><Globe2 size={19}/></div><div><h3>Domain configuration</h3><p>Pilih tipe record DNS dan isi nilai tujuan yang sesuai.</p></div></div><form onSubmit={createDomain} className="stack domain-form"><label>Subdomain name<div className="domain-input"><input value={label} onChange={e=>setLabel(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g,""))} placeholder="my-project" required maxLength={40}/><span>.{suffix}</span></div><small>Huruf kecil, angka, dan tanda hubung. Tidak boleh diawali/diakhiri tanda hubung.</small></label><label>DNS record type<select value={dnsType} onChange={e=>setDnsType(e.target.value)}><option value="A">A — IPv4 address</option><option value="AAAA">AAAA — IPv6 address</option><option value="CNAME">CNAME — hostname alias</option><option value="TXT">TXT — verification/text</option></select><small>Pilih jenis record yang ingin dibuat di Cloudflare.</small></label><label>Record name<input value={dnsName} onChange={e=>setDnsName(e.target.value)} placeholder="@" required/><small>@ berarti domain utama; isi www atau api untuk subdomain record.</small></label><label>{dnsType === "A" ? "Target IPv4 address" : dnsType === "AAAA" ? "Target IPv6 address" : dnsType === "CNAME" ? "Target hostname" : "TXT content"}<input value={ip} onChange={e=>setIp(e.target.value)} placeholder={dnsType === "A" ? "192.0.2.10" : dnsType === "AAAA" ? "2001:db8::1" : dnsType === "CNAME" ? "target.example.com" : "verification=abc123"} required/><small>{dnsType === "A" ? "Gunakan IP publik server yang memang kamu kelola." : dnsType === "AAAA" ? "Masukkan alamat IPv6 tujuan." : dnsType === "CNAME" ? "Masukkan hostname, bukan IP address." : "Isi teks verifikasi tanpa baris baru."}</small></label>{["A","AAAA","CNAME"].includes(dnsType)&&<label className="check-row"><input type="checkbox" checked={dnsProxied} onChange={e=>setDnsProxied(e.target.checked)}/> Proxy melalui Cloudflare</label>}<div className="domain-preview"><span className="preview-label">DNS RECORD PREVIEW</span><b>{dnsName === "@" ? `${label||"your-subdomain"}.${suffix}` : `${dnsName}.${label||"your-subdomain"}.${suffix}`}</b><span><Globe2 size={15}/> {dnsType} record <i/> {ip||"Target belum diisi"}</span></div><div className="approval-steps"><div className="step active"><span>1</span><div><b>Submit request</b><small>Permintaan disimpan</small></div></div><ChevronRight size={15}/><div className="step"><span>2</span><div><b>Admin review</b><small>Menunggu persetujuan</small></div></div><ChevronRight size={15}/><div className="step"><span>3</span><div><b>DNS created</b><small>Setelah disetujui</small></div></div></div><button className="btn primary full" disabled={busy||usedSlots>=3}>{busy?"Mengirim…":usedSlots>=3?"Kuota domain penuh":"Submit for approval"} <ArrowUpRight size={17}/></button></form></section><aside className="side-info"><div className="side-card dark-card"><ShieldCheck size={23}/><h3>Approval required</h3><p>Domain tidak langsung aktif. Admin akan memeriksa permintaan terlebih dahulu sebelum membuat DNS record di Cloudflare.</p><div className="side-divider"/><div className="side-stat"><span>Processing</span><b>Admin review</b></div><div className="side-stat"><span>Account limit</span><b>3 domains</b></div></div><div className="side-card"><h3>Before you submit</h3><ul className="check-list"><li><Check size={15}/> Pastikan IP benar</li><li><Check size={15}/> Gunakan nama yang sesuai</li><li><Check size={15}/> Kamu memiliki izin atas server</li><li><Check size={15}/> Hindari layanan phishing/spam</li></ul></div>{adEnabled&&<div className="ad-slot"><span>ADVERTISEMENT</span><div className="ad-symbol">AD</div><b>Space for your next idea.</b><p>Promotional placement</p><small>Slot iklan · integrasikan provider setelah disetujui</small></div>}</aside></div></>}
      {page==="Profile"&&<><div className="page-heading"><div><span className="eyebrow">ACCOUNT</span><h1>Your profile {profile?.role==="admin"&&<VerifiedBadge/>}</h1><p>Kelola informasi dasar akun ELAINA CLOUD.</p></div></div><div className="profile-layout"><div className="panel profile-card"><div className="profile-avatar">{(profile?.display_name||profile?.email||"U").slice(0,1).toUpperCase()}</div><h2 className="profile-name-with-badge">{profile?.display_name||"Your name"}{profile?.role==="admin"&&<VerifiedBadge/>}</h2><p>{profile?.email}</p><span className="role-pill">{profile?.role==="admin"?"Administrator":"Free plan"}</span><div className="profile-quota"><div><span>Domain slots</span><b>{usedSlots}/3</b></div><div className="quota-track"><i style={{width:`${Math.min(100,usedSlots/3*100)}%`}}/></div><small>{Math.max(0,3-usedSlots)} slot tersisa · pending dan aktif dihitung</small></div><div className="profile-divider"/><div className="profile-meta"><span>Account ID</span><code>{profile?.id?.slice(0,8)}…</code></div><div className="profile-meta"><span>Member since</span><code>{session?.user?.created_at?new Date(session.user.created_at).toLocaleDateString("id-ID"):"—"}</code></div></div><div className="panel profile-edit"><div className="panel-heading"><div><h3>Personal information</h3><p>Perbarui nama tampilan kamu.</p></div></div><form onSubmit={saveProfile} className="stack"><label>Display name<input value={profileName} onChange={e=>setProfileName(e.target.value)} maxLength={60} required placeholder="Nama tampilan"/></label><label>Email address<input value={profile?.email||""} disabled/><small>Email dikelola melalui autentikasi Supabase.</small></label><button className="btn primary" disabled={busy}>Save changes <Check size={16}/></button></form><div className="tip-box"><ShieldCheck size={17}/><span>Jangan pernah membagikan password atau token akses kepada siapa pun.</span></div></div></div></>}
      {page==="Settings"&&<><div className="page-heading"><div><span className="eyebrow">PREFERENCES</span><h1>Settings</h1><p>Sesuaikan pengalaman dashboard kamu.</p></div></div><div className="settings-list"><div className="setting-row"><div className="setting-icon">{dark?<Moon size={19}/>:<Sun size={19}/>}</div><div className="setting-copy"><b>Appearance</b><span>Pilih tampilan yang nyaman untuk kamu.</span></div><button className="btn secondary" onClick={()=>setDark(!dark)}>{dark?"Dark mode":"Light mode"} <RefreshCw size={15}/></button></div><div className="setting-row"><div className="setting-icon"><Globe2 size={19}/></div><div className="setting-copy"><b>Default domain suffix</b><span>Semua domain dibuat di zona yang sudah dikonfigurasi.</span></div><code>.{suffix}</code></div><div className="setting-row"><div className="setting-icon"><ShieldCheck size={19}/></div><div className="setting-copy"><b>Approval workflow</b><span>Permintaan wajib disetujui admin sebelum DNS dibuat.</span></div><span className="status-chip">Enabled</span></div><div className="setting-row"><div className="setting-icon"><Zap size={19}/></div><div className="setting-copy"><b>Domain limit</b><span>Batas akun ditetapkan oleh sistem.</span></div><b>3 / account</b></div><div className="setting-row"><div className="setting-icon"><LogOut size={19}/></div><div className="setting-copy"><b>Sign out</b><span>Keluar dari akun di perangkat ini.</span></div><button className="btn danger" onClick={logout}>Logout <ArrowUpRight size={15}/></button></div></div></>}
      {page==="Notifications"&&<><div className="page-heading"><div><span className="eyebrow">UPDATES & MESSAGES</span><h1>Notifications</h1><p>Pengumuman yang dibagikan admin kepada semua pengguna.</p></div><span className="role-pill">{announcements.length} pengumuman</span></div><div className="admin-list">{announcements.map(a=><article key={a.id} className="admin-request notification-page-item"><div className="request-main"><div className="request-domain-icon"><Bell size={18}/></div><div className="request-title"><b>{a.title}</b><span>{new Date(a.created_at).toLocaleString("id-ID")}</span></div></div><p>{a.body}</p></article>)}{announcements.length===0&&<div className="empty-state"><Bell size={27}/><b>Belum ada notifikasi</b><p>Pengumuman baru dari admin akan muncul di sini.</p></div>}</div></>}
      {page==="Tools"&&<><div className="page-heading"><div><span className="eyebrow">API HUB · FRANXHOST</span><h1>Tools & APIs</h1><p>Gunakan endpoint yang tersedia. Respons ditampilkan sebagai JSON.</p></div><button className="btn secondary" onClick={refreshApiTools}><RefreshCw size={15}/> Refresh</button></div>
      {profile?.role==="admin"&&<section className="panel api-manager-panel"><div className="panel-heading"><div className="panel-icon"><Code2 size={19}/></div><div><h3>Tambah API</h3><p>Daftarkan URL tujuan HTTPS. Path publik dibuat otomatis dari kategori dan slug.</p></div></div>
      <form className="stack api-form" onSubmit={saveApiTool}>
        <div className="form-two"><label>Nama API<input value={apiDraft.name} onChange={e=>setApiDraft({...apiDraft,name:e.target.value})} required maxLength={80} placeholder="TikTok Downloader"/></label><label>Kategori<input value={apiDraft.category} onChange={e=>setApiDraft({...apiDraft,category:e.target.value.toLowerCase().replace(/[^a-z0-9-]/g,"")})} required placeholder="tools atau game"/></label></div>
        <label>Deskripsi<input value={apiDraft.description} onChange={e=>setApiDraft({...apiDraft,description:e.target.value})} required maxLength={500} placeholder="Unduh video dari URL TikTok"/></label>
        <div className="form-two"><label>Slug endpoint<input value={apiDraft.slug} onChange={e=>setApiDraft({...apiDraft,slug:e.target.value.toLowerCase().replace(/[^a-z0-9-]/g,"")})} required pattern="[a-z0-9]+(-[a-z0-9]+)*" placeholder="tiktokdl"/></label><label>HTTP method<select value={apiDraft.method} onChange={e=>setApiDraft({...apiDraft,method:e.target.value})}><option>GET</option><option>POST</option><option>PUT</option><option>DELETE</option></select></label></div>
        <label>URL tujuan HTTPS<input type="url" value={apiDraft.target_url} onChange={e=>setApiDraft({...apiDraft,target_url:e.target.value})} required placeholder="https://api.example.com/download"/></label>
        <label>Nama parameter input utama<input value={apiDraft.input_name} onChange={e=>setApiDraft({...apiDraft,input_name:e.target.value})} placeholder="url"/><small>Misalnya `url`. Pemakai mengirim parameter ini sebagai JSON.</small></label>
        <div className="api-path-preview"><span>Endpoint publik</span><code>/api/v1/{apiDraft.category||"tools"}/{apiDraft.slug||"slug"}</code></div>
        <button className="btn primary" disabled={busy}>Tambah API <Plus size={16}/></button>
      </form></section>}
      <div className="api-tool-grid">{apiTools.filter(t=>t.enabled&&!t.locked||profile?.role==="admin").map(tool=><article className="panel api-tool-card" key={tool.id||tool.path}><div className="api-tool-top"><span className="tool-category">{tool.category}</span><span className={`status-chip ${tool.enabled&&!tool.locked?"active":"rejected"}`}>{tool.locked?"Locked":tool.enabled?"Active":"Disabled"}</span></div><h3>{tool.name}{profile?.role==="admin"&&<VerifiedBadge/>}</h3><p>{tool.description}</p><div className="api-path-preview"><span>{tool.method}</span><code>{tool.path}</code></div>
      {tool.enabled&&!tool.locked&&<><label>Input JSON<textarea rows={3} value={apiInputValues[tool.path]??JSON.stringify({[(tool.input_schema?.[0]?.name)||"url"]:""},null,2)} onChange={e=>setApiInputValues(v=>({...v,[tool.path]:e.target.value}))}/></label><button className="btn primary" disabled={apiBusyId===tool.path} onClick={()=>runApiTool(tool)}>{apiBusyId===tool.path?"Memproses…":"Jalankan API"} <ArrowUpRight size={15}/></button>{apiResults[tool.path]&&<pre className="api-result">{apiResults[tool.path]}</pre>}</>}
      {profile?.role==="admin"&&<div className="api-admin-actions"><button className="btn secondary small" onClick={()=>changeApiTool(tool,"toggle")} disabled={busy}>{tool.enabled?"Nonaktifkan":"Aktifkan"}</button><button className="btn secondary small" onClick={()=>changeApiTool(tool,"lock")} disabled={busy}>{tool.locked?"Unlock":"Lock"}</button><button className="btn danger small" onClick={()=>changeApiTool(tool,"delete")} disabled={busy}><Trash2 size={14}/> Hapus</button></div>}
      </article>)}</div>{apiTools.length===0&&<div className="empty-state"><Code2 size={27}/><b>Belum ada API</b><p>{profile?.role==="admin"?"Tambahkan API menggunakan formulir di atas.":"API yang tersedia akan muncul di sini setelah admin menambahkannya."}</p></div>}
      <div className="notice">Keamanan: URL tujuan harus HTTPS dan hostname harus masuk <code>API_PROXY_ALLOWED_HOSTS</code> di environment server. API yang dikunci ditolak oleh backend.</div></>}
      {page==="Help Center"&&<><div className="page-heading"><div><span className="eyebrow">SUPPORT & DOCUMENTATION</span><h1>Help center</h1><p>Panduan singkat untuk mulai menggunakan ELAINA CLOUD.</p></div></div><div className="help-grid"><HelpCard n="01" title="How domain requests work" text="Ajukan nama subdomain dan IPv4 tujuan. Permintaan akan berstatus Pending sampai admin memeriksanya. DNS baru dibuat setelah admin menekan ACC."/><HelpCard n="02" title="Domain limit" text="Setiap akun memiliki maksimal tiga slot untuk permintaan pending atau domain aktif. Permintaan yang ditolak tidak menghabiskan slot."/><HelpCard n="03" title="DNS propagation" text="Setelah disetujui, DNS record dibuat di Cloudflare. Perubahan DNS dapat membutuhkan waktu untuk terlihat di resolver yang berbeda."/><HelpCard n="04" title="Supported targets" text="Versi awal mendukung IPv4 publik melalui A record. Pastikan kamu memiliki izin untuk menggunakan server tujuan tersebut."/><HelpCard n="05" title="Privacy & security" text="Token Cloudflare hanya digunakan di backend. Jangan memasukkan secret, password, atau token API ke kolom IP tujuan."/><HelpCard n="06" title="Need more help?" text="Jika permintaan ditolak atau terjadi error, baca alasan admin dan pastikan konfigurasi zona Cloudflare serta environment variable benar." /></div></>}
      {page==="Admin Panel"&&profile?.role==="admin"&&<><div className="page-heading"><div><span className="eyebrow">SYSTEM ADMINISTRATION</span><h1>Admin panel</h1><p>Review permintaan dan kelola DNS domain pengguna.</p></div><button className="btn secondary" onClick={()=>loadUser(session)}><RefreshCw size={15}/> Refresh data</button></div><div className="stats-grid admin-stats"><Stat title="Total requests" value={adminDomains.length} note="All users" icon={<Globe2 size={18}/>} /><Stat title="Pending review" value={adminDomains.filter(d=>d.status==="pending").length} note="Require action" icon={<Activity size={18}/>} /><Stat title="Active domains" value={adminDomains.filter(d=>d.status==="active").length} note="DNS provisioned" icon={<Check size={18}/>} /><Stat title="Rejected" value={adminDomains.filter(d=>d.status==="rejected").length} note="Not approved" icon={<X size={18}/>} /></div><div className="section-row"><div><h3>Domain requests</h3><p>Persetujuan akan membuat DNS record nyata di Cloudflare.</p></div><span className="role-pill">Admin only</span></div><div className="admin-list">{adminDomains.map(d=><div className="admin-request" key={d.id}><div className="request-main"><div className="request-domain-icon"><Globe2 size={19}/></div><div className="request-title"><b>{d.label}.{suffix}</b><span>{d.profiles?.email||d.user_id} · {d.dns_type||"A"} · {d.dns_name||"@"} → {d.dns_value||d.ip_address||"—"}</span><small>{new Date(d.created_at).toLocaleString("id-ID")}</small></div><Status status={d.status}/></div>{d.status==="pending"?<div className="admin-actions"><input value={adminNote[d.id]||""} onChange={e=>setAdminNote({...adminNote,[d.id]:e.target.value})} placeholder="Catatan admin (wajib untuk penolakan)"/><button className="btn primary" disabled={busy} onClick={()=>reviewDomain(d.id,"approve")}><Check size={15}/> ACC & create DNS</button><button className="btn danger" disabled={busy||!(adminNote[d.id]||"").trim()} onClick={()=>reviewDomain(d.id,"reject")}><X size={15}/> Reject</button></div>:<div className="admin-actions completed"><span className="muted">{d.admin_note||"Tidak ada catatan."}</span>{d.status==="active"&&<button className="btn danger small" onClick={()=>deleteDomain(d.id)} disabled={busy}><Trash2 size={14}/> Delete DNS</button>}</div>}</div>)}{adminDomains.length===0&&<div className="empty-state"><Globe2 size={27}/><b>No requests yet</b><p>Permintaan domain pengguna akan muncul di sini.</p></div>}</div><div className="admin-tools-grid"><section className="panel"><div className="panel-heading"><div className="panel-icon"><Bell size={19}/></div><div><h3>Pengumuman global</h3><p>Pesan ini muncul di notifikasi seluruh pengguna.</p></div></div><form className="stack" onSubmit={publishAnnouncement}><label>Judul pengumuman<input value={announcementTitle} onChange={e=>setAnnouncementTitle(e.target.value)} required maxLength={100} placeholder="Pemeliharaan sistem"/></label><label>Isi pesan<textarea value={announcementBody} onChange={e=>setAnnouncementBody(e.target.value)} required maxLength={1000} rows={4} placeholder="Tulis pengumuman untuk semua user…"/></label><button className="btn primary" disabled={busy}>Kirim ke semua user <ArrowUpRight size={16}/></button></form></section><section className="panel"><div className="panel-heading"><div className="panel-icon"><Zap size={19}/></div><div><h3>Pengaturan banner</h3><p>Banner dashboard yang dilihat semua pengguna.</p></div></div><form className="stack" onSubmit={saveBanner}><label>Judul banner<input value={bannerDraft.title} onChange={e=>setBannerDraft({...bannerDraft,title:e.target.value})} required maxLength={120}/></label><label>Deskripsi<input value={bannerDraft.description} onChange={e=>setBannerDraft({...bannerDraft,description:e.target.value})} required maxLength={250}/></label><label>Upload gambar banner<input type="file" accept="image/png,image/jpeg,image/webp,image/gif" onChange={uploadBannerImage} disabled={busy}/><small>PNG, JPG, WEBP, atau GIF. Maksimal 5 MB. Upload membutuhkan bucket Supabase Storage site-assets.</small></label><label>Atau URL gambar publik<input type="url" value={bannerDraft.image_url} onChange={e=>setBannerDraft({...bannerDraft,image_url:e.target.value})} placeholder="https://…/banner.jpg"/></label><label>Teks tombol<input value={bannerDraft.button_text} onChange={e=>setBannerDraft({...bannerDraft,button_text:e.target.value})} required maxLength={50}/></label><button className="btn primary" disabled={busy}>Simpan banner <Check size={16}/></button></form></section></div></>}
    </div><footer className="main-footer"><span>© 2026 ELAINA CLOUD</span><span><span className="pulse"/> Secure domain management</span><span>v1.1.0</span></footer></main>
    {popupAnnouncement&&<div className="modal-backdrop"><section className="announcement-modal"><button className="modal-close icon-button" onClick={()=>dismissAnnouncement(popupAnnouncement)} aria-label="Tutup"><X size={18}/></button><div className="modal-bell"><Bell size={22}/></div><span className="eyebrow">PENGUMUMAN ELAINA CLOUD</span><h2>{popupAnnouncement.title}</h2><p>{popupAnnouncement.body}</p><small>{new Date(popupAnnouncement.created_at).toLocaleString("id-ID")}</small><button className="btn primary full" onClick={()=>dismissAnnouncement(popupAnnouncement)}>Mengerti, tutup</button></section></div>}
    
    </div>;
}

function VerifiedBadge(){return <span className="verified-badge" title="Admin terverifikasi" aria-label="Admin terverifikasi"><BadgeCheck size={17} fill="currentColor" strokeWidth={2.5}/></span>}
function Stat({title,value,note,icon}:{title:string;value:number|string;note:string;icon:React.ReactNode}){return <div className="stat-card"><div className="stat-top"><span>{title}</span><i>{icon}</i></div><b className="stat-value">{value}</b><span className="stat-note">{note}</span></div>}
function Status({status}:{status:string}){const labels:Record<string,string>={pending:"Pending",active:"Active",rejected:"Rejected",approved:"Approved",provisioning:"Provisioning"};return <span className={`status-chip ${status}`}>{status==="active"&&<span className="pulse"/>}{labels[status]||status}</span>}
function DomainTable({domains,empty,onDelete,isAdmin}:{domains:Domain[];empty:string;onDelete:(id:string)=>void;isAdmin:boolean}){return <div className="table-wrap"><table><thead><tr><th>DOMAIN</th><th>DNS TARGET</th><th>STATUS</th><th>CREATED</th>{isAdmin&&<th>ACTION</th>}</tr></thead><tbody>{domains.map(d=><tr key={d.id}><td><div className="domain-cell"><span className="table-globe"><Globe2 size={16}/></span><div><b>{d.fqdn||`${d.label}.${suffix}`}</b><small>{d.status==="active"?"DNS record provisioned":d.status==="pending"?"Awaiting admin review":d.admin_note||"Domain request"}</small></div></div></td><td><code>{d.dns_type||"A"} · {d.dns_value||d.ip_address||"—"}</code></td><td><Status status={d.status}/></td><td>{new Date(d.created_at).toLocaleDateString("id-ID")}</td>{isAdmin&&<td><button className="icon-button" onClick={()=>onDelete(d.id)}><Trash2 size={16}/></button></td>}</tr>)}</tbody></table>{domains.length===0&&<div className="empty-state"><Globe2 size={27}/><b>No domains yet</b><p>{empty}</p></div>}</div>}
function HelpCard({n,title,text}:{n:string;title:string;text:string}){return <div className="help-card"><span>{n}</span><h3>{title}</h3><p>{text}</p></div>}
