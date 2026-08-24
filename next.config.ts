import type { NextConfig } from "next";

const isDevelopment = process.env.NODE_ENV !== "production";

const contentSecurityPolicy = [
  "default-src 'self'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
  "object-src 'none'",

  // Centrum assets + Supabase + Google Maps tiles / Places imagery.
  "img-src 'self' data: blob: https://*.supabase.co https://*.googleapis.com https://*.gstatic.com https://*.google.com https://*.googleusercontent.com https://*.ggpht.com",

  // Google Maps may load its own font resources.
  "font-src 'self' data: https://fonts.gstatic.com",

  // Existing inline styles are retained; Google Maps/Places may load Google Fonts CSS.
  "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",

  [
    "script-src 'self' 'unsafe-inline' 'unsafe-eval'",
    "https://challenges.cloudflare.com",
    "https://*.googleapis.com",
    "https://*.gstatic.com",
  ].join(" "),

  "frame-src https://challenges.cloudflare.com https://*.google.com",

  isDevelopment
    ? "connect-src 'self' http: https: ws: wss: data: blob:"
    : "connect-src 'self' https://*.supabase.co wss://*.supabase.co https://challenges.cloudflare.com https://*.googleapis.com https://*.gstatic.com https://*.google.com data: blob:",

  // Some Maps internals use blob-backed workers.
  "worker-src 'self' blob:",

  // Do not force localhost/http development traffic to HTTPS.
  ...(isDevelopment ? [] : ["upgrade-insecure-requests"]),
].join("; ");

const securityHeaders = [
  { key: "Content-Security-Policy", value: contentSecurityPolicy },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  // Allow this origin to request the user's location when they explicitly choose to share it.
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(self), payment=(), usb=()" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
];

const nextConfig: NextConfig = {
  async headers() {
    return [{ source: "/(.*)", headers: securityHeaders }];
  },
};

export default nextConfig;
