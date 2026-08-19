import type { SupabaseClient, User } from "@supabase/supabase-js";

/**
 * Column/key names (case-insensitive) that might hold the role text, e.g.
 * "admin" or "customer". The Supabase "Role" field you edit in the Table
 * Editor is usually a column literally called "role" on a "profiles" table,
 * but we scan a few common variants too in case it's named differently.
 */
const ROLE_KEYS = ["role", "roles", "user_role", "userrole", "account_role", "user_type", "usertype"];

/**
 * Only an exact (case-insensitive, whitespace-trimmed) match on "admin"
 * counts as an admin — "customer" or anything else does not.
 */
export function isAdminRole(role: unknown): boolean {
  if (typeof role === "string") {
    return role.trim().toLowerCase() === "admin";
  }

  if (Array.isArray(role)) {
    return role.some((entry) => typeof entry === "string" && entry.trim().toLowerCase() === "admin");
  }

  return false;
}

function hasAdminRoleInObject(source: Record<string, unknown> | null | undefined): boolean {
  if (!source) return false;

  for (const key of Object.keys(source)) {
    if (ROLE_KEYS.includes(key.toLowerCase()) && isAdminRole(source[key])) {
      return true;
    }
  }

  return false;
}

/**
 * Reads the role from the canonical Supabase profile row. In this project
 * profiles.id references auth.users.id, so there is no user_id fallback.
 */
async function fetchProfileRole(supabase: SupabaseClient, userId: string): Promise<Record<string, unknown> | null> {
  const { data, error } = await supabase.from("profiles").select("*").eq("id", userId).maybeSingle();
  if (error || !data) return null;
  return data as Record<string, unknown>;
}

/**
 * Checks the Auth user's own metadata/claims for a role field. Kept as a
 * secondary check in case the role was set there instead of (or in addition
 * to) the profiles table.
 */
function checkAuthMetadataRole(user: User): boolean {
  const appMetadata = (user.app_metadata ?? {}) as Record<string, unknown>;
  const userMetadata = (user.user_metadata ?? {}) as Record<string, unknown>;
  const claims = ((user as unknown as { claims?: Record<string, unknown> }).claims ?? {}) as Record<
    string,
    unknown
  >;
  const topLevelRole = (user as unknown as { role?: unknown }).role;

  return (
    hasAdminRoleInObject(appMetadata) ||
    hasAdminRoleInObject(userMetadata) ||
    hasAdminRoleInObject(claims) ||
    isAdminRole(topLevelRole)
  );
}

/**
 * Full admin check: looks at the profiles table's Role column first (the
 * text field you edit in the Supabase Table Editor), and also checks the
 * Auth user's metadata as a fallback. Returns false for signed-out users or
 * any role other than "admin" (e.g. "customer").
 */
export async function resolveIsAdmin(
  supabase: SupabaseClient | null,
  user: User | null | undefined,
): Promise<boolean> {
  if (!supabase || !user) {
    return false;
  }

  const profileRow = await fetchProfileRole(supabase, user.id);
  if (hasAdminRoleInObject(profileRow)) {
    return true;
  }

  return checkAuthMetadataRole(user);
}
