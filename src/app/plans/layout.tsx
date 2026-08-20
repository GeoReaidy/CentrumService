import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Internet Plans & Pricing in North Bekaa",
  description:
    "Compare Centrum Service internet plans, speeds, monthly quotas, and pricing for homes and businesses in North Bekaa.",
  alternates: {
    canonical: "/plans",
  },
  openGraph: {
    url: "/plans",
    title: "Internet Plans & Pricing in North Bekaa | Centrum Service",
    description:
      "Compare Centrum Service internet plans, speeds, monthly quotas, and pricing for homes and businesses in North Bekaa.",
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
    title: "Internet Plans & Pricing in North Bekaa | Centrum Service",
    description: "Compare Centrum Service internet plans, speeds, monthly quotas, and pricing for homes and businesses in North Bekaa.",
    images: ["/opengraph-image"],
  },
};

export default function PlansLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return children;
}
