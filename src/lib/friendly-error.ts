type ErrorLike = {
  message?: string | null;
  code?: string | null;
  status?: number | null;
};

/**
 * Converts backend/network errors into messages that are safe and useful to
 * show in the browser. Detailed provider/database errors should stay in logs.
 */
export function toFriendlyErrorMessage(
  error: unknown,
  fallback = "Something went wrong. Please try again.",
): string {
  const candidate = (typeof error === "object" && error !== null ? error : {}) as ErrorLike;
  const message = String(candidate.message ?? "").toLowerCase();
  const code = String(candidate.code ?? "").toLowerCase();
  const status = Number(candidate.status ?? 0);

  if (
    message.includes("failed to fetch") ||
    message.includes("network") ||
    message.includes("fetch") ||
    message.includes("timeout") ||
    message.includes("offline")
  ) {
    return "We couldn't reach Centrum's service right now. Check your connection and try again.";
  }

  if (status === 429 || message.includes("rate limit") || message.includes("too many requests")) {
    return "Too many attempts were made in a short time. Please wait a moment and try again.";
  }

  if (
    status === 401 ||
    status === 403 ||
    code === "42501" ||
    message.includes("permission denied") ||
    message.includes("row-level security")
  ) {
    return "Your session does not have permission to do that. Sign in again and retry.";
  }

  if (message.includes("jwt") || message.includes("session") && message.includes("expired")) {
    return "Your session has expired. Sign in again to continue.";
  }

  if (code === "23505" || message.includes("duplicate")) {
    return "That information already exists. Check the details and try again.";
  }

  return fallback;
}
