import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { SiteHeader } from "@/components/SiteHeader";
import { SiteFooter } from "@/components/SiteFooter";
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
  metadataBase: new URL("https://centrumservice.net"),
  title: {
    default: "Centrum Service | Internet Provider in North Bekaa",
    template: "%s | Centrum Service",
  },
  description:
    "Local internet service for homes and businesses across North Bekaa. View plans, check coverage, and contact Centrum Service.",
  alternates: {
    canonical: "/",
  },
  openGraph: {
    type: "website",
    locale: "en_LB",
    url: "/",
    siteName: "Centrum Service",
    title: "Centrum Service | Internet Provider in North Bekaa",
    description:
      "Local internet service for homes and businesses across North Bekaa. View plans, check coverage, and contact Centrum Service.",
    images: [
      {
        url: "/opengraph-image",
        width: 1200,
        height: 630,
        alt: "Centrum Service — local internet service in North Bekaa",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "Centrum Service | Internet Provider in North Bekaa",
    description:
      "Local internet service for homes and businesses across North Bekaa. View plans, check coverage, and contact Centrum Service.",
    images: ["/opengraph-image"],
  },
  manifest: "/manifest.webmanifest",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" className={`${geistSans.variable} ${geistMono.variable}`}>
      <body>
        <a className="skip-link" href="#main-content">Skip to main content</a>
        <SiteHeader />
        <main id="main-content" className="container content" tabIndex={-1}>{children}</main>
        <SiteFooter />
      </body>
    </html>
  );
}
