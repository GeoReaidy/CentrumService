
'use client';

import Link from "next/link";
import { FormEvent, useEffect, useState } from "react";
import { getSupabaseBrowserClient } from "@/lib/supabase-browser";
import { TurnstileWidget } from "@/components/TurnstileWidget";

const CONFIRM_REDIRECT =
  "https://centrumservice.net/portal/email-confirmed";

function isRateLimitError(error: { message?: string; status?: number }) {
  const message = (error.message ?? "").toLowerCase();
  return (
    error.status === 429 ||
    message.includes("rate limit") ||
    message.includes("too many")
  );
}

export default function PortalResendConfirmationPage() {
  const [email, setEmail] = useState("");
  const [errorMessage, setErrorMessage] = useState("");
  const [successMessage, setSuccessMessage] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [cooldown, setCooldown] = useState(0);
  const [captchaToken, setCaptchaToken] = useState("");
  const [captchaResetKey, setCaptchaResetKey] = useState(0);
  const turnstileEnabled = Boolean(process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY);

  useEffect(() => {
    if (cooldown <= 0) return;
    const timer = window.setInterval(() => {
      setCooldown((value) => Math.max(0, value - 1));
    }, 1000);
    return () => window.clearInterval(timer);
  }, [cooldown]);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const normalizedEmail = email.trim().toLowerCase();
    if (!normalizedEmail) {
      setErrorMessage("Please enter your email address.");
      return;
    }

    if (cooldown > 0) return;
    if (turnstileEnabled && !captchaToken) {
      setErrorMessage("Please complete the security check.");
      return;
    }

    setErrorMessage("");
    setSuccessMessage("");
    setIsSubmitting(true);

    const supabase = getSupabaseBrowserClient();
    if (!supabase) {
      setErrorMessage("Centrum account services are temporarily unavailable.");
      setIsSubmitting(false);
      return;
    }

    const { error } = await supabase.auth.resend({
      type: "signup",
      email: normalizedEmail,
      options: {
        emailRedirectTo: CONFIRM_REDIRECT,
        captchaToken: captchaToken || undefined,
      },
    });

    if (error) {
      setCaptchaToken("");
      setCaptchaResetKey((value) => value + 1);
      setErrorMessage(
        isRateLimitError(error)
          ? "A confirmation email was requested too recently. Please wait a minute and try again."
          : "We couldn't request another confirmation email right now. If you've already confirmed this address, try signing in."
      );
      setIsSubmitting(false);
      return;
    }

    setSuccessMessage(
      "If this address still needs confirmation and is eligible for a resend, another confirmation email is on its way."
    );
    setCooldown(60);
    setIsSubmitting(false);
  }

  return (
    <section className="auth-shell animate-fade-in">
      <article className="card auth-card">
        <div className="badge card-badge">Account Verification</div>
        <h1>Resend Confirmation Email</h1>
        <p className="page-intro">
          Enter the email you used to create your Centrum Portal account.
        </p>

        <form className="form-grid" onSubmit={handleSubmit}>
          <label>
            Email
            <input
              type="email"
              placeholder="you@example.com"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              autoComplete="email"
              required
            />
          </label>

          <TurnstileWidget onToken={setCaptchaToken} resetKey={captchaResetKey} />

          {errorMessage ? (
            <p className="form-alert form-alert-error">{errorMessage}</p>
          ) : null}

          {successMessage ? (
            <p className="form-alert form-alert-success">{successMessage}</p>
          ) : null}

          <button
            type="submit"
            className="btn btn-primary"
            disabled={isSubmitting || cooldown > 0}
          >
            {isSubmitting
              ? "Requesting email..."
              : cooldown > 0
                ? `Try again in ${cooldown}s`
                : "Resend Confirmation"}
          </button>
        </form>

        <div className="section-actions">
          <Link href="/portal/login" className="btn btn-secondary">
            Back to Sign In
          </Link>
          <Link href="/portal/register" className="btn btn-secondary">
            Back to Registration
          </Link>
        </div>
      </article>
    </section>
  );
}
