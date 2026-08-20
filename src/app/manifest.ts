import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Centrum Service",
    short_name: "Centrum",
    description: "Local internet service for homes and businesses across North Bekaa.",
    start_url: "/",
    display: "standalone",
    background_color: "#05070f",
    theme_color: "#091122",
    icons: [
      {
        src: "/brand/centrum-mark-192.png",
        sizes: "192x192",
        type: "image/png",
        purpose: "any",
      },
      {
        src: "/brand/centrum-mark-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "any",
      },
    ],
  };
}
