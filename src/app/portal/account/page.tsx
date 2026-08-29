'use client';

import Link from "next/link";
import { useRouter } from "next/navigation";
import { FormEvent, useEffect, useState } from "react";
import type { User } from "@supabase/supabase-js";
import { getSupabaseBrowserClient } from "@/lib/supabase-browser";
import { resolveIsAdmin } from "@/lib/supabase-role";

export default function PortalAccountPage() {
  const router = useRouter();
  const supabase = getSupabaseBrowserClient();
  const [account, setAccount] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(() => Boolean(supabase));
  const [currentPassword, setCurrentPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [errorMessage, setErrorMessage] = useState("");
  const [isDeleting, setIsDeleting] = useState(false);
  const [portalMode, setPortalMode] = useState<"simple" | "advanced">("simple");
  const [portalModeSaving, setPortalModeSaving] = useState(false);
  const [portalModeMessage, setPortalModeMessage] = useState("");
  const [portalModeError, setPortalModeError] = useState("");

  useEffect(() => {
    if (!supabase) {
      setIsLoading(false);
      return;
    }

    const client = supabase;
    let mounted = true;

    async function loadAccount() {
      const { data, error } = await client.auth.getUser();
      if (!mounted) return;

      if (error || !data.user) {
        setAccount(null);
        setIsLoading(false);
        router.replace("/portal/login");
        return;
      }

      const admin = await resolveIsAdmin(client, data.user);
      if (!mounted) return;

      if (admin) {
        setIsLoading(false);
        router.replace("/admin");
        return;
      }

      const { data: preference, error: preferenceError } = await client
        .from("customer_portal_preferences")
        .select("portal_mode")
        .eq("customer_id", data.user.id)
        .maybeSingle();

      if (!mounted) return;

      if (preferenceError) {
        console.error("Portal preference load failed", preferenceError);
        setPortalModeError("Your portal display preference could not be loaded.");
      } else {
        setPortalMode(preference?.portal_mode === "advanced" ? "advanced" : "simple");
      }

      setAccount(data.user);
      setIsLoading(false);
    }

    void loadAccount();

    return () => {
      mounted = false;
    };
  }, [router, supabase]);

  async function savePortalMode(nextMode: "simple" | "advanced") {
    if (!supabase || !account || portalModeSaving || nextMode === portalMode) return;
    setPortalModeSaving(true);
    setPortalModeError("");
    setPortalModeMessage("");

    const { error } = await supabase
      .from("customer_portal_preferences")
      .upsert({ customer_id: account.id, portal_mode: nextMode }, { onConflict: "customer_id" });

    if (error) {
      console.error("Portal preference save failed", error);
      setPortalModeError("We couldn't save your portal preference right now.");
    } else {
      setPortalMode(nextMode);
      setPortalModeMessage(nextMode === "simple"
        ? "Simple mode is now your default dashboard."
        : "Advanced mode is now your default dashboard.");
    }

    setPortalModeSaving(false);
  }

  async function deleteAccount(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!supabase || !account || isDeleting) return;

    if (!currentPassword) {
      setErrorMessage("Enter your current password.");
      return;
    }

    if (confirmation.trim() !== "DELETE") {
      setErrorMessage("Type DELETE exactly to confirm permanent account deletion.");
      return;
    }

    setErrorMessage("");
    setIsDeleting(true);

    const { error } = await supabase.functions.invoke("delete-account", {
      body: {
        current_password: currentPassword,
        confirmation: confirmation.trim(),
      },
    });

    if (error) {
      let message = error.message || "The account could not be deleted.";
      const context = (error as unknown as { context?: Response }).context;

      if (context) {
        try {
          const payload = (await context.clone().json()) as { error?: unknown };
          if (typeof payload.error === "string" && payload.error.trim()) {
            message = payload.error;
          }
        } catch {
          // Keep the Supabase Functions error message when the body is not JSON.
        }
      }

      setErrorMessage(message);
      setIsDeleting(false);
      return;
    }

    // The Auth user is already gone. Best-effort local sign-out clears the
    // browser's cached session before showing the completion page.
    await supabase.auth.signOut({ scope: "local" });
    router.replace("/portal/account-deleted");
    router.refresh();
  }

  if (isLoading) {
    return (
      <section>
        <h1>Account Settings</h1>
        <p className="page-intro">Loading your account...</p>
      </section>
    );
  }

  if (!supabase) {
    return (
      <section>
        <h1>Account Settings</h1>
        <p className="page-intro">Centrum account services are temporarily unavailable.</p>
      </section>
    );
  }

  if (!account) return null;

  return (
    <section className="animate-fade-in">
      <div className="badge page-badge">Portal Account</div>
      <h1>Account Settings</h1>
      <p className="page-intro">Manage your Centrum Portal account.</p>

      <div className="section-grid" style={{ marginTop: "1.5rem" }}>
        <article className="card">
          <div className="badge card-badge">Account</div>
          <h2>Sign-in Details</h2>
          <div className="dashboard-detail-list" style={{ marginTop: "1rem" }}>
            <span><strong>Email:</strong> {account.email ?? "Not available"}</span>
          </div>
          <div className="section-actions">
            <Link href="/portal/dashboard" className="btn btn-secondary">Back to Dashboard</Link>
            <Link href="/portal/forgot-password" className="btn btn-secondary">Reset Password</Link>
          </div>
        </article>

        <article className="card portal-mode-settings-card">
          <div className="badge card-badge">Portal Experience</div>
          <h2>Choose your dashboard</h2>
          <p className="page-intro">
            Simple mode keeps the everyday tools together on one page. Advanced mode restores the full customer workspace menu.
          </p>

          <div
            className="portal-mode-picker"
            role="group"
            aria-label="Portal experience"
            style={{ gridTemplateColumns: "1fr" }}
          >
            <button
              type="button"
              className={`portal-mode-option ${portalMode === "simple" ? "is-selected" : ""}`}
              style={{ display: "grid", gridTemplateColumns: "minmax(0, 1fr) auto", alignItems: "center", width: "100%" }}
              onClick={() => void savePortalMode("simple")}
              disabled={portalModeSaving}
            >
              <span style={{ minWidth: 0 }}>
                <strong>Simple</strong>
                <small>Recommended · one-page dashboard with the essentials.</small>
              </span>
              <b style={{ whiteSpace: "nowrap" }}>{portalMode === "simple" ? "Selected" : "Use Simple"}</b>
            </button>

            <button
              type="button"
              className={`portal-mode-option ${portalMode === "advanced" ? "is-selected" : ""}`}
              style={{ display: "grid", gridTemplateColumns: "minmax(0, 1fr) auto", alignItems: "center", width: "100%" }}
              onClick={() => void savePortalMode("advanced")}
              disabled={portalModeSaving}
            >
              <span style={{ minWidth: 0 }}>
                <strong>Advanced</strong>
                <small>Shows the full Service, Billing, Support and Account workspaces.</small>
              </span>
              <b style={{ whiteSpace: "nowrap" }}>{portalMode === "advanced" ? "Selected" : "Use Advanced"}</b>
            </button>
          </div>

          {portalModeSaving ? <p className="field-note">Saving your preference...</p> : null}
          {portalModeError ? <p className="form-alert form-alert-error">{portalModeError}</p> : null}
          {portalModeMessage ? <p className="form-alert form-alert-success">{portalModeMessage}</p> : null}
        </article>

        <article
          className="card"
          style={{ borderColor: "rgba(255, 96, 127, 0.5)" }}
        >
          <div className="badge card-badge">Danger Zone</div>
          <h2>Delete Portal Account</h2>
          <p className="page-intro">
            This permanently removes your Centrum Portal login and the customer data linked to this portal account.
            It cannot be undone.
          </p>
          <p className="form-alert form-alert-error" style={{ marginTop: "1rem" }}>
            Deleting the portal account does not automatically cancel an internet subscription or equipment agreement.
            Contact Centrum separately if you also want the physical service cancelled.
          </p>

          <form className="form-grid" onSubmit={deleteAccount} style={{ marginTop: "1rem" }}>
            <label>
              Current password
              <input
                type="password"
                value={currentPassword}
                onChange={(event) => setCurrentPassword(event.target.value)}
                placeholder="Enter your current password"
                autoComplete="current-password"
                disabled={isDeleting}
                required
              />
            </label>

            <label>
              Type DELETE to confirm
              <input
                type="text"
                value={confirmation}
                onChange={(event) => setConfirmation(event.target.value)}
                placeholder="DELETE"
                autoComplete="off"
                disabled={isDeleting}
                required
              />
            </label>

            {errorMessage ? <p className="form-alert form-alert-error">{errorMessage}</p> : null}

            <button
              type="submit"
              className="btn btn-danger"
              disabled={isDeleting || confirmation.trim() !== "DELETE" || !currentPassword}
            >
              {isDeleting ? "Deleting Account..." : "Permanently Delete My Account"}
            </button>
          </form>
        </article>
      </div>
    </section>
  );
}
