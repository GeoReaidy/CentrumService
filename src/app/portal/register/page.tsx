
'use client';

import Link from "next/link";
import { useRouter } from "next/navigation";
import { FormEvent, useState } from "react";
import { getSupabaseBrowserClient } from "@/lib/supabase-browser";
import { resolveIsAdmin } from "@/lib/supabase-role";
import { ServiceCustomizationWizard } from "@/components/ServiceCustomizationWizard";
import { TurnstileWidget } from "@/components/TurnstileWidget";

const CONFIRM_REDIRECT =
  "https://centrumservice.net/portal/email-confirmed";

function registrationErrorMessage(error: { message?: string; status?: number }) {
  const message = (error.message ?? "").toLowerCase();

  if (
    error.status === 429 ||
    message.includes("rate limit") ||
    message.includes("too many")
  ) {
    return "Too many confirmation emails were requested. Please wait a minute and try again.";
  }

  if (message.includes("already registered")) {
    return "We couldn't create a new account with those details. If you've used this email before, try signing in or resetting your password.";
  }

  return "We couldn't create the account right now. Please check your details and try again.";
}

export default function PortalRegisterPage() {
  const router = useRouter();
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [errorMessage, setErrorMessage] = useState("");
  const [successMessage, setSuccessMessage] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [captchaToken, setCaptchaToken] = useState("");
  const [captchaResetKey, setCaptchaResetKey] = useState(0);
  const turnstileEnabled = Boolean(process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const normalizedName = fullName.trim();
    const normalizedEmail = email.trim().toLowerCase();

    if (!normalizedName || !normalizedEmail || !password || !confirmPassword) {
      setErrorMessage("Please complete all fields.");
      return;
    }

    if (password.length < 8) {
      setErrorMessage("Password must be at least 8 characters.");
      return;
    }

    if (password !== confirmPassword) {
      setErrorMessage("Password confirmation does not match.");
      return;
    }

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

    const {
      data: { user, session },
      error,
    } = await supabase.auth.signUp({
      email: normalizedEmail,
      password,
      options: {
        emailRedirectTo: CONFIRM_REDIRECT,
        captchaToken: captchaToken || undefined,
        data: {
          full_name: normalizedName,
        },
      },
    });

    if (error) {
      setCaptchaToken("");
      setCaptchaResetKey((value) => value + 1);
      setErrorMessage(registrationErrorMessage(error));
      setIsSubmitting(false);
      return;
    }

    if (!session) {
      // Supabase intentionally does not always reveal whether an address was
      // already registered. Keep this response generic.
      setSuccessMessage(
        "Registration received. If this email needs confirmation, check your inbox. If you already confirmed it, you can sign in."
      );
      setPassword("");
      setConfirmPassword("");
      setIsSubmitting(false);
      return;
    }

    const admin = await resolveIsAdmin(supabase, user);
    router.push(admin ? "/admin" : "/portal/dashboard");
    router.refresh();
  }

  return (
    <section className="auth-shell animate-fade-in">
      <article className="card auth-card">
        <h1>Create Your Portal Account</h1>
        <p className="page-intro">
          Register to track support requests and manage your internet service details.
        </p>

        <form className="form-grid" onSubmit={handleSubmit}>
          <label>
            Full name
            <input
              type="text"
              placeholder="Your full name"
              value={fullName}
              onChange={(event) => setFullName(event.target.value)}
              autoComplete="name"
              required
            />
          </label>

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

          <label>
            Password
            <input
              type="password"
              placeholder="Choose a password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              autoComplete="new-password"
              minLength={8}
              required
            />
          </label>

          <label>
            Confirm password
            <input
              type="password"
              placeholder="Repeat your password"
              value={confirmPassword}
              onChange={(event) => setConfirmPassword(event.target.value)}
              autoComplete="new-password"
              minLength={8}
              required
            />
          </label>

          <TurnstileWidget onToken={setCaptchaToken} resetKey={captchaResetKey} />

          {errorMessage ? (
            <p className="form-alert form-alert-error">{errorMessage}</p>
          ) : null}

          {successMessage ? (
            <>
              <p className="form-alert form-alert-success">{successMessage}</p>
              <div className="section-actions">
                <Link href="/portal/login" className="btn btn-secondary">
                  Sign In
                </Link>
                <Link
                  href="/portal/resend-confirmation"
                  className="btn btn-secondary"
                >
                  Resend Confirmation
                </Link>
              </div>
            </>
          ) : null}

          <button type="submit" className="btn btn-primary" disabled={isSubmitting}>
            {isSubmitting ? "Creating account..." : "Create account"}
          </button>
        </form>

        <div className="auth-customization-box">
          <strong>Not sure which setup fits you?</strong>
          <p>
            This optional guided request helps Centrum recommend a plan and
            installation setup. Existing customers can use it too.
          </p>
          <ServiceCustomizationWizard
            defaults={{ fullName, email }}
            triggerLabel="Help Me Customize My Service"
            triggerClassName="btn btn-secondary"
          />
        </div>

        <p className="auth-helper-text">
          Already have access? <Link href="/portal/login">Sign in</Link>
        </p>
      </article>
    </section>
  );
}
