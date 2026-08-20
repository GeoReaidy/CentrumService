import type { SupabaseClient, User } from "@supabase/supabase-js";

export type CentrumRole = "customer" | "manager" | "admin" | "support";

/**
 * Authorization helpers for UI/navigation only.
 *
 * IMPORTANT:
 * - user_metadata is never trusted for authorization.
 * - profiles.role is the primary source of truth.
 * - app_metadata is only a fallback when a profile row cannot be read.
 * - Database RLS remains the actual security boundary.
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

export function normalizeCentrumRole(value: unknown): CentrumRole | null {
  if (typeof value !== "string") return null;
  const role = value.trim().toLowerCase();
  if (role === "customer" || role === "manager" || role === "admin" || role === "support") {
    return role;
  }
  return null;
}

export function isAdminRole(role: unknown): boolean {
  if (typeof role === "string") return normalizeCentrumRole(role) === "admin";
  if (Array.isArray(role)) return role.some((entry) => isAdminRole(entry));
  return false;
}

export function isManagerRole(role: unknown): boolean {
  if (typeof role === "string") return normalizeCentrumRole(role) === "manager";
  if (Array.isArray(role)) return role.some((entry) => isManagerRole(entry));
  return false;
}

export function isStaffRole(role: unknown): boolean {
  if (typeof role === "string") {
    const normalized = normalizeCentrumRole(role);
    return normalized === "admin" || normalized === "manager";
  }
  if (Array.isArray(role)) return role.some((entry) => isStaffRole(entry));
  return false;
}

function readRoleFromObject(
  source: Record<string, unknown> | null | undefined,
): CentrumRole | null {
  if (!source) return null;

  for (const [key, value] of Object.entries(source)) {
    if (!ROLE_KEYS.includes(key.toLowerCase())) continue;

    if (Array.isArray(value)) {
      for (const entry of value) {
        const normalized = normalizeCentrumRole(entry);
        if (normalized) return normalized;
      }
      continue;
    }

    const normalized = normalizeCentrumRole(value);
    if (normalized) return normalized;
  }

  return null;
}

async function fetchProfileRole(
  supabase: SupabaseClient,
  userId: string,
): Promise<CentrumRole | null> {
  const { data, error } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", userId)
    .maybeSingle();

  if (error || !data) return null;
  return normalizeCentrumRole((data as { role?: unknown }).role);
}

export async function resolveUserRole(
  supabase: SupabaseClient | null,
  user: User | null | undefined,
): Promise<CentrumRole> {
  if (!supabase || !user) return "customer";

  const profileRole = await fetchProfileRole(supabase, user.id);
  if (profileRole) return profileRole;

  const appMetadata = (user.app_metadata ?? {}) as Record<string, unknown>;
  return readRoleFromObject(appMetadata) ?? "customer";
}

export async function resolveIsAdmin(
  supabase: SupabaseClient | null,
  user: User | null | undefined,
): Promise<boolean> {
  return (await resolveUserRole(supabase, user)) === "admin";
}

export async function resolveIsManager(
  supabase: SupabaseClient | null,
  user: User | null | undefined,
): Promise<boolean> {
  return (await resolveUserRole(supabase, user)) === "manager";
}

export async function resolveIsStaff(
  supabase: SupabaseClient | null,
  user: User | null | undefined,
): Promise<boolean> {
  const role = await resolveUserRole(supabase, user);
  return role === "admin" || role === "manager";
}

export function roleHome(role: CentrumRole): string {
  if (role === "admin") return "/admin";
  if (role === "manager") return "/manager";
  return "/portal/dashboard";
}
