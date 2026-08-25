import type { MetadataRoute } from "next";

const BASE_URL = "https://centrumservice.net";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      allow: "/",
      disallow: [
        "/admin/",
        "/manager/",
        "/portal/dashboard",
        "/portal/account",
        "/portal/tickets/",
        "/portal/live-chat",
        "/portal/reset-password",
        "/portal/email-confirmed",
      ],
    },
    sitemap: `${BASE_URL}/sitemap.xml`,
    host: BASE_URL,
  };
}
