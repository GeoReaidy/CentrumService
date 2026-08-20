
'use client';

import Link from "next/link";
import { FormEvent, useEffect, useState } from "react";
import { getSupabaseBrowserClient } from "@/lib/supabase-browser";

const RECOVERY_MARKER = "centrum_password_recovery_active";

function decodedError(
    queryParams: URLSearchParams,
    hashParams: URLSearchParams
) {
  const value =
      queryParams.get("error_description") ||
      hashParams.get("error_description") ||
      queryParams.get("error_code") ||
      hashParams.get("error_code") ||
      queryParams.get("error") ||
      hashParams.get("error");

  return value ? value.replaceAll("+", " ") : "";
}

export default function PortalResetPasswordPage() {
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [isRecoveryReady, setIsRecoveryReady] = useState(false);
  const [isCheckingLink, setIsCheckingLink] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const [successMessage, setSuccessMessage] = useState("");

  useEffect(() => {
    const hashParams = new URLSearchParams(
        window.location.hash.replace(/^#/, "")
    );
    const queryParams = new URLSearchParams(window.location.search);
    const redirectError = decodedError(queryParams, hashParams);

    if (redirectError) {
      window.sessionStorage.removeItem(RECOVERY_MARKER);
      setErrorMessage(
          redirectError.toLowerCase().includes("expired")
              ? "This password reset link has expired or was already used."
              : "This password reset link is invalid or could not be completed."
      );
      setIsCheckingLink(false);
      return;
    }

    const hasRecoveryPayload =
        hashParams.get("type") === "recovery" ||
        queryParams.get("type") === "recovery" ||
        hashParams.has("access_token") ||
        queryParams.has("code") ||
        queryParams.has("token_hash");

    const continuingRecovery =
        window.sessionStorage.getItem(RECOVERY_MARKER) === "true";

    if (!hasRecoveryPayload && !continuingRecovery) {
      setErrorMessage(
          "Open this page from the password reset link in your email."
      );
      setIsCheckingLink(false);
      return;
    }

    if (hasRecoveryPayload) {
      window.sessionStorage.setItem(RECOVERY_MARKER, "true");
    }

    const supabase = getSupabaseBrowserClient();
    if (!supabase) {
      setErrorMessage("Centrum account services are temporarily unavailable.");
      setIsCheckingLink(false);
      return;
    }

    const client = supabase;
    let active = true;
    let ready = false;

    function markReady() {
      if (!active || ready) return;
      ready = true;
      setIsRecoveryReady(true);
      setIsCheckingLink(false);

      // Once the auth client has consumed the redirect, keep secrets out of the URL.
      if (hasRecoveryPayload) {
        window.history.replaceState(
            null,
            "",
            window.location.pathname
        );
      }
    }

    const { data: listener } = client.auth.onAuthStateChange(
        (event, session) => {
          if (!active) return;
          if (event === "PASSWORD_RECOVERY" && session) {
            markReady();
          }
        }
    );

    client.auth.getSession().then(({ data, error }) => {
      if (!active || ready) return;

      if (error) {
        window.sessionStorage.removeItem(RECOVERY_MARKER);
        setErrorMessage(
            "This password reset link is invalid or has expired."
        );
        setIsCheckingLink(false);
        return;
      }

      // A session is accepted here only because the URL/marker proved that this
      // page was entered through the recovery flow. A normal signed-in session
      // cannot unlock the recovery form by simply visiting this route.
      if (data.session && (hasRecoveryPayload || continuingRecovery)) {
        markReady();
        return;
      }

      window.setTimeout(() => {
        if (!active || ready) return;
        window.sessionStorage.removeItem(RECOVERY_MARKER);
        setErrorMessage(
            "This password reset link is invalid or has expired."
        );
        setIsCheckingLink(false);
      }, 1200);
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
      setErrorMessage(
          "We couldn't update your password. The recovery session may have expired; request a new reset link and try again."
      );
      setIsSubmitting(false);
      return;
    }

    window.sessionStorage.removeItem(RECOVERY_MARKER);

    // End the temporary recovery session. The user explicitly signs in again.
    await supabase.auth.signOut();

    setSuccessMessage(
        "Your password has been updated. You can now sign in with your new password."
    );
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

          {isCheckingLink ? (
              <p className="form-alert">Checking your secure reset link...</p>
          ) : null}

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
                <Link
                    href="/portal/forgot-password"
                    className="btn btn-secondary"
                >
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

                {errorMessage ? (
                    <p className="form-alert form-alert-error">{errorMessage}</p>
                ) : null}

                <button
                    type="submit"
                    className="btn btn-primary"
                    disabled={isSubmitting}
                >
                  {isSubmitting ? "Updating password..." : "Update Password"}
                </button>
              </form>
          ) : null}
        </article>
      </section>
  );
}