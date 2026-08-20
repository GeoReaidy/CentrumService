import { createClient } from "npm:@supabase/supabase-js@2";

type RequestBody = {
  full_name?: unknown;
  email?: unknown;
  phone?: unknown;
  address?: unknown;
  service_type?: unknown;
  people_count?: unknown;
  device_count?: unknown;
  usage_types?: unknown;
  budget_range?: unknown;
  preferred_plan_id?: unknown;
  preferred_plan_name?: unknown;
  current_provider?: unknown;
  notes?: unknown;
  website?: unknown;
  captcha_token?: unknown;
};

const MAX_BODY_BYTES = 32_000;
const RATE_LIMIT = 4;
const RATE_WINDOW_MS = 60 * 60 * 1000;
const DEFAULT_ORIGINS = ["https://centrumservice.net", "https://www.centrumservice.net"];

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
  } catch { return null; }
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

function response(request: Request, body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...(originHeaders(request) ?? {}),
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
      "x-content-type-options": "nosniff",
    },
  });
}

function text(value: unknown, max = 500) {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}
function nullableText(value: unknown, max = 500) {
  const normalized = text(value, max);
  return normalized || null;
}
function escapeHtml(value: string) {
  return value.replace(/[&<>'"]/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" }[character] ?? character));
}
function clientIp(request: Request) {
  return request.headers.get("cf-connecting-ip") || request.headers.get("x-real-ip") || request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
}
async function hashIp(ip: string, salt: string) {
  const bytes = new TextEncoder().encode(`${salt}:${ip}`);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest)).map((b) => b.toString(16).padStart(2, "0")).join("");
}
async function verifyTurnstile(token: string, ip: string) {
  const secret = Deno.env.get("TURNSTILE_SECRET_KEY");
  if (!secret) return true;
  if (!token) return false;
  const form = new FormData();
  form.set("secret", secret);
  form.set("response", token);
  if (ip !== "unknown") form.set("remoteip", ip);
  const verify = await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", { method: "POST", body: form });
  if (!verify.ok) return false;
  const result = await verify.json() as { success?: boolean };
  return result.success === true;
}

const supabaseUrl = Deno.env.get("SUPABASE_URL");
const key = readSecretKey();
if (!supabaseUrl || !key) throw new Error("Server credentials unavailable.");
const admin = createClient(supabaseUrl, key, { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } });

Deno.serve(async (request) => {
  const rid = crypto.randomUUID();
  const cors = originHeaders(request);
  if (request.method === "OPTIONS") {
    if (!cors) return new Response(null, { status: 403 });
    return new Response(null, { status: 204, headers: cors });
  }
  if (!cors) return response(request, { error: "Request origin is not allowed.", request_id: rid }, 403);
  if (request.method !== "POST") return response(request, { error: "Method not allowed.", request_id: rid }, 405);

  try {
    const contentLength = Number(request.headers.get("content-length") ?? "0");
    if (contentLength > MAX_BODY_BYTES) return response(request, { error: "Request is too large.", request_id: rid }, 413);
    const raw = await request.text();
    if (new TextEncoder().encode(raw).byteLength > MAX_BODY_BYTES) return response(request, { error: "Request is too large.", request_id: rid }, 413);

    let body: RequestBody;
    try { body = JSON.parse(raw || "{}") as RequestBody; }
    catch { return response(request, { error: "Invalid request.", request_id: rid }, 400); }

    if (text(body.website, 100)) return response(request, { ok: true, email_sent: true, request_id: rid }, 201);

    const fullName = text(body.full_name, 120);
    const email = text(body.email, 254).toLowerCase();
    if (!fullName || !/^\S+@\S+\.\S+$/.test(email)) return response(request, { error: "A valid name and email are required.", request_id: rid }, 400);

    const ip = clientIp(request);
    const salt = Deno.env.get("CENTRUM_RATE_LIMIT_SALT") || key;
    const ipHash = await hashIp(ip, salt);
    const cutoff = new Date(Date.now() - RATE_WINDOW_MS).toISOString();
    const { count: ipCount, error: ipRateError } = await admin.from("form_rate_limits")
      .select("id", { count: "exact", head: true }).eq("form_name", "service-customization").eq("ip_hash", ipHash).gte("created_at", cutoff);
    if (ipRateError) throw ipRateError;
    if ((ipCount ?? 0) >= RATE_LIMIT) return response(request, { error: "Too many requests were submitted from this connection. Please try again later.", request_id: rid }, 429);

    const oneHourAgo = new Date(Date.now() - RATE_WINDOW_MS).toISOString();
    const { count: recentCount, error: emailRateError } = await admin.from("service_customization_requests")
      .select("id", { count: "exact", head: true }).eq("email", email).gte("created_at", oneHourAgo);
    if (emailRateError) throw emailRateError;
    if ((recentCount ?? 0) >= 3) return response(request, { error: "Too many requests were submitted for this email. Please try again later.", request_id: rid }, 429);

    if (!(await verifyTurnstile(text(body.captcha_token, 4096), ip))) {
      return response(request, { error: "Please complete the security check and try again.", request_id: rid }, 400);
    }

    const usageTypes = Array.isArray(body.usage_types)
      ? body.usage_types.filter((item): item is string => typeof item === "string").map((item) => item.trim().slice(0, 80)).filter(Boolean).slice(0, 12)
      : [];
    const requestedPlanId = Number(body.preferred_plan_id);
    const preferredPlanId = Number.isInteger(requestedPlanId) && requestedPlanId > 0 ? requestedPlanId : null;
    let preferredPlanName = nullableText(body.preferred_plan_name, 120);
    if (preferredPlanId) {
      const { data: plan } = await admin.from("plans").select("name").eq("id", preferredPlanId).maybeSingle();
      if (plan?.name) preferredPlanName = plan.name;
    }

    let customerId: string | null = null;
    const bearer = request.headers.get("authorization")?.match(/^Bearer\s+(.+)$/i)?.[1];
    if (bearer) {
      const { data } = await admin.auth.getUser(bearer);
      customerId = data.user?.id ?? null;
    }

    const payload = {
      customer_id: customerId,
      full_name: fullName,
      email,
      phone: nullableText(body.phone, 80),
      address: nullableText(body.address, 250),
      service_type: text(body.service_type, 40) || "home",
      people_count: nullableText(body.people_count, 40),
      device_count: nullableText(body.device_count, 40),
      usage_types: usageTypes,
      budget_range: nullableText(body.budget_range, 60),
      preferred_plan_id: preferredPlanId,
      preferred_plan_name: preferredPlanName,
      current_provider: nullableText(body.current_provider, 120),
      notes: nullableText(body.notes, 2000),
      status: "new",
    };

    const { data: inserted, error: insertError } = await admin.from("service_customization_requests").insert(payload).select("id,created_at").single();
    if (insertError) throw insertError;

    const { error: ledgerError } = await admin.from("form_rate_limits").insert({ form_name: "service-customization", ip_hash: ipHash });
    if (ledgerError) console.error("service-customization rate ledger failure", { request_id: rid, error: ledgerError });

    const resendApiKey = Deno.env.get("RESEND_API_KEY");
    const toEmail = Deno.env.get("CUSTOMIZATION_TO_EMAIL") || "tonyreaidy@live.com";
    const fromEmail = Deno.env.get("CUSTOMIZATION_FROM_EMAIL") || "Centrum Service <onboarding@resend.dev>";
    let emailSent = false;
    let emailError: string | null = null;

    if (resendApiKey) {
      const rows = [
        ["Name", fullName], ["Email", email], ["Phone", payload.phone ?? "—"], ["Address", payload.address ?? "—"],
        ["Service type", payload.service_type], ["People", payload.people_count ?? "—"], ["Devices", payload.device_count ?? "—"],
        ["Usage", usageTypes.join(", ") || "—"], ["Budget", payload.budget_range ?? "—"], ["Preferred plan", preferredPlanName ?? "Recommend one"],
        ["Current provider", payload.current_provider ?? "—"], ["Notes", payload.notes ?? "—"],
      ];
      const html = `<div style="font-family:Arial,sans-serif;max-width:680px;margin:auto;color:#111827"><h2>New Centrum service customization request</h2><p>Request #${inserted.id} was submitted from the Centrum website.</p><table style="width:100%;border-collapse:collapse">${rows.map(([label, value]) => `<tr><td style="padding:8px;border-bottom:1px solid #e5e7eb;font-weight:700;width:170px">${escapeHtml(label)}</td><td style="padding:8px;border-bottom:1px solid #e5e7eb">${escapeHtml(String(value))}</td></tr>`).join("")}</table></div>`;
      const emailResponse = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: { authorization: `Bearer ${resendApiKey}`, "content-type": "application/json" },
        body: JSON.stringify({ from: fromEmail, to: [toEmail], reply_to: email, subject: `Centrum service request #${inserted.id} — ${fullName}`, html }),
      });
      if (emailResponse.ok) emailSent = true;
      else emailError = `Provider returned HTTP ${emailResponse.status}`;
    } else {
      emailError = "Email provider is not configured.";
    }

    const { error: updateError } = await admin.from("service_customization_requests")
      .update({ email_sent_at: emailSent ? new Date().toISOString() : null, email_error: emailError }).eq("id", inserted.id);
    if (updateError) console.error("service-customization delivery state update failed", { request_id: rid, error: updateError });

    return response(request, { ok: true, request_id: inserted.id, email_sent: emailSent }, 201);
  } catch (error) {
    console.error("service-customization failure", { request_id: rid, error });
    return response(request, { error: "Could not submit your request right now. Please try again later.", request_id: rid }, 500);
  }
});
