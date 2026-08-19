'use client';

import Link from "next/link";
import { FormEvent, useState } from "react";
import { getSupabaseBrowserClient } from "@/lib/supabase-browser";

export default function PortalForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [errorMessage, setErrorMessage] = useState("");
  const [successMessage, setSuccessMessage] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const normalizedEmail = email.trim().toLowerCase();
    if (!normalizedEmail) {
      setErrorMessage("Please enter your email address.");
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

    const { error } = await supabase.auth.resetPasswordForEmail(normalizedEmail, {
      redirectTo: "https://centrumservice.net/portal/reset-password",
    });

    if (error) {
      setErrorMessage("We couldn't send a reset email right now. Please try again in a moment.");
      setIsSubmitting(false);
      return;
    }

    setSuccessMessage(
        "If an account exists for that email, a password reset link is on its way. Check your inbox and spam folder."
    );
    setIsSubmitting(false);
  }

  return (
      <section className="auth-shell animate-fade-in">
        <article className="card auth-card">
          <h1>Reset Your Password</h1>
          <p className="page-intro">
            Enter the email linked to your Centrum account and we&apos;ll send you a secure reset link.
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

            {errorMessage ? <p className="form-alert form-alert-error">{errorMessage}</p> : null}
            {successMessage ? <p className="form-alert form-alert-success">{successMessage}</p> : null}

            <button type="submit" className="btn btn-primary" disabled={isSubmitting}>
              {isSubmitting ? "Sending reset link..." : "Send Reset Link"}
            </button>
          </form>

          <p className="auth-helper-text">
            Remembered your password? <Link href="/portal/login">Back to sign in</Link>
          </p>
        </article>

        <aside className="card auth-aside">
          <h2>Secure account recovery</h2>
          <ul className="simple-list">
            <li>The reset link is sent only to the account email</li>
            <li>Choose a new password with at least 8 characters</li>
            <li>Contact Centrum support if you no longer have access to your email</li>
          </ul>
        </aside>
      </section>
  );
}