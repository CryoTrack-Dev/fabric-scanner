import type { Metadata } from "next";
import Link from "next/link";
import { SearchBar } from "@/components/SearchBar";
import "./globals.css";

export const metadata: Metadata = {
  title: "CryoTrack Fabric Scanner",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="bg-slate-950 text-slate-100 antialiased">
        <header className="border-b border-slate-800 px-6 py-4">
          <div className="mx-auto flex max-w-6xl items-center justify-between gap-6">
            <nav className="flex items-center gap-6 text-sm font-medium">
              <Link href="/">CryoTrack Scanner</Link>
              <Link href="/blocks" className="text-slate-400 hover:text-slate-100">
                Blocks
              </Link>
              <Link href="/transactions" className="text-slate-400 hover:text-slate-100">
                Transactions
              </Link>
            </nav>
            <SearchBar />
          </div>
        </header>
        <div className="mx-auto max-w-6xl px-6 py-8">{children}</div>
      </body>
    </html>
  );
}
