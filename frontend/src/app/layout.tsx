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
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className={`${geistSans.variable} ${geistMono.variable}`}>
        {/* Sticky Header */}
        <header className="sticky top-0 z-50 bg-white shadow-md">
          <nav className="max-w-6xl mx-auto flex flex-wrap justify-center gap-6 p-4">
            <Link href="/" legacyBehavior>
              <a className="px-4 py-2 rounded-lg border-2 border-[#7BAFD4] text-[#005A9C] font-semibold hover:bg-[#7BAFD4] hover:text-white transition">
                Home
              </a>
            </Link>
            <Link href="/about" legacyBehavior>
              <a className="px-4 py-2 rounded-lg border-2 border-[#7BAFD4] text-[#005A9C] font-semibold hover:bg-[#7BAFD4] hover:text-white transition">
                About
              </a>
            </Link>
            <Link href="/downloads" legacyBehavior>
              <a className="px-4 py-2 rounded-lg border-2 border-[#7BAFD4] text-[#005A9C] font-semibold hover:bg-[#7BAFD4] hover:text-white transition">
                Downloads
              </a>
            </Link>
            <Link href="/user-guide" legacyBehavior>
              <a className="px-4 py-2 rounded-lg border-2 border-[#7BAFD4] text-[#005A9C] font-semibold hover:bg-[#7BAFD4] hover:text-white transition">
                User Guide
              </a>
            </Link>
          </nav>
        </header>

        {/* Page content */}
        <main className="p-6">{children}</main>
      </body>
    </html>
  );
}

