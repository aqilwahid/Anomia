import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { Inter, Plus_Jakarta_Sans } from "next/font/google";
import "./globals.css";

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
});

const plusJakartaSans = Plus_Jakarta_Sans({
  variable: "--font-plus-jakarta-sans",
  subsets: ["latin"],
  weight: ["600", "700", "800"],
});

export const metadata: Metadata = {
  title: "Anomia",
  description: "Kenali dan petakan peserta training lewat foto wajah.",
  icons: {
    apple: "/logo-icon.png",
  },
  openGraph: {
    title: "Anomia",
    description: "Kenali dan petakan peserta training lewat foto wajah.",
    images: ["/backdrop.png"],
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html
      lang="en"
      className={`${inter.variable} ${plusJakartaSans.variable} h-full antialiased`}
    >
      <head>
        {/* eslint-disable-next-line @next/next/no-page-custom-font -- icon ligature font, not available via next/font/google */}
        <link
          href="https://fonts.googleapis.com/css2?family=Material+Symbols+Outlined:opsz,wght,FILL,GRAD@20..48,100..700,0..1,-50..200&display=swap"
          rel="stylesheet"
        />
      </head>
      <body
        className="min-h-full flex flex-col font-body-md text-body-md text-on-surface bg-surface"
        suppressHydrationWarning
      >
        <header className="border-b border-border-subtle bg-surface-card no-print">
          <div className="flex w-full items-center gap-2 px-layout-gutter-mobile py-3 md:px-layout-gutter-desktop">
            <Link href="/" className="flex items-center gap-2">
              <Image src="/logo-icon.png" alt="" width={28} height={28} className="h-7 w-7" />
              <span className="font-headline-sm text-headline-sm text-on-surface tracking-tight">
                Anomia
              </span>
            </Link>
          </div>
        </header>
        <main className="flex-1">{children}</main>
      </body>
    </html>
  );
}
