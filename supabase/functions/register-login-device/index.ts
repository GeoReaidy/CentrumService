import { createClient } from 'npm:@supabase/supabase-js@2';

const DEFAULT_ORIGINS = ['https://centrumservice.net', 'https://www.centrumservice.net', 'http://localhost:3000', 'http://127.0.0.1:3000'];

function readSecretKey() {
  return Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || Deno.env.get('SUPABASE_SECRET_KEY') || (() => {
    try { const keys = JSON.parse(Deno.env.get('SUPABASE_SECRET_KEYS') || '{}'); return keys.default ?? Object.values(keys)[0] ?? null; } catch { return null; }
  })();
}
function allowedOrigins() {
  return Array.from(new Set([...DEFAULT_ORIGINS, ...(Deno.env.get('CENTRUM_ALLOWED_ORIGINS') || '').split(',').map((value) => value.trim()).filter(Boolean)]));
}
function cors(request: Request) {
  const origin = request.headers.get('origin');
  return origin && allowedOrigins().includes(origin) ? { 'access-control-allow-origin': origin, 'access-control-allow-headers': 'authorization, x-client-info, apikey, content-type', 'access-control-allow-methods': 'POST, OPTIONS', vary: 'Origin' } : {};
}
function json(request: Request, body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...cors(request), 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', 'x-content-type-options': 'nosniff' } });
}
function clean(value: unknown, max: number) { return typeof value === 'string' ? value.trim().slice(0, max) : ''; }
function escapeHtml(value: string) { return value.replace(/[&<>'"]/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[character] || character)); }
async function sha256(value: string) {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest)).map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors(request) });
  if (request.method !== 'POST') return json(request, { error: 'Method not allowed.' }, 405);
  if (!allowedOrigins().includes(request.headers.get('origin') || '')) return json(request, { error: 'Origin not allowed.' }, 403);

  const url = Deno.env.get('SUPABASE_URL');
  const key = readSecretKey();
  const bearer = request.headers.get('authorization')?.match(/^Bearer\s+(.+)$/i)?.[1];
  if (!url || !key || !bearer) return json(request, { error: 'Authentication is unavailable.' }, 401);

  try {
    const raw = await request.text();
    if (raw.length > 4000) return json(request, { error: 'Request is too large.' }, 413);
    const body = JSON.parse(raw || '{}') as Record<string, unknown>;
    const deviceId = clean(body.device_id, 200);
    const label = clean(body.label, 160) || 'Browser';
    if (!/^[a-zA-Z0-9-]{16,200}$/.test(deviceId)) return json(request, { error: 'Invalid browser identifier.' }, 400);

    const admin = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
    const { data: userData, error: userError } = await admin.auth.getUser(bearer);
    if (userError || !userData.user) return json(request, { error: 'Invalid session.' }, 401);

    const user = userData.user;
    const deviceHash = await sha256(`${user.id}:${deviceId}`);
    const { data: existing, error: lookupError } = await admin.from('login_devices').select('id').eq('user_id', user.id).eq('device_key_hash', deviceHash).maybeSingle();
    if (lookupError) throw lookupError;

    const now = new Date().toISOString();
    const userAgent = clean(request.headers.get('user-agent'), 240) || null;
    if (existing) {
      const { error } = await admin.from('login_devices').update({ label, user_agent_preview: userAgent, last_seen_at: now }).eq('id', existing.id);
      if (error) throw error;
      return json(request, { ok: true, new_device: false });
    }

    const { data: inserted, error: insertError } = await admin.from('login_devices').insert({ user_id: user.id, device_key_hash: deviceHash, label, user_agent_preview: userAgent }).select('id').single();
    if (insertError) {
      if (insertError.code === '23505') return json(request, { ok: true, new_device: false });
      throw insertError;
    }

    const { data: profile } = await admin.from('profiles').select('role').eq('id', user.id).maybeSingle();
    const role = String(profile?.role || 'customer').toLowerCase();
    const href = role === 'admin' ? '/admin/account#login-security' : role === 'manager' ? '/manager?workspace=settings&security=review' : '/portal/account#login-security';
    await admin.from('notifications').insert({ recipient_id: user.id, category: 'security', event_type: 'new_login_device', title: 'New browser sign-in', body: `A new browser signed in to your Centrum account: ${label}.`, href, source_type: 'login_device', source_id: inserted.id });

    const resendKey = Deno.env.get('RESEND_API_KEY');
    if (resendKey && user.email) {
      const siteUrl = (Deno.env.get('CENTRUM_SITE_URL') || 'https://centrumservice.net').replace(/\/$/, '');
      const from = Deno.env.get('SECURITY_FROM_EMAIL') || Deno.env.get('CUSTOMIZATION_FROM_EMAIL') || 'Centrum Service <onboarding@resend.dev>';
      const safeLabel = escapeHtml(label);
      const html = `<div style="font-family:Arial,sans-serif;max-width:620px;margin:auto;color:#111827"><h2>New browser sign-in</h2><p>Centrum detected a first sign-in from <strong>${safeLabel}</strong>.</p><p>If this was you, no action is needed.</p><p><a href="${siteUrl}${href}" style="display:inline-block;padding:12px 18px;background:#2f6cff;color:white;text-decoration:none;border-radius:8px">Review login security</a></p><p>If this was not you, use “This wasn’t me” to sign out every session, then reset your password.</p></div>`;
      const response = await fetch('https://api.resend.com/emails', { method: 'POST', headers: { authorization: `Bearer ${resendKey}`, 'content-type': 'application/json' }, body: JSON.stringify({ from, to: [user.email], subject: `New Centrum sign-in from ${label}`, html }) });
      if (!response.ok) console.error('Security email provider error', { status: response.status });
    }
    return json(request, { ok: true, new_device: true });
  } catch (error) {
    console.error('register-login-device failure', error);
    return json(request, { error: 'The login security check could not be completed.' }, 500);
  }
});
