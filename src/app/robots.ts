import type { MetadataRoute } from "next";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      allow: "/",
      disallow: ["/admin", "/admin/", "/portal", "/portal/"],
    },
    sitemap: "https://centrumservice.net/sitemap.xml",
    host: "https://centrumservice.net",
  };
}
