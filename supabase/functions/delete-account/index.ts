import { createClient } from "npm:@supabase/supabase-js@2";

type DeleteAccountBody = {
  current_password?: unknown;
  confirmation?: unknown;
};

const corsHeaders = {
  "access-control-allow-origin": "*",
  "access-control-allow-headers": "authorization, x-client-info, apikey, content-type",
  "access-control-allow-methods": "POST, OPTIONS",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...corsHeaders,
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
    },
  });
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

function readPublishableKey() {
  const legacy = Deno.env.get("SUPABASE_ANON_KEY");
  if (legacy) return legacy;

  const single = Deno.env.get("SUPABASE_PUBLISHABLE_KEY");
  if (single) return single;

  const raw = Deno.env.get("SUPABASE_PUBLISHABLE_KEYS");
  if (!raw) return null;

  try {
    const keys = JSON.parse(raw) as Record<string, string>;
    return keys.default ?? Object.values(keys)[0] ?? null;
  } catch {
    return null;
  }
}

function isAdminValue(value: unknown) {
  if (typeof value === "string") return value.trim().toLowerCase() === "admin";
  if (Array.isArray(value)) return value.some((entry) => isAdminValue(entry));
  return false;
}

const roleKeys = new Set([
  "role",
  "roles",
  "user_role",
  "userrole",
  "account_role",
  "user_type",
  "usertype",
]);

function objectHasAdminRole(source: Record<string, unknown> | null | undefined) {
  if (!source) return false;
  return Object.entries(source).some(([key, value]) => roleKeys.has(key.toLowerCase()) && isAdminValue(value));
}

const supabaseUrl = Deno.env.get("SUPABASE_URL");
const secretKey = readSecretKey();
const publishableKey = readPublishableKey();

if (!supabaseUrl || !secretKey) {
  throw new Error("Supabase server credentials are unavailable to delete-account.");
}

const admin = createClient(supabaseUrl, secretKey, {
  auth: {
    persistSession: false,
    autoRefreshToken: false,
    detectSessionInUrl: false,
  },
});

Deno.serve(async (request: Request) => {
  if (request.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (request.method !== "POST") return json({ error: "Method not allowed." }, 405);

  try {
    const authorization = request.headers.get("authorization") ?? "";
    const token = authorization.match(/^Bearer\s+(.+)$/i)?.[1];
    if (!token) return json({ error: "Please sign in again before deleting your account." }, 401);

    const { data: userResult, error: userError } = await admin.auth.getUser(token);
    const user = userResult.user;
    if (userError || !user) return json({ error: "Your session is no longer valid. Please sign in again." }, 401);

    if (!user.email) return json({ error: "This account does not have a password email that can be verified." }, 400);

    const body = (await request.json()) as DeleteAccountBody;
    const password = typeof body.current_password === "string" ? body.current_password : "";
    const confirmation = typeof body.confirmation === "string" ? body.confirmation.trim() : "";

    if (!password) return json({ error: "Enter your current password." }, 400);
    if (confirmation !== "DELETE") return json({ error: "Type DELETE exactly to confirm account deletion." }, 400);

    const { data: profile } = await admin
      .from("profiles")
      .select("*")
      .eq("id", user.id)
      .maybeSingle();

    const metadataAdmin =
      objectHasAdminRole((user.app_metadata ?? {}) as Record<string, unknown>) ||
      objectHasAdminRole((user.user_metadata ?? {}) as Record<string, unknown>);

    if (objectHasAdminRole((profile ?? {}) as Record<string, unknown>) || metadataAdmin) {
      return json({ error: "Administrator accounts cannot be deleted from the customer portal." }, 403);
    }

    // Verify the password on the server. Use a separate auth client so a
    // successful password sign-in never replaces the admin client's service
    // credentials in memory.
    const verifier = createClient(supabaseUrl, publishableKey ?? secretKey, {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
        detectSessionInUrl: false,
      },
    });

    const { data: verified, error: verifyError } = await verifier.auth.signInWithPassword({
      email: user.email,
      password,
    });

    if (verifyError || verified.user?.id !== user.id) {
      return json({ error: "The current password is incorrect." }, 403);
    }

    // Revoke the temporary verification session before deleting the account.
    await verifier.auth.signOut({ scope: "local" });

    const { error: deleteError } = await admin.auth.admin.deleteUser(user.id, false);
    if (deleteError) {
      console.error("delete-account auth deletion failed", deleteError);

      const lower = deleteError.message.toLowerCase();
      if (lower.includes("storage") || lower.includes("owner")) {
        return json({ error: "This account still owns uploaded files. Please contact Centrum support to finish deletion." }, 409);
      }

      if (lower.includes("foreign key") || lower.includes("constraint") || lower.includes("database")) {
        return json({ error: "Linked account records prevented deletion. Please contact Centrum support." }, 409);
      }

      return json({ error: "The account could not be deleted right now. Please try again later." }, 500);
    }

    return json({ ok: true });
  } catch (error) {
    console.error("delete-account failure", error);
    return json({ error: "The account could not be deleted right now. Please try again later." }, 500);
  }
});
