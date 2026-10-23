import Link from "next/link";
import { ArrowLeft, CloudOff } from "lucide-react";

export default function NotFound() {
  return <main className="not-found-page"><div className="not-found-card"><span className="not-found-icon"><CloudOff size={28}/></span><span className="eyebrow">ERROR 404</span><h1>Halaman tidak ditemukan</h1><p>Alamat ini tidak tersedia atau sudah dipindahkan. Periksa kembali URL yang kamu buka.</p><Link href="/" className="btn primary"><ArrowLeft size={16}/> Kembali ke ELAINA CLOUD</Link></div></main>;
}
