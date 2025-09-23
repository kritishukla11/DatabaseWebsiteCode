import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import Link from "next/link";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Brunk Lab Protein Database",
  description: "Protein, pathway, and drug search platform",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body className={`${geistSans.variable} ${geistMono.variable}`}>
        <header>
          <nav className="toolbar">
            {/* Left side */}
            <div className="toolbar-left">
              <Link href="/">Home</Link>
            </div>

            {/* Right side */}
            <div className="toolbar-right">
              <Link href="/about">About</Link>
              <Link href="/downloads">Downloads</Link>
              <Link href="/user-guide">User Guide</Link>
            </div>
          </nav>
        </header>

        <main style={{ padding: "1.5rem" }}>{children}</main>
      </body>
    </html>
  );
}

