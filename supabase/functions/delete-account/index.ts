import { createClient } from "npm:@supabase/supabase-js@2";

type DeleteAccountBody = {
  action?: unknown;
  target_user_id?: unknown;
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

function isProtectedStaffValue(value: unknown) {
  if (typeof value === "string") {
    const role = value.trim().toLowerCase();
    return role === "admin" || role === "manager" || role === "support";
  }
  if (Array.isArray(value)) return value.some((entry) => isProtectedStaffValue(entry));
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

function objectHasProtectedStaffRole(source: Record<string, unknown> | null | undefined) {
  if (!source) return false;
  return Object.entries(source).some(([key, value]) => roleKeys.has(key.toLowerCase()) && isProtectedStaffValue(value));
}

function isAdminValue(value: unknown) {
  if (typeof value === "string") return value.trim().toLowerCase() === "admin";
  if (Array.isArray(value)) return value.some((entry) => isAdminValue(entry));
  return false;
}

function objectHasAdminRole(source: Record<string, unknown> | null | undefined) {
  if (!source) return false;
  return Object.entries(source).some(([key, value]) => roleKeys.has(key.toLowerCase()) && isAdminValue(value));
}

function looksLikeUuid(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
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

    const body = (await request.json()) as DeleteAccountBody;
    const action = typeof body.action === "string" ? body.action.trim().toLowerCase() : "self_delete";

    const { data: profile } = await admin
      .from("profiles")
      .select("*")
      .eq("id", user.id)
      .maybeSingle();

    if (action === "admin_delete_customer") {
      const actorIsAdmin =
        objectHasAdminRole((profile ?? {}) as Record<string, unknown>) ||
        objectHasAdminRole((user.app_metadata ?? {}) as Record<string, unknown>);
      if (!actorIsAdmin) return json({ error: "Administrator access is required to delete another account." }, 403);

      const targetUserId = typeof body.target_user_id === "string" ? body.target_user_id.trim() : "";
      const confirmation = typeof body.confirmation === "string" ? body.confirmation.trim() : "";
      if (!looksLikeUuid(targetUserId)) return json({ error: "A valid customer account is required." }, 400);
      if (targetUserId === user.id) return json({ error: "Administrators cannot delete their own account from customer management." }, 403);
      if (confirmation !== "DELETE CUSTOMER") return json({ error: "Type DELETE CUSTOMER exactly to confirm account deletion." }, 400);

      const { data: targetProfile, error: targetProfileError } = await admin
        .from("profiles")
        .select("id,full_name,role")
        .eq("id", targetUserId)
        .maybeSingle();

      if (targetProfileError) {
        console.error("delete-account target profile lookup failed", targetProfileError);
        return json({ error: "The customer account could not be checked right now." }, 500);
      }
      if (!targetProfile) return json({ error: "That customer account no longer exists." }, 404);
      if (String(targetProfile.role ?? "customer").toLowerCase() !== "customer") {
        return json({ error: "Staff accounts must be demoted from Staff & Roles before they can be deleted as customers." }, 403);
      }

      const { error: adminDeleteError } = await admin.auth.admin.deleteUser(targetUserId, false);
      if (adminDeleteError) {
        console.error("delete-account admin customer deletion failed", adminDeleteError);
        const lower = adminDeleteError.message.toLowerCase();
        if (lower.includes("storage") || lower.includes("owner")) {
          return json({ error: "This customer still owns uploaded files. Remove or reassign those files before deleting the account." }, 409);
        }
        if (lower.includes("foreign key") || lower.includes("constraint") || lower.includes("database")) {
          return json({ error: "Linked account records prevented deletion. Review the customer's linked records and try again." }, 409);
        }
        return json({ error: "The customer account could not be deleted right now." }, 500);
      }

      return json({ ok: true, deleted_user_id: targetUserId });
    }

    if (action !== "self_delete") return json({ error: "Unknown account action." }, 400);
    if (!user.email) return json({ error: "This account does not have a password email that can be verified." }, 400);

    const password = typeof body.current_password === "string" ? body.current_password : "";
    const confirmation = typeof body.confirmation === "string" ? body.confirmation.trim() : "";

    if (!password) return json({ error: "Enter your current password." }, 400);
    if (confirmation !== "DELETE") return json({ error: "Type DELETE exactly to confirm account deletion." }, 400);

    // profiles.role is the primary authorization source. app_metadata is
    // server-controlled and is only a defensive fallback. user_metadata is
    // intentionally not trusted for authorization.
    const metadataStaff = objectHasProtectedStaffRole(
      (user.app_metadata ?? {}) as Record<string, unknown>,
    );

    if (objectHasProtectedStaffRole((profile ?? {}) as Record<string, unknown>) || metadataStaff) {
      return json({ error: "Staff accounts cannot be deleted from the customer portal." }, 403);
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
