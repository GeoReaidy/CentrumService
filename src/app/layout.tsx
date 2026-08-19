import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { SiteHeader } from "@/components/SiteHeader";
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
  title: "Centrum Service",
  description: "Reliable internet service across North Bekaa.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" className={`${geistSans.variable} ${geistMono.variable}`}>
      <body>
        <SiteHeader />
        <main className="container content">{children}</main>
        <footer className="site-footer">
          <div className="container">
            <p>Centrum Service © {new Date().getFullYear()} - Reliable internet for Bekaa.</p>
          </div>
        </footer>
      </body>
    </html>
  );
}
