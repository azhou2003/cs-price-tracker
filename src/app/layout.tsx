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
      <body className="min-h-full bg-[var(--background)] text-[var(--foreground)]">
        <div className="mx-auto flex min-h-full w-full max-w-7xl flex-col px-3 py-4 sm:px-5 sm:py-5 lg:px-8">
          <header className="panel px-4 py-3 sm:px-5">
            <div className="flex flex-wrap items-center justify-between gap-4">
              <div>
                <p className="label-caps">
                  CS Price Tracker
                </p>
                <p className="mt-1 text-sm font-semibold text-[#e4e7eb]">Community Market Watch</p>
              </div>
              <nav className="flex flex-wrap gap-2">
                <Link
                  className="btn btn-muted"
                  href="/"
                >
                  Watchlist
                </Link>
                <Link
                  className="btn btn-muted"
                  href="/games"
                >
                  Daily Games
                </Link>
                <Link
                  className="btn btn-muted"
                  href="/settings"
                >
                  Settings
                </Link>
              </nav>
            </div>
          </header>
          <main className="flex-1 py-4 sm:py-5">{children}</main>
        </div>
      </body>
    </html>
  );
}
