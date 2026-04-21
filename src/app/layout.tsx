import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import Link from "next/link";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: {
    default: "CS Price Tracker",
    template: "%s | CS Price Tracker",
  },
  description: "Track CS market prices with local-only user storage.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full bg-slate-950 text-slate-100">
        <div className="mx-auto flex min-h-full w-full max-w-7xl flex-col px-4 py-6 sm:px-6 lg:px-10">
          <header className="rounded-xl border border-[#2b3b4b] bg-gradient-to-b from-[#1f2d3a] to-[#121a24] px-4 py-4 shadow-[0_14px_30px_rgba(0,0,0,0.38)] sm:px-6">
            <div className="flex flex-wrap items-center justify-between gap-4">
              <div>
                <p className="text-[11px] uppercase tracking-[0.22em] text-[#89a9c3]">
                  CS Price Tracker
                </p>
                <p className="mt-1 text-sm font-medium text-[#d9e7f5]">Community Market Watch</p>
              </div>
              <nav className="flex flex-wrap gap-2 text-sm">
                <Link
                  className="cursor-pointer rounded-md border border-[#2d4155] bg-gradient-to-b from-[#2a4864] to-[#20374d] px-4 py-2 font-medium text-[#c7d5e0] shadow-[inset_0_1px_0_rgba(255,255,255,0.06)] hover:from-[#346088] hover:to-[#284965]"
                  href="/"
                >
                  Watchlist
                </Link>
                <Link
                  className="cursor-pointer rounded-md border border-[#2d4155] bg-gradient-to-b from-[#2a4864] to-[#20374d] px-4 py-2 font-medium text-[#c7d5e0] shadow-[inset_0_1px_0_rgba(255,255,255,0.06)] hover:from-[#346088] hover:to-[#284965]"
                  href="/games"
                >
                  Daily Games
                </Link>
                <Link
                  className="cursor-pointer rounded-md border border-[#2d4155] bg-gradient-to-b from-[#2a4864] to-[#20374d] px-4 py-2 font-medium text-[#c7d5e0] shadow-[inset_0_1px_0_rgba(255,255,255,0.06)] hover:from-[#346088] hover:to-[#284965]"
                  href="/settings"
                >
                  Settings
                </Link>
              </nav>
            </div>
          </header>
          <main className="flex-1 py-6">{children}</main>
        </div>
      </body>
    </html>
  );
}
