"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import type { User } from "@supabase/supabase-js";
import { AsyncState } from "@/components/AsyncState";
import { getSupabaseBrowserClient } from "@/lib/supabase-browser";
import { resolveIsAdmin, type CentrumRole } from "@/lib/supabase-role";
import { toFriendlyErrorMessage } from "@/lib/friendly-error";

type RoleProfile = {
  id: string;
  full_name: string | null;
  phone: string | null;
  role: CentrumRole;
  service_status: string;
  created_at: string;
};

type RoleAudit = {
  id: number;
  actor_id: string | null;
  target_id: string | null;
  old_role: string;
  new_role: string;
  changed_at: string;
};

const assignableRoles: Array<{ value: "customer" | "manager" | "admin"; label: string; detail: string }> = [
  { value: "customer", label: "Customer", detail: "Customer portal only" },
  { value: "manager", label: "Manager", detail: "Day-to-day operations; no staff/security/network credentials" },
  { value: "admin", label: "Administrator", detail: "Full Centrum administration" },
];

export default function AdminRolesPage() {
  const router = useRouter();
  const supabase = getSupabaseBrowserClient();
  const [account, setAccount] = useState<User | null>(null);
  const [loading, setLoading] = useState(() => Boolean(supabase));
  const [profiles, setProfiles] = useState<RoleProfile[]>([]);
  const [audit, setAudit] = useState<RoleAudit[]>([]);
  const [draftRoles, setDraftRoles] = useState<Record<string, string>>({});
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState("all");
  const [savingId, setSavingId] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  const load = useCallback(async () => {
    if (!supabase) return;
    const [profilesResult, auditResult] = await Promise.all([
      supabase.from("profiles").select("id,full_name,phone,role,service_status,created_at").order("full_name", { ascending: true }).limit(2000),
      supabase.from("role_change_audit").select("id,actor_id,target_id,old_role,new_role,changed_at").order("changed_at", { ascending: false }).limit(100),
    ]);

    if (profilesResult.error) {
      setError(toFriendlyErrorMessage(profilesResult.error, "Staff roles could not be loaded."));
      return;
    }

    if (auditResult.error && auditResult.error.code !== "42P01") {
      setError(toFriendlyErrorMessage(auditResult.error, "Role history could not be loaded."));
    } else {
      setError("");
    }

    const rows = (profilesResult.data as RoleProfile[] | null) ?? [];
    setProfiles(rows);
    setDraftRoles(Object.fromEntries(rows.map((profile) => [profile.id, profile.role])));
    setAudit((auditResult.data as RoleAudit[] | null) ?? []);
  }, [supabase]);

  useEffect(() => {
    if (!supabase) { setLoading(false); return; }
    let mounted = true;
    async function boot() {
      const { data, error: authError } = await supabase!.auth.getUser();
      if (!mounted) return;
      if (authError || !data.user) { setLoading(false); router.replace("/portal/login"); return; }
      const admin = await resolveIsAdmin(supabase!, data.user);
      if (!mounted) return;
      if (!admin) { setLoading(false); router.replace("/portal"); return; }
      setAccount(data.user);
      await load();
      if (mounted) setLoading(false);
    }
    void boot();
    return () => { mounted = false; };
  }, [load, router, supabase]);

  const profileMap = useMemo(() => new Map(profiles.map((profile) => [profile.id, profile])), [profiles]);
  const filtered = useMemo(() => {
    const query = search.trim().toLowerCase();
    return profiles.filter((profile) => {
      const matchesRole = filter === "all" || profile.role === filter;
      const matchesSearch = !query || `${profile.full_name ?? ""} ${profile.phone ?? ""} ${profile.id} ${profile.role}`.toLowerCase().includes(query);
      return matchesRole && matchesSearch;
    });
  }, [filter, profiles, search]);

  const counts = useMemo(() => ({
    admin: profiles.filter((profile) => profile.role === "admin").length,
    manager: profiles.filter((profile) => profile.role === "manager").length,
    customer: profiles.filter((profile) => profile.role === "customer").length,
  }), [profiles]);

  async function saveRole(profile: RoleProfile) {
    if (!supabase || !account) return;
    const nextRole = draftRoles[profile.id];
    if (!nextRole || nextRole === profile.role) return;
    if (profile.id === account.id) {
      setError("You cannot change your own administrator role from this page.");
      return;
    }
    if (!assignableRoles.some((item) => item.value === nextRole)) {
      setError("That role cannot be assigned from Centrum Admin.");
      return;
    }

    const label = profile.full_name || profile.id.slice(0, 8);
    if (!window.confirm(`Change ${label} from ${profile.role} to ${nextRole}?`)) return;

    setSavingId(profile.id); setError(""); setMessage("");
    const { error: updateError } = await supabase.from("profiles").update({ role: nextRole }).eq("id", profile.id);
    if (updateError) {
      setError(toFriendlyErrorMessage(updateError, "The role could not be changed."));
    } else {
      setMessage(`${label} is now ${nextRole === "admin" ? "an administrator" : nextRole === "manager" ? "a manager" : "a customer"}.`);
      await load();
    }
    setSavingId(null);
  }

  if (loading) return <section className="admin-page"><AsyncState kind="loading" eyebrow="Staff & Roles" title="Loading role controls" message="Checking administrator access and loading Centrum accounts." /></section>;
  if (!supabase) return <section className="admin-page"><AsyncState kind="error" eyebrow="Staff & Roles" title="Role controls are unavailable" message="Centrum could not connect to the account service." /></section>;
  if (!account) return null;

  return (
    <section className="animate-fade-in admin-page staff-roles-page">
      <div className="admin-header admin-console-header">
        <div><div className="badge badge-pulse page-badge">Admin Only · Access Control</div><h1>Staff & User Roles</h1><p className="page-intro">Promote trusted users to Manager or Administrator, or return staff accounts to Customer access.</p></div>
        <div className="admin-header-utilities"><Link href="/admin" className="btn btn-primary">Admin Console</Link><Link href="/manager" className="btn btn-secondary">Preview Manager Console</Link></div>
      </div>

      {error ? <p className="form-alert form-alert-error">{error}</p> : null}
      {message ? <p className="form-alert form-alert-success">{message}</p> : null}

      <div className="staff-role-summary-grid">
        <article className="card"><div className="badge card-badge">Administrators</div><strong className="staff-role-count">{counts.admin}</strong><p>Full system access and role management.</p></article>
        <article className="card"><div className="badge card-badge">Managers</div><strong className="staff-role-count">{counts.manager}</strong><p>Customer operations without security or infrastructure credentials.</p></article>
        <article className="card"><div className="badge card-badge">Customers</div><strong className="staff-role-count">{counts.customer}</strong><p>Customer portal access only.</p></article>
      </div>

      <article className="card staff-role-policy-card">
        <div className="badge card-badge">Manager Boundary</div>
        <h2>Managers cannot manage roles</h2>
        <p>Manager access includes customer records, ticket replies, live chat, service and customization requests, announcements, and payment recording. Monitor credentials, destructive network controls, staff roles, backups, and security settings remain administrator-only.</p>
      </article>

      <article className="card staff-role-list-card">
        <div className="admin-workspace-heading"><div><div className="badge card-badge">Accounts</div><h2>Role assignments</h2><p className="page-intro">Your own administrator role is locked here. The database also prevents removing the final administrator.</p></div></div>
        <div className="admin-filter-grid staff-role-filters"><input className="admin-search" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search account, role or ID..." /><select value={filter} onChange={(event) => setFilter(event.target.value)}><option value="all">All roles</option><option value="admin">Administrators</option><option value="manager">Managers</option><option value="customer">Customers</option><option value="support">Legacy support</option></select></div>
        <div className="staff-role-list admin-scroll-list">
          {filtered.map((profile) => {
            const self = profile.id === account.id;
            const draft = draftRoles[profile.id] ?? profile.role;
            const legacy = profile.role === "support";
            return <div className="staff-role-row" key={profile.id}>
              <div className="staff-role-person"><strong>{profile.full_name || "Unnamed account"}{self ? " · You" : ""}</strong><span>{profile.phone || "No phone"} · {profile.id.slice(0, 8)}…</span><span className={`status-pill staff-role-pill staff-role-${profile.role}`}>{profile.role}</span></div>
              <div className="staff-role-controls">
                <select value={legacy ? "support" : draft} onChange={(event) => setDraftRoles((current) => ({ ...current, [profile.id]: event.target.value }))} disabled={self || savingId === profile.id}>
                  {legacy ? <option value="support">Legacy Support</option> : null}
                  {assignableRoles.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}
                </select>
                <button type="button" className="btn btn-primary btn-compact" disabled={self || savingId === profile.id || draft === profile.role || legacy} onClick={() => void saveRole(profile)}>{savingId === profile.id ? "Saving..." : "Change Role"}</button>
              </div>
            </div>;
          })}
          {!filtered.length ? <p className="empty-state">No accounts match these filters.</p> : null}
        </div>
      </article>

      <article className="card staff-role-audit-card">
        <div className="badge card-badge">Audit Trail</div><h2>Recent role changes</h2>
        <div className="staff-role-audit-list">
          {audit.map((entry) => <div className="staff-role-audit-row" key={entry.id}><div><strong>{profileMap.get(entry.target_id ?? "")?.full_name || entry.target_id?.slice(0, 8) || "Deleted account"}</strong><span>{entry.old_role} → {entry.new_role}</span></div><div><span>by {entry.actor_id === account.id ? "you" : profileMap.get(entry.actor_id ?? "")?.full_name || entry.actor_id?.slice(0, 8) || "system"}</span><time>{new Date(entry.changed_at).toLocaleString()}</time></div></div>)}
          {!audit.length ? <p className="empty-state">No role changes have been recorded yet.</p> : null}
        </div>
      </article>
    </section>
  );
}
