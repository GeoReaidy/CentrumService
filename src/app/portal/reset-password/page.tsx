'use client';

import Link from "next/link";
import { FormEvent, useEffect, useState } from "react";
import { getSupabaseBrowserClient } from "@/lib/supabase-browser";

export default function PortalResetPasswordPage() {
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [isRecoveryReady, setIsRecoveryReady] = useState(false);
  const [isCheckingLink, setIsCheckingLink] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const [successMessage, setSuccessMessage] = useState("");

  useEffect(() => {
    const supabase = getSupabaseBrowserClient();
    if (!supabase) {
      setErrorMessage("Centrum account services are temporarily unavailable.");
      setIsCheckingLink(false);
      return;
    }

    let active = true;
    let recoverySeen = false;

    const { data: listener } = supabase.auth.onAuthStateChange((event, session) => {
      if (!active) return;
      if (event === "PASSWORD_RECOVERY" && session) {
        recoverySeen = true;
        setIsRecoveryReady(true);
        setIsCheckingLink(false);
      }
    });

    supabase.auth.getSession().then(({ data, error }) => {
      if (!active) return;
      if (error) {
        setErrorMessage("This password reset link is invalid or has expired.");
        setIsCheckingLink(false);
        return;
      }

      if (data.session) {
        setIsRecoveryReady(true);
        setIsCheckingLink(false);
        return;
      }

      window.setTimeout(() => {
        if (!active || recoverySeen) return;
        setErrorMessage("This password reset link is invalid or has expired.");
        setIsCheckingLink(false);
      }, 750);
    });

    return () => {
      active = false;
      listener.subscription.unsubscribe();
    };
  }, []);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (password.length < 8) {
      setErrorMessage("Password must be at least 8 characters.");
      return;
    }

    if (password !== confirmPassword) {
      setErrorMessage("Password confirmation does not match.");
      return;
    }

    const supabase = getSupabaseBrowserClient();
    if (!supabase) {
      setErrorMessage("Centrum account services are temporarily unavailable.");
      return;
    }

    setErrorMessage("");
    setSuccessMessage("");
    setIsSubmitting(true);

    const { error } = await supabase.auth.updateUser({ password });
    if (error) {
      setErrorMessage(error.message);
      setIsSubmitting(false);
      return;
    }

    await supabase.auth.signOut();
    setSuccessMessage("Your password has been updated. You can now sign in with your new password.");
    setPassword("");
    setConfirmPassword("");
    setIsRecoveryReady(false);
    setIsSubmitting(false);
  }

  return (
    <section className="auth-shell animate-fade-in">
      <article className="card auth-card">
        <h1>Choose a New Password</h1>
        <p className="page-intro">
          Set a new password for your Centrum Portal account.
        </p>

        {isCheckingLink ? <p className="form-alert">Checking your secure reset link...</p> : null}

        {successMessage ? (
          <>
            <p className="form-alert form-alert-success">{successMessage}</p>
            <Link href="/portal/login" className="btn btn-primary">
              Back to Sign In
            </Link>
          </>
        ) : null}

        {!successMessage && errorMessage && !isRecoveryReady ? (
          <>
            <p className="form-alert form-alert-error">{errorMessage}</p>
            <Link href="/portal/forgot-password" className="btn btn-secondary">
              Request a New Reset Link
            </Link>
          </>
        ) : null}

        {!successMessage && isRecoveryReady ? (
          <form className="form-grid" onSubmit={handleSubmit}>
            <label>
              New password
              <input
                type="password"
                placeholder="Choose a new password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                autoComplete="new-password"
                minLength={8}
                required
              />
              <span className="field-note">Use at least 8 characters.</span>
            </label>

            <label>
              Confirm new password
              <input
                type="password"
                placeholder="Repeat your new password"
                value={confirmPassword}
                onChange={(event) => setConfirmPassword(event.target.value)}
                autoComplete="new-password"
                minLength={8}
                required
              />
            </label>

            {errorMessage ? <p className="form-alert form-alert-error">{errorMessage}</p> : null}

            <button type="submit" className="btn btn-primary" disabled={isSubmitting}>
              {isSubmitting ? "Updating password..." : "Update Password"}
            </button>
          </form>
        ) : null}
      </article>
    </section>
  );
}
