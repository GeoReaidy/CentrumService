import type { NextConfig } from "next";

const isDevelopment = process.env.NODE_ENV !== "production";

const contentSecurityPolicy = [
  "default-src 'self'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
  "object-src 'none'",
  "img-src 'self' data: blob: https://*.supabase.co",
  "font-src 'self' data:",
  "style-src 'self' 'unsafe-inline'",
  [
    "script-src 'self' 'unsafe-inline'",
    // React / Turbopack uses eval() for development-only debugging helpers.
    // Production intentionally does NOT receive unsafe-eval.
    isDevelopment ? "'unsafe-eval'" : "",
    "https://challenges.cloudflare.com",
  ].filter(Boolean).join(" "),
  "frame-src https://challenges.cloudflare.com",
  isDevelopment
    ? "connect-src 'self' http: https: ws: wss:"
    : "connect-src 'self' https://*.supabase.co wss://*.supabase.co https://challenges.cloudflare.com",
  // Do not force localhost/http development traffic to HTTPS.
  ...(isDevelopment ? [] : ["upgrade-insecure-requests"]),
].join("; ");

const securityHeaders = [
  { key: "Content-Security-Policy", value: contentSecurityPolicy },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), payment=(), usb=()" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
];

const nextConfig: NextConfig = {
  async headers() {
    return [{ source: "/(.*)", headers: securityHeaders }];
  },
};

export default nextConfig;
