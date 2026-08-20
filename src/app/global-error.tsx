"use client";

import { useEffect } from "react";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("Centrum global error", error);
  }, [error]);

  return (
    <html lang="en">
      <body>
        <main className="global-error-fallback">
          <div className="global-error-card" role="alert">
            <p className="global-error-kicker">CENTRUM SERVICE</p>
            <h1>Something went wrong</h1>
            <p>We hit an unexpected problem while opening Centrum Service. Please try again.</p>
            {error.digest ? <p className="global-error-reference">Reference: {error.digest}</p> : null}
            <button type="button" onClick={reset}>Try Again</button>
          </div>
        </main>
      </body>
    </html>
  );
}
