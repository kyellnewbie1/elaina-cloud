import type { Metadata, Viewport } from "next";
import "./globals.css";
export const metadata: Metadata = {
  title: "ELAINA CLOUD — Domain Control",
  description: "Kelola subdomain dengan sederhana. Permintaan domain diproses melalui persetujuan admin.",
  applicationName: "ELAINA CLOUD",
  icons: { icon: "/favicon.svg" },
  openGraph: { title: "ELAINA CLOUD", description: "Simple domain management, built for you.", type: "website" }
};
export const viewport: Viewport = { themeColor: "#ffffff", width: "device-width", initialScale: 1 };
export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="id" suppressHydrationWarning><body>{children}</body></html>;
}
