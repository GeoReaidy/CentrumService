"use client";

import { useState } from "react";
import { getSupabaseBrowserClient, setRememberSession } from "@/lib/supabase-browser";

type GoogleSignInButtonProps = {
  disabled?: boolean;
  rememberSession?: boolean;
};

export function GoogleSignInButton({
  disabled = false,
  rememberSession = true,
}: GoogleSignInButtonProps) {
  const [isConnecting, setIsConnecting] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");

  async function handleGoogleSignIn() {
    setErrorMessage("");
    setIsConnecting(true);
    setRememberSession(rememberSession);

    const supabase = getSupabaseBrowserClient();
    if (!supabase) {
      setErrorMessage("Centrum account services are temporarily unavailable.");
      setIsConnecting(false);
      return;
    }

    const { error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: {
        redirectTo: `${window.location.origin}/portal/auth/callback`,
        queryParams: {
          prompt: "select_account",
        },
      },
    });

    if (error) {
      setErrorMessage("Google sign-in is unavailable right now. Please try again.");
      setIsConnecting(false);
    }
  }

  return (
    <div className="google-auth-block">
      <button
        type="button"
        className="btn btn-google"
        onClick={handleGoogleSignIn}
        disabled={disabled || isConnecting}
      >
        <svg
          className="google-auth-icon"
          viewBox="0 0 24 24"
          aria-hidden="true"
          focusable="false"
        >
          <path fill="#4285F4" d="M21.6 12.23c0-.71-.06-1.4-.18-2.07H12v3.92h5.38a4.6 4.6 0 0 1-2 3.02v2.55h3.24c1.9-1.75 2.98-4.33 2.98-7.42Z" />
          <path fill="#34A853" d="M12 22c2.7 0 4.98-.9 6.63-2.35l-3.24-2.55c-.9.6-2.05.96-3.39.96-2.61 0-4.82-1.76-5.61-4.13H3.04v2.63A10 10 0 0 0 12 22Z" />
          <path fill="#FBBC05" d="M6.39 13.93A6.02 6.02 0 0 1 6.08 12c0-.67.11-1.32.31-1.93V7.44H3.04A10 10 0 0 0 2 12c0 1.61.38 3.14 1.04 4.56l3.35-2.63Z" />
          <path fill="#EA4335" d="M12 5.94c1.47 0 2.79.5 3.83 1.5l2.87-2.87A9.64 9.64 0 0 0 12 2a10 10 0 0 0-8.96 5.44l3.35 2.63C7.18 7.7 9.39 5.94 12 5.94Z" />
        </svg>
        <span>{isConnecting ? "Connecting to Google..." : "Continue with Google"}</span>
      </button>

      {errorMessage ? (
        <p className="form-alert form-alert-error google-auth-error">{errorMessage}</p>
      ) : null}
    </div>
  );
}
