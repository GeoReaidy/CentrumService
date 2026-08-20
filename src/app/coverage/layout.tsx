import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Internet Coverage in North Bekaa",
  description:
    "Check Centrum Service coverage areas across North Bekaa and ask us to confirm internet availability at your exact address.",
  alternates: {
    canonical: "/coverage",
  },
  openGraph: {
    url: "/coverage",
    title: "Internet Coverage in North Bekaa | Centrum Service",
    description:
      "Check Centrum Service coverage areas across North Bekaa and ask us to confirm internet availability at your exact address.",
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
    title: "Internet Coverage in North Bekaa | Centrum Service",
    description: "Check Centrum Service coverage areas across North Bekaa and ask us to confirm internet availability at your exact address.",
    images: ["/opengraph-image"],
  },
};

export default function CoverageLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return children;
}
