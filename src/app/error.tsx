"use client";

import Link from "next/link";
import { useEffect } from "react";

export default function ErrorPage({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("Centrum route error", error);
  }, [error]);

  return (
    <section className="app-state-page animate-fade-in">
      <div className="app-state app-state-error" role="alert">
        <div className="badge card-badge">Temporary Problem</div>
        <h1>We couldn't load this page</h1>
        <p>Your account or data has not been changed. Try the page again, or return home if the problem continues.</p>
        {error.digest ? <p className="app-state-reference">Reference: {error.digest}</p> : null}
        <div className="section-actions app-state-actions">
          <button type="button" className="btn btn-primary" onClick={reset}>Try Again</button>
          <Link href="/" className="btn btn-secondary">Back to Home</Link>
        </div>
      </div>
    </section>
  );
}
