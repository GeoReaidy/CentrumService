"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { getSupabaseBrowserClient } from "@/lib/supabase-browser";
import { resolveUserRole, roleHome } from "@/lib/supabase-role";
import { CentrumLoadingScreen } from "@/components/CentrumLoading";

export default function PortalAuthCallbackPage() {
  const router = useRouter();
  const [errorMessage, setErrorMessage] = useState("");

  useEffect(() => {
    let cancelled = false;

    async function finishGoogleSignIn() {
      const query = new URLSearchParams(window.location.search);
      const hash = new URLSearchParams(window.location.hash.slice(1));
      const oauthError = query.get("error_description") ?? hash.get("error_description");

      if (oauthError) {
        if (!cancelled) {
          setErrorMessage("Google sign-in was cancelled or could not be completed.");
        }
        return;
      }

      const supabase = getSupabaseBrowserClient();
      if (!supabase) {
        if (!cancelled) {
          setErrorMessage("Centrum account services are temporarily unavailable.");
        }
        return;
      }

      // The browser client completes Supabase's implicit OAuth callback from
      // the URL fragment before getUser resolves. getUser then verifies the
      // session with Supabase before any role-based navigation occurs.
      const { data, error } = await supabase.auth.getUser();
      if (cancelled) return;

      if (error || !data.user) {
        setErrorMessage("We couldn't finish Google sign-in. Please return to login and try again.");
        return;
      }

      const role = await resolveUserRole(supabase, data.user);
      if (cancelled) return;

      if (role === "customer") {
        const { data: profile } = await supabase
          .from("profiles")
          .select("subscription_verified")
          .eq("id", data.user.id)
          .maybeSingle();
        if (cancelled) return;
        if (profile && !profile.subscription_verified) {
          router.replace("/portal/account#subscription-link");
          router.refresh();
          return;
        }
      }

      router.replace(roleHome(role));
      router.refresh();
    }

    void finishGoogleSignIn();

    return () => {
      cancelled = true;
    };
  }, [router]);

  if (!errorMessage) {
    return <CentrumLoadingScreen context="Secure Sign-In" message="Verifying your Google account and opening the correct Centrum workspace." />;
  }

  return (
    <section className="auth-shell auth-shell-single animate-fade-in">
      <article className="card auth-card auth-callback-card">
        <div className="badge card-badge">Sign-in problem</div>
        <h1>Google Sign-In Couldn&apos;t Finish</h1>
        <p className="form-alert form-alert-error">{errorMessage}</p>
        <Link href="/portal/login" className="btn btn-secondary">Return to Sign In</Link>
      </article>
    </section>
  );
}
