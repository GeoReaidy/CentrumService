import { createClient } from "npm:@supabase/supabase-js@2";

type RequestBody = {
  name?: unknown;
  email?: unknown;
  phone?: unknown;
  subject?: unknown;
  message?: unknown;
  website?: unknown;
  captcha_token?: unknown;
};

const MAX_BODY_BYTES = 24_000;
const RATE_LIMIT = 5;
const RATE_WINDOW_MS = 60 * 60 * 1000;
const DEFAULT_ORIGINS = ["https://centrumservice.net", "https://www.centrumservice.net"];

function requestId() {
  return crypto.randomUUID();
}

function readSecretKey() {
  const legacy = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (legacy) return legacy;
  const single = Deno.env.get("SUPABASE_SECRET_KEY");
  if (single) return single;
  const raw = Deno.env.get("SUPABASE_SECRET_KEYS");
  if (!raw) return null;
  try {
    const keys = JSON.parse(raw) as Record<string, string>;
    return keys.default ?? Object.values(keys)[0] ?? null;
  } catch {
    return null;
  }
}

function allowedOrigins() {
  const configured = Deno.env.get("CENTRUM_ALLOWED_ORIGINS");
  const extra = configured
    ? configured.split(",").map((value) => value.trim()).filter(Boolean)
    : [];
  return new Set([...DEFAULT_ORIGINS, ...extra]);
}

function isCentrumOrigin(origin: string) {
  if (allowedOrigins().has(origin)) return true;

  try {
    const url = new URL(origin);

    // Local development only. CORS is not authentication; production requests
    // are still protected by rate limiting / validation in the function body.
    if (url.protocol === "http:" && (url.hostname === "localhost" || url.hostname === "127.0.0.1")) {
      return true;
    }

    // Allow Centrum's own Netlify production/branch/deploy URLs, e.g.
    // centrum-beta-v3--centrumservice.netlify.app or <deploy>--centrumservice.netlify.app.
    if (url.protocol === "https:" && (
      url.hostname === "centrumservice.netlify.app" ||
      url.hostname.endsWith("--centrumservice.netlify.app")
    )) {
      return true;
    }
  } catch {
    return false;
  }

  return false;
}

function originHeaders(request: Request) {
  const origin = request.headers.get("origin");
  if (!origin || !isCentrumOrigin(origin)) return null;
  return {
    "access-control-allow-origin": origin,
    "access-control-allow-headers": "authorization, x-client-info, apikey, content-type",
    "access-control-allow-methods": "POST, OPTIONS",
    "vary": "Origin",
  };
}

function json(request: Request, body: unknown, status = 200) {
  const cors = originHeaders(request) ?? {};
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...cors,
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
      "x-content-type-options": "nosniff",
    },
  });
}

function text(value: unknown, max: number) {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}

function nullableText(value: unknown, max: number) {
  const valueText = text(value, max);
  return valueText || null;
}

function clientIp(request: Request) {
  return (
    request.headers.get("cf-connecting-ip") ||
    request.headers.get("x-real-ip") ||
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    "unknown"
  );
}

async function hashIp(ip: string, salt: string) {
  const payload = new TextEncoder().encode(`${salt}:${ip}`);
  const digest = await crypto.subtle.digest("SHA-256", payload);
  return Array.from(new Uint8Array(digest)).map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

async function verifyTurnstile(token: string, ip: string) {
  const secret = Deno.env.get("TURNSTILE_SECRET_KEY");
  if (!secret) return true;
  if (!token) return false;

  const form = new FormData();
  form.set("secret", secret);
  form.set("response", token);
  if (ip !== "unknown") form.set("remoteip", ip);

  const response = await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", {
    method: "POST",
    body: form,
  });
  if (!response.ok) return false;
  const result = await response.json() as { success?: boolean };
  return result.success === true;
}

const supabaseUrl = Deno.env.get("SUPABASE_URL");
const secretKey = readSecretKey();
if (!supabaseUrl || !secretKey) throw new Error("Server credentials unavailable.");

const admin = createClient(supabaseUrl, secretKey, {
  auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
});

Deno.serve(async (request: Request) => {
  const rid = requestId();
  const cors = originHeaders(request);

  if (request.method === "OPTIONS") {
    if (!cors) return new Response(null, { status: 403 });
    return new Response(null, { status: 204, headers: cors });
  }
  if (!cors) return json(request, { error: "Request origin is not allowed.", request_id: rid }, 403);
  if (request.method !== "POST") return json(request, { error: "Method not allowed.", request_id: rid }, 405);

  try {
    const contentLength = Number(request.headers.get("content-length") ?? "0");
    if (contentLength > MAX_BODY_BYTES) {
      return json(request, { error: "Request is too large.", request_id: rid }, 413);
    }

    const raw = await request.text();
    if (new TextEncoder().encode(raw).byteLength > MAX_BODY_BYTES) {
      return json(request, { error: "Request is too large.", request_id: rid }, 413);
    }

    let body: RequestBody;
    try {
      body = JSON.parse(raw || "{}") as RequestBody;
    } catch {
      return json(request, { error: "Invalid request.", request_id: rid }, 400);
    }

    if (text(body.website, 120)) return json(request, { ok: true, request_id: rid }, 201);

    const name = text(body.name, 120);
    const email = text(body.email, 254).toLowerCase();
    const subject = text(body.subject, 180);
    const message = text(body.message, 4000);
    if (!name || !/^\S+@\S+\.\S+$/.test(email) || !subject || !message) {
      return json(request, { error: "Please provide a valid name, email, subject, and message.", request_id: rid }, 400);
    }

    const ip = clientIp(request);
    const salt = Deno.env.get("CENTRUM_RATE_LIMIT_SALT") || secretKey;
    const ipHash = await hashIp(ip, salt);
    const cutoff = new Date(Date.now() - RATE_WINDOW_MS).toISOString();

    const { count, error: rateError } = await admin
      .from("form_rate_limits")
      .select("id", { count: "exact", head: true })
      .eq("form_name", "contact")
      .eq("ip_hash", ipHash)
      .gte("created_at", cutoff);
    if (rateError) throw rateError;
    if ((count ?? 0) >= RATE_LIMIT) {
      return json(request, { error: "Too many messages were sent from this connection. Please try again later.", request_id: rid }, 429);
    }

    const captchaToken = text(body.captcha_token, 4096);
    if (!(await verifyTurnstile(captchaToken, ip))) {
      return json(request, { error: "Please complete the security check and try again.", request_id: rid }, 400);
    }

    const { error: ledgerError } = await admin.from("form_rate_limits").insert({
      form_name: "contact",
      ip_hash: ipHash,
    });
    if (ledgerError) throw ledgerError;

    let customerId: string | null = null;
    const bearer = request.headers.get("authorization")?.match(/^Bearer\s+(.+)$/i)?.[1];
    if (bearer) {
      const { data } = await admin.auth.getUser(bearer);
      customerId = data.user?.id ?? null;
    }

    const { error: insertError } = await admin.from("contact_inquiries").insert({
      customer_id: customerId,
      name,
      email,
      phone: nullableText(body.phone, 80),
      subject,
      message,
      status: "new",
    });
    if (insertError) throw insertError;

    return json(request, { ok: true, request_id: rid }, 201);
  } catch (error) {
    console.error("contact-submit failure", { request_id: rid, error });
    return json(request, { error: "Could not send your message right now. Please try again later.", request_id: rid }, 500);
  }
});
