
'use client';

import Link from "next/link";
import { useEffect, useState } from "react";
import { getSupabaseBrowserClient } from "@/lib/supabase-browser";

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

export default function PortalEmailConfirmedPage() {
  const [status, setStatus] =
      useState<"working" | "success" | "error">("working");
  const [errorMessage, setErrorMessage] = useState("");

  useEffect(() => {
    const hashParams = new URLSearchParams(
        window.location.hash.replace(/^#/, "")
    );
    const queryParams = new URLSearchParams(window.location.search);
    const redirectError = decodedError(queryParams, hashParams);

    if (redirectError) {
      setErrorMessage(
          redirectError.toLowerCase().includes("expired")
              ? "This confirmation link has expired or was already used. Request a new confirmation email and try again."
              : "This confirmation link is invalid or could not be completed."
      );
      setStatus("error");
      return;
    }

    // Do not show a false success if somebody simply types this URL.
    const hasConfirmationPayload =
        hashParams.get("type") === "signup" ||
        queryParams.get("type") === "signup" ||
        hashParams.has("access_token") ||
        queryParams.has("code") ||
        queryParams.has("token_hash");

    if (!hasConfirmationPayload) {
      setErrorMessage(
          "Open this page from the confirmation link in your email."
      );
      setStatus("error");
      return;
    }

    const supabase = getSupabaseBrowserClient();
    if (!supabase) {
      setErrorMessage("Centrum account services are temporarily unavailable.");
      setStatus("error");
      return;
    }

    const client = supabase;
    let active = true;
    let finished = false;
    let checking = false;

    async function finishConfirmation() {
      if (!active || finished || checking) return false;
      checking = true;

      const { data, error } = await client.auth.getSession();
      if (!active) return false;

      if (error) {
        checking = false;
        setErrorMessage(
            "This confirmation link is invalid or has expired."
        );
        setStatus("error");
        return false;
      }

      if (!data.session) {
        checking = false;
        return false;
      }

      const { data: userData, error: userError } =
          await client.auth.getUser();

      if (!active) return false;

      if (
          userError ||
          !userData.user ||
          !userData.user.email_confirmed_at
      ) {
        checking = false;
        setErrorMessage(
            "We couldn't verify that this email was confirmed. Please request a new confirmation email."
        );
        setStatus("error");
        return false;
      }

      finished = true;

      // Remove auth tokens/codes from the visible URL before showing success.
      window.history.replaceState(
          null,
          "",
          window.location.pathname
      );

      const { error: signOutError } = await client.auth.signOut({
        scope: "local",
      });

      if (!active) return false;

      if (signOutError) {
        setErrorMessage(
            "Your email was confirmed, but we couldn't clear the temporary confirmation session. Refresh this page before signing in."
        );
        setStatus("error");
        return false;
      }

      setStatus("success");
      return true;
    }

    const { data: listener } = client.auth.onAuthStateChange(
        (event, session) => {
          if (!active) return;

          if (
              (event === "SIGNED_IN" || event === "INITIAL_SESSION") &&
              session
          ) {
            window.setTimeout(() => void finishConfirmation(), 0);
          }
        }
    );

    void finishConfirmation();

    const timeout = window.setTimeout(async () => {
      if (!active || finished) return;
      const completed = await finishConfirmation();

      if (!active || finished || completed) return;

      setErrorMessage(
          "This confirmation link is invalid, expired, or could not create a confirmation session."
      );
      setStatus("error");
    }, 1500);

    return () => {
      active = false;
      window.clearTimeout(timeout);
      listener.subscription.unsubscribe();
    };
  }, []);

  return (
      <section className="auth-shell animate-fade-in">
        <article className="card auth-card">
          {status === "working" ? (
              <>
                <div className="badge card-badge">Account Verification</div>
                <h1>Confirming Your Email</h1>
                <p className="page-intro">
                  Finishing your Centrum account verification...
                </p>
              </>
          ) : null}

          {status === "success" ? (
              <>
                <div className="badge card-badge">Verified</div>
                <h1>Email Confirmed</h1>
                <p className="page-intro">
                  Your Centrum account email has been verified successfully. You can
                  now sign in to your portal.
                </p>
                <Link href="/portal/login" className="btn btn-primary">
                  Return to Sign In
                </Link>
              </>
          ) : null}

          {status === "error" ? (
              <>
                <div className="badge card-badge">Verification</div>
                <h1>We Couldn't Finish Verification</h1>
                <p className="form-alert form-alert-error">{errorMessage}</p>
                <div className="section-actions">
                  <Link
                      href="/portal/resend-confirmation"
                      className="btn btn-primary"
                  >
                    Request Another Email
                  </Link>
                  <Link href="/portal/login" className="btn btn-secondary">
                    Return to Sign In
                  </Link>
                </div>
              </>
          ) : null}
        </article>
      </section>
  );
}