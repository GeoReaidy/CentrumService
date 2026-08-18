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
  title: "BekaaNet",
  description: "Internet provider in Bekaa serving Deir el Ahmar, Chlifa, and nearby areas.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`${geistSans.variable} ${geistMono.variable}`}>
      <body>
        <header className="site-header">
          <div className="container nav-wrap">
            <Link href="/" className="brand">
              BekaaNet
            </Link>
            <nav className="main-nav">
              <Link href="/">Home</Link>
              <Link href="/coverage">Coverage</Link>
              <Link href="/plans">Plans</Link>
              <Link href="/contact">Contact</Link>
              <Link href="/portal/login">Portal</Link>
              <Link href="/admin">Admin</Link>
            </nav>
          </div>
        </header>
        <main className="container content">{children}</main>
        <footer className="site-footer">
          <div className="container">
            <p>BekaaNet © {new Date().getFullYear()} - Reliable internet for Bekaa.</p>
          </div>
        </footer>
      </body>
    </html>
  );
}
