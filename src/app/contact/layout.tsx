import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Contact Centrum Service",
  description:
    "Contact Centrum Service for coverage checks, new subscriptions, billing questions, and technical support in North Bekaa.",
  alternates: {
    canonical: "/contact",
  },
  openGraph: {
    url: "/contact",
    title: "Contact Centrum Service | Internet Support in North Bekaa",
    description:
      "Contact Centrum Service for coverage checks, new subscriptions, billing questions, and technical support in North Bekaa.",
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
    title: "Contact Centrum Service | Internet Support in North Bekaa",
    description: "Contact Centrum Service for coverage checks, new subscriptions, billing questions, and technical support in North Bekaa.",
    images: ["/opengraph-image"],
  },
};

export default function ContactLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return children;
}
