"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { FormEvent, useEffect, useState } from "react";
import type { User } from "@supabase/supabase-js";
import { AsyncState } from "@/components/AsyncState";
import { getSupabaseBrowserClient } from "@/lib/supabase-browser";
import { resolveIsAdmin } from "@/lib/supabase-role";
import { toFriendlyErrorMessage } from "@/lib/friendly-error";
import { NotificationPreferencesCard } from "@/components/NotificationPreferencesCard";

export default function AdminAccountPage() {
  const router = useRouter();
  const supabase = getSupabaseBrowserClient();

  const [account, setAccount] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(() => Boolean(supabase));
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [isSavingPassword, setIsSavingPassword] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const [successMessage, setSuccessMessage] = useState("");
  const [isSigningOut, setIsSigningOut] = useState(false);

  useEffect(() => {
    if (!supabase) {
      setIsLoading(false);
      return;
    }

    const client = supabase;
    let cancelled = false;

    async function loadAccount() {
      const { data, error } = await client.auth.getUser();
      if (cancelled) return;

      if (error || !data.user) {
        setAccount(null);
        setIsLoading(false);
        router.replace("/portal/login");
        return;
      }

      const isAdmin = await resolveIsAdmin(client, data.user);
      if (cancelled) return;

      if (!isAdmin) {
        setIsLoading(false);
        router.replace("/portal/dashboard");
        return;
      }

      setAccount(data.user);
      setIsLoading(false);
    }

    void loadAccount();

    return () => {
      cancelled = true;
    };
  }, [router, supabase]);

  async function changePassword(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!supabase || !account?.email || isSavingPassword) return;

    if (!currentPassword) {
      setErrorMessage("Enter your current password.");
      return;
    }

    if (newPassword.length < 8) {
      setErrorMessage("Your new password must be at least 8 characters.");
      return;
    }

    if (newPassword !== confirmPassword) {
      setErrorMessage("The new-password confirmation does not match.");
      return;
    }

    if (currentPassword === newPassword) {
      setErrorMessage("Choose a new password that is different from your current password.");
      return;
    }

    setErrorMessage("");
    setSuccessMessage("");
    setIsSavingPassword(true);

    // Re-authenticate before changing an administrator password.
    const { error: verifyError } = await supabase.auth.signInWithPassword({
      email: account.email,
      password: currentPassword,
    });

    if (verifyError) {
      setErrorMessage("Your current password is incorrect.");
      setIsSavingPassword(false);
      return;
    }

    const { error: updateError } = await supabase.auth.updateUser({
      password: newPassword,
    });

    if (updateError) {
      console.error("Admin password update failed", updateError);
      setErrorMessage(
        toFriendlyErrorMessage(
          updateError,
          "We couldn't update the password right now. Please try again.",
        ),
      );
      setIsSavingPassword(false);
      return;
    }

    setCurrentPassword("");
    setNewPassword("");
    setConfirmPassword("");
    setSuccessMessage("Your administrator password was updated successfully.");
    setIsSavingPassword(false);
  }

  async function signOut() {
    if (!supabase || isSigningOut) return;

    setIsSigningOut(true);
    const { error } = await supabase.auth.signOut();

    if (error) {
      setErrorMessage(
        toFriendlyErrorMessage(error, "Sign out failed. Please try again."),
      );
      setIsSigningOut(false);
      return;
    }

    router.replace("/portal/login");
    router.refresh();
  }

  if (isLoading) {
    return (
      <section className="admin-page">
        <AsyncState
          kind="loading"
          eyebrow="Administrator Account"
          title="Opening account settings"
          message="Checking your administrator session."
        />
      </section>
    );
  }

  if (!supabase) {
    return (
      <section className="admin-page">
        <AsyncState
          kind="error"
          eyebrow="Administrator Account"
          title="Account settings are unavailable"
          message="Centrum account services are temporarily unavailable."
        />
      </section>
    );
  }

  if (!account) return null;

  return (
    <section className="animate-fade-in admin-page">
      <div className="admin-header admin-console-header">
        <div>
          <div className="badge badge-pulse page-badge">Privileged Access · Account</div>
          <h1>Admin Account Settings</h1>
          <p className="page-intro">
            Manage the sign-in credentials and session for this Centrum administrator account.
          </p>
        </div>

        <div className="admin-header-utilities">
          <Link href="/admin" className="btn btn-primary">Back to Admin Console</Link>
          <button
            type="button"
            className="btn btn-secondary"
            onClick={() => void signOut()}
            disabled={isSigningOut}
          >
            {isSigningOut ? "Signing Out..." : "Sign Out"}
          </button>
        </div>
      </div>

      <div className="section-grid" style={{ marginTop: "1rem" }}>
        <article className="card">
          <div className="badge card-badge">Administrator</div>
          <h2>Sign-in Details</h2>
          <div className="dashboard-detail-list" style={{ marginTop: "1rem" }}>
            <span><strong>Email:</strong> {account.email ?? "Not available"}</span>
            <span><strong>Role:</strong> Administrator</span>
            <span>
              <strong>Last sign in:</strong>{" "}
              {account.last_sign_in_at ? new Date(account.last_sign_in_at).toLocaleString() : "Not available"}
            </span>
          </div>

          <div className="section-actions">
            <Link href="/admin" className="btn btn-secondary">Admin Console</Link>
            <Link href="/portal/forgot-password" className="btn btn-secondary">Email Me a Reset Link</Link>
          </div>
        </article>

        <article className="card">
          <div className="badge card-badge">Security</div>
          <h2>Change Password</h2>
          <p className="page-intro">
            Your current password is required before the administrator password can be changed.
          </p>

          <form className="form-grid" onSubmit={changePassword} style={{ marginTop: "1rem" }}>
            <label>
              Current password
              <input
                type="password"
                autoComplete="current-password"
                value={currentPassword}
                onChange={(event) => setCurrentPassword(event.target.value)}
                disabled={isSavingPassword}
                required
              />
            </label>

            <label>
              New password
              <input
                type="password"
                autoComplete="new-password"
                minLength={8}
                value={newPassword}
                onChange={(event) => setNewPassword(event.target.value)}
                disabled={isSavingPassword}
                required
              />
              <span className="field-note">Use at least 8 characters.</span>
            </label>

            <label>
              Confirm new password
              <input
                type="password"
                autoComplete="new-password"
                minLength={8}
                value={confirmPassword}
                onChange={(event) => setConfirmPassword(event.target.value)}
                disabled={isSavingPassword}
                required
              />
            </label>

            {errorMessage ? <p className="form-alert form-alert-error">{errorMessage}</p> : null}
            {successMessage ? <p className="form-alert form-alert-success">{successMessage}</p> : null}

            <button
              type="submit"
              className="btn btn-primary"
              disabled={
                isSavingPassword ||
                !currentPassword ||
                newPassword.length < 8 ||
                newPassword !== confirmPassword
              }
            >
              {isSavingPassword ? "Updating Password..." : "Update Password"}
            </button>
          </form>
        </article>
      </div>

      <div style={{ marginTop: "1rem" }}>
        <NotificationPreferencesCard userId={account.id} isAdmin />
      </div>

      <article
        className="card"
        style={{ marginTop: "1rem", borderColor: "rgba(255, 190, 80, 0.35)" }}
      >
        <div className="badge card-badge">Protected Admin Account</div>
        <h2>Administrator deletion is disabled</h2>
        <p className="page-intro">
          Customer self-service deletion is intentionally not available to administrators.
          This prevents an administrator from accidentally removing a privileged account from
          the customer deletion flow.
        </p>
      </article>
    </section>
  );
}
