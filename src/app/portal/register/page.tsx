'use client';

import Link from "next/link";
import { useRouter } from "next/navigation";
import { FormEvent, useState } from "react";
import { getSupabaseBrowserClient } from "@/lib/supabase-browser";
import { resolveIsAdmin } from "@/lib/supabase-role";
import { ServiceCustomizationWizard } from "@/components/ServiceCustomizationWizard";

export default function PortalRegisterPage() {
  const router = useRouter();
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [errorMessage, setErrorMessage] = useState("");
  const [successMessage, setSuccessMessage] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

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

    setErrorMessage("");
    setSuccessMessage("");
    setIsSubmitting(true);

    const supabase = getSupabaseBrowserClient();
    if (!supabase) {
      setErrorMessage("Supabase is not configured yet. Add NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY in .env.local.");
      setIsSubmitting(false);
      return;
    }

    const { data: { user, session }, error } = await supabase.auth.signUp({
      email: normalizedEmail,
      password,
      options: {
        data: {
          full_name: normalizedName,
        },
      },
    });

    if (error) {
      setErrorMessage(error.message);
      setIsSubmitting(false);
      return;
    }

    if (!session) {
      setSuccessMessage("Account created. Check your email to confirm your account, then sign in.");
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
              minLength={8}
              required
            />
          </label>

          {errorMessage ? <p className="form-alert form-alert-error">{errorMessage}</p> : null}
          {successMessage ? <p className="form-alert form-alert-success">{successMessage}</p> : null}

          <button type="submit" className="btn btn-primary" disabled={isSubmitting}>
            {isSubmitting ? "Creating account..." : "Create account"}
          </button>
        </form>

        <div className="auth-customization-box">
          <strong>Not sure which setup fits you?</strong>
          <p>This optional guided request helps Centrum recommend a plan and installation setup. Existing customers can use it too.</p>
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
