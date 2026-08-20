import type { SupabaseClient, User } from "@supabase/supabase-js";

/**
 * These are application-level role field names only.
 *
 * IMPORTANT:
 * - user_metadata is intentionally NOT trusted for authorization.
 * - The real security boundary is database RLS, not this client-side helper.
 */
const ROLE_KEYS = [
  "role",
  "roles",
  "user_role",
  "userrole",
  "account_role",
  "user_type",
  "usertype",
];

export function isAdminRole(role: unknown): boolean {
  if (typeof role === "string") {
    return role.trim().toLowerCase() === "admin";
  }

  if (Array.isArray(role)) {
    return role.some(
      (entry) =>
        typeof entry === "string" &&
        entry.trim().toLowerCase() === "admin",
    );
  }

  return false;
}

function hasAdminRoleInObject(
  source: Record<string, unknown> | null | undefined,
): boolean {
  if (!source) return false;

  for (const [key, value] of Object.entries(source)) {
    if (ROLE_KEYS.includes(key.toLowerCase()) && isAdminRole(value)) {
      return true;
    }
  }

  return false;
}

async function fetchProfileRole(
  supabase: SupabaseClient,
  userId: string,
): Promise<Record<string, unknown> | null> {
  const { data, error } = await supabase
    .from("profiles")
    .select("*")
    .eq("id", userId)
    .maybeSingle();

  if (error || !data) return null;
  return data as Record<string, unknown>;
}

/**
 * UI/navigation helper only.
 *
 * Trusted inputs:
 * 1. The user's own `profiles` row, PROVIDED the deployed database RLS prevents
 *    customers from changing their authorization fields.
 * 2. `app_metadata`, which is server-controlled in Supabase Auth.
 *
 * Explicitly NOT trusted:
 * - user_metadata
 * - arbitrary client state
 * - URL/query parameters
 *
 * Every sensitive database operation still must be protected by RLS.
 */
export async function resolveIsAdmin(
  supabase: SupabaseClient | null,
  user: User | null | undefined,
): Promise<boolean> {
  if (!supabase || !user) return false;

  const profileRow = await fetchProfileRole(supabase, user.id);
  if (hasAdminRoleInObject(profileRow)) return true;

  const appMetadata = (user.app_metadata ?? {}) as Record<string, unknown>;
  return hasAdminRoleInObject(appMetadata);
}
