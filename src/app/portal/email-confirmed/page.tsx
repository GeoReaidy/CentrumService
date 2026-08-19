'use client';

import Link from "next/link";
import { useEffect, useState } from "react";
import { getSupabaseBrowserClient } from "@/lib/supabase-browser";

export default function PortalEmailConfirmedPage() {
  const [status, setStatus] = useState<"working" | "success" | "error">("working");
  const [errorMessage, setErrorMessage] = useState("");

  useEffect(() => {
    const hashParams = new URLSearchParams(window.location.hash.replace(/^#/, ""));
    const queryParams = new URLSearchParams(window.location.search);
    const redirectError =
        queryParams.get("error_description") ||
        hashParams.get("error_description") ||
        queryParams.get("error") ||
        hashParams.get("error");

    if (redirectError) {
      setErrorMessage(redirectError.replaceAll("+", " "));
      setStatus("error");
      return;
    }

    const supabase = getSupabaseBrowserClient();
    if (!supabase) {
      setErrorMessage("Centrum account services are temporarily unavailable.");
      setStatus("error");
      return;
    }

    // Preserve TypeScript's non-null narrowing inside nested callbacks/functions.
    const client = supabase;

    let active = true;
    let finishing = false;

    async function finishConfirmation() {
      if (!active || finishing) return;
      finishing = true;

      // Supabase may create a browser session after the confirmation redirect.
      // Clear only this browser session so the user can explicitly return to sign in.
      const { data, error } = await client.auth.getSession();
      if (!active) return;

      if (error) {
        setErrorMessage(
            "Your email was confirmed, but we couldn't finish preparing the sign-in page. Please refresh and try again."
        );
        setStatus("error");
        return;
      }

      if (data.session) {
        const { error: signOutError } = await client.auth.signOut({ scope: "local" });
        if (!active) return;

        if (signOutError) {
          setErrorMessage(
              "Your email was confirmed, but we couldn't clear the temporary confirmation session. Please refresh this page."
          );
          setStatus("error");
          return;
        }
      }

      setStatus("success");
    }

    const { data: listener } = client.auth.onAuthStateChange((event, session) => {
      if (!active) return;

      if ((event === "SIGNED_IN" || event === "INITIAL_SESSION") && session) {
        window.setTimeout(() => void finishConfirmation(), 0);
      }
    });

    const timer = window.setTimeout(() => void finishConfirmation(), 350);

    return () => {
      active = false;
      window.clearTimeout(timer);
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
                  Your Centrum account email has been verified successfully. You can now sign in to your portal.
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
                  <Link href="/portal/login" className="btn btn-primary">
                    Return to Sign In
                  </Link>
                  <Link href="/portal/register" className="btn btn-secondary">
                    Back to Registration
                  </Link>
                </div>
              </>
          ) : null}
        </article>
      </section>
  );
}