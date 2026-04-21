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
        <div className="mx-auto flex min-h-full w-full max-w-6xl flex-col px-4 py-6 sm:px-6 lg:px-8">
          <header className="rounded-2xl border border-sky-300/20 bg-slate-900/60 px-4 py-4 backdrop-blur sm:px-6">
            <div className="flex flex-wrap items-center justify-between gap-4">
              <div>
                <p className="text-xs uppercase tracking-[0.2em] text-sky-300">
                  CS Price Tracker
                </p>
              </div>
              <nav className="flex flex-wrap gap-2 text-sm">
                <Link className="rounded-full bg-slate-800 px-4 py-2 hover:bg-slate-700" href="/">
                  Dashboard
                </Link>
                <Link
                  className="rounded-full bg-slate-800 px-4 py-2 hover:bg-slate-700"
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
