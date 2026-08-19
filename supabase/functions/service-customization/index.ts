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
};

const corsHeaders = {
  "access-control-allow-origin": "*",
  "access-control-allow-headers": "authorization, x-client-info, apikey, content-type",
  "access-control-allow-methods": "POST, OPTIONS",
};

function response(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "content-type": "application/json; charset=utf-8", "cache-control": "no-store" },
  });
}

function serverKey() {
  const legacy = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (legacy) return legacy;
  const raw = Deno.env.get("SUPABASE_SECRET_KEYS");
  if (!raw) return null;
  try {
    const keys = JSON.parse(raw) as Record<string, string>;
    return keys.default ?? Object.values(keys)[0] ?? null;
  } catch {
    return null;
  }
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

const supabaseUrl = Deno.env.get("SUPABASE_URL");
const key = serverKey();
if (!supabaseUrl || !key) throw new Error("Supabase server credentials are unavailable.");
const admin = createClient(supabaseUrl, key, { auth: { persistSession: false, autoRefreshToken: false } });

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (request.method !== "POST") return response({ error: "Method not allowed." }, 405);

  try {
    const body = await request.json() as RequestBody;
    if (text(body.website, 100)) return response({ ok: true, email_sent: true }); // honeypot

    const fullName = text(body.full_name, 120);
    const email = text(body.email, 254).toLowerCase();
    if (!fullName || !/^\S+@\S+\.\S+$/.test(email)) return response({ error: "A valid name and email are required." }, 400);

    const oneHourAgo = new Date(Date.now() - 3_600_000).toISOString();
    const { count: recentCount, error: rateError } = await admin
      .from("service_customization_requests")
      .select("id", { count: "exact", head: true })
      .eq("email", email)
      .gte("created_at", oneHourAgo);
    if (rateError) throw rateError;
    if ((recentCount ?? 0) >= 3) return response({ error: "Too many requests were submitted for this email. Please try again later." }, 429);

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

    const { data: inserted, error: insertError } = await admin
      .from("service_customization_requests")
      .insert(payload)
      .select("id,created_at")
      .single();
    if (insertError) throw insertError;

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
      const html = `
        <div style="font-family:Arial,sans-serif;max-width:680px;margin:auto;color:#111827">
          <h2>New Centrum service customization request</h2>
          <p>Request #${inserted.id} was submitted from the Centrum website.</p>
          <table style="width:100%;border-collapse:collapse">${rows.map(([label, value]) => `<tr><td style="padding:8px;border-bottom:1px solid #e5e7eb;font-weight:700;width:170px">${escapeHtml(label)}</td><td style="padding:8px;border-bottom:1px solid #e5e7eb">${escapeHtml(String(value))}</td></tr>`).join("")}</table>
        </div>`;
      const emailResponse = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: { authorization: `Bearer ${resendApiKey}`, "content-type": "application/json" },
        body: JSON.stringify({ from: fromEmail, to: [toEmail], reply_to: email, subject: `Centrum service request #${inserted.id} — ${fullName}`, html }),
      });
      if (emailResponse.ok) emailSent = true;
      else emailError = (await emailResponse.text()).slice(0, 500);
    } else {
      emailError = "RESEND_API_KEY is not configured.";
    }

    await admin.from("service_customization_requests").update({ email_sent_at: emailSent ? new Date().toISOString() : null, email_error: emailError }).eq("id", inserted.id);
    return response({ ok: true, request_id: inserted.id, email_sent: emailSent }, 201);
  } catch (error) {
    console.error("service-customization failure", error);
    return response({ error: error instanceof Error ? error.message : "Could not submit customization request." }, 500);
  }
});
