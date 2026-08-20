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
        src: "/icon",
        sizes: "64x64",
        type: "image/png",
      },
      {
        src: "/apple-icon",
        sizes: "180x180",
        type: "image/png",
      },
    ],
  };
}
