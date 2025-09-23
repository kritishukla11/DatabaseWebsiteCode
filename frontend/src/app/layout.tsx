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
        <header className="sticky top-0 z-50 bg-[#7BAFD4] text-white p-4 flex gap-6 font-semibold shadow-md">
          <Link href="/" className="hover:underline">Home</Link>
          <Link href="/about" className="hover:underline">About</Link>
          <Link href="/downloads" className="hover:underline">Downloads</Link>
          <Link href="/user-guide" className="hover:underline">User Guide</Link>
        </header>

        {/* Page content */}
        <main className="p-6">{children}</main>
      </body>
    </html>
  );
}
