"use client";

import Link from "next/link";
import { CentrumLoadingPanel } from "@/components/CentrumLoading";

type AsyncStateProps = {
  eyebrow?: string;
  title: string;
  message: string;
  kind?: "loading" | "empty" | "error" | "offline";
  retryLabel?: string;
  onRetry?: () => void;
  href?: string;
  hrefLabel?: string;
};

export function AsyncState({
  eyebrow,
  title,
  message,
  kind = "empty",
  retryLabel = "Try Again",
  onRetry,
  href,
  hrefLabel,
}: AsyncStateProps) {
  if (kind === "loading") {
    return <CentrumLoadingPanel context={eyebrow} message={message} />;
  }

  return (
    <div className={`app-state app-state-${kind}`} role={kind === "error" || kind === "offline" ? "alert" : "status"}>
      {eyebrow ? <div className="badge card-badge">{eyebrow}</div> : null}
      <h2>{title}</h2>
      <p>{message}</p>
      {onRetry || href ? (
        <div className="section-actions app-state-actions">
          {onRetry ? <button type="button" className="btn btn-primary" onClick={onRetry}>{retryLabel}</button> : null}
          {href && hrefLabel ? <Link className="btn btn-secondary" href={href}>{hrefLabel}</Link> : null}
        </div>
      ) : null}
    </div>
  );
}
