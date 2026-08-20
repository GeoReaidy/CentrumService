'use client';

import Link from "next/link";
import { useRouter } from "next/navigation";
import { FormEvent, useState } from "react";
import { getSupabaseBrowserClient, setRememberSession } from "@/lib/supabase-browser";

function loginErrorMessage(error: { message?: string; status?: number }) {
  const message = (error.message ?? "").toLowerCase();

  if (message.includes("email not confirmed")) {
    return "Confirm your email before signing in.";
  }

  if (
      error.status === 429 ||
      message.includes("rate limit") ||
      message.includes("too many")
  ) {
    return "Too many sign-in attempts. Please wait a moment and try again.";
  }

  if (
      message.includes("invalid login credentials") ||
      message.includes("invalid credentials")
  ) {
    return "Email or password is incorrect.";
  }

  return "We couldn't sign you in. Please check your details and try again.";
}

export default function PortalLoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [errorMessage, setErrorMessage] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [rememberMe, setRememberMe] = useState(true);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const normalizedEmail = email.trim().toLowerCase();
    if (!normalizedEmail || !password) {
      setErrorMessage("Please enter both email and password.");
      return;
    }

    if (password.length < 8) {
      setErrorMessage("Password must be at least 8 characters.");
      return;
    }

    setErrorMessage("");
    setIsSubmitting(true);

    setRememberSession(rememberMe);
    const supabase = getSupabaseBrowserClient();
    if (!supabase) {
      setErrorMessage("Centrum account services are temporarily unavailable.");
      setIsSubmitting(false);
      return;
    }

    const { error } = await supabase.auth.signInWithPassword({
      email: normalizedEmail,
      password,
    });

    if (error) {
      setErrorMessage(loginErrorMessage(error));
      setIsSubmitting(false);
      return;
    }

    // Let the role-aware portal router choose customer vs. admin workspace.
    router.replace("/portal");
    router.refresh();
  }

  return (
      <section className="auth-shell animate-fade-in">
        <article className="card auth-card">
          <h1>Centrum Portal Login</h1>
          <p className="page-intro">
            Sign in to open the correct Centrum workspace for your account.
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

            <label>
              Password
              <input
                  type="password"
                  placeholder="Your password"
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  autoComplete="current-password"
                  minLength={8}
                  required
              />
              <span className="field-note">Use at least 8 characters.</span>
            </label>

            <div
                className="auth-helper-text"
                style={{ marginTop: "-0.35rem", textAlign: "right" }}
            >
              <Link href="/portal/forgot-password">Forgot password?</Link>
            </div>

            <label style={{ display: "flex", alignItems: "center", gap: "0.6rem" }}>
              <input
                  type="checkbox"
                  checked={rememberMe}
                  onChange={(event) => setRememberMe(event.target.checked)}
                  style={{ width: "auto" }}
              />
              Remember me on this device
            </label>

            {errorMessage ? (
                <p className="form-alert form-alert-error">{errorMessage}</p>
            ) : null}

            <button type="submit" className="btn btn-primary" disabled={isSubmitting}>
              {isSubmitting ? "Signing in..." : "Sign In"}
            </button>
          </form>

          <p className="auth-helper-text">
            Need another confirmation email?{" "}
            <Link href="/portal/resend-confirmation">Resend confirmation</Link>
          </p>

          <p className="auth-helper-text">
            New customer? <Link href="/portal/register">Create an account</Link>
          </p>
        </article>

        <aside className="card auth-aside">
          <h2>Portal features</h2>
          <ul className="simple-list">
            <li>Track your open support tickets in real-time</li>
            <li>See current plan details and service status</li>
            <li>Get direct updates from support engineers</li>
          </ul>
        </aside>
      </section>
  );
}