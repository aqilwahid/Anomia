import type { Metadata, Viewport } from "next";
import Image from "next/image";
import Link from "next/link";
import localFont from "next/font/local";
import { ShieldCheck } from "lucide-react";
import { Providers } from "@/ui/Providers";
import "./globals.css";

// Self-hosted (from @fontsource-variable) so the app renders correctly offline in the
// training room and no request goes to Google Fonts.
const inter = localFont({
  variable: "--font-inter",
  display: "swap",
  src: [
    { path: "../../node_modules/@fontsource-variable/inter/files/inter-latin-wght-normal.woff2", weight: "100 900" },
    { path: "../../node_modules/@fontsource-variable/inter/files/inter-latin-ext-wght-normal.woff2", weight: "100 900" },
  ],
});

const plusJakartaSans = localFont({
  variable: "--font-plus-jakarta-sans",
  display: "swap",
  src: [
    {
      path: "../../node_modules/@fontsource-variable/plus-jakarta-sans/files/plus-jakarta-sans-latin-wght-normal.woff2",
      weight: "200 800",
    },
  ],
});

const siteUrl = process.env.VERCEL_PROJECT_PRODUCTION_URL
  ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`
  : process.env.VERCEL_URL
    ? `https://${process.env.VERCEL_URL}`
    : "http://localhost:3000";

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title: { default: "Anomia", template: "%s · Anomia" },
  description: "Kenali dan petakan peserta training lewat foto wajah dan denah ruangan.",
  icons: {
    apple: "/logo-icon.png",
  },
  openGraph: {
    title: "Anomia",
    description: "Kenali dan petakan peserta training lewat foto wajah dan denah ruangan.",
    images: ["/backdrop.png"],
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#ffffff",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="id" className={`${inter.variable} ${plusJakartaSans.variable} h-full antialiased`}>
      <body
        className="min-h-full flex flex-col font-body-md text-body-md text-on-surface bg-surface"
        suppressHydrationWarning
      >
        <Providers>
          <header className="sticky top-0 z-40 border-b border-border-subtle bg-surface-card/90 backdrop-blur no-print">
            <div className="flex w-full items-center justify-between gap-3 px-layout-gutter-mobile py-2.5 md:px-layout-gutter-desktop">
              <Link href="/" className="flex items-center gap-2 rounded-lg -mx-1 px-1 hover:bg-surface-container-low">
                <Image src="/logo-icon.png" alt="" width={28} height={28} className="h-7 w-7" priority />
                <span className="font-headline-sm text-headline-sm text-on-surface tracking-tight">Anomia</span>
              </Link>
              <span
                className="inline-flex items-center gap-1.5 rounded-full bg-surface-slate px-2.5 py-1 text-label-sm font-label-sm text-on-surface-variant"
                title="Foto, wajah, dan data peserta hanya disimpan di browser perangkat ini (IndexedDB). Tidak ada yang dikirim ke server."
              >
                <ShieldCheck size={14} className="text-confidence-high" aria-hidden />
                <span className="hidden sm:inline">Data tersimpan lokal di browser ini</span>
                <span className="sm:hidden">Lokal</span>
              </span>
            </div>
          </header>
          <main className="flex-1">{children}</main>
        </Providers>
      </body>
    </html>
  );
}
