/** Turn technical exceptions into short messages safe to show in the UI. */
export function friendlyError(err: unknown, fallback: string): string {
  const raw =
    err instanceof Error
      ? err.message
      : typeof err === "string"
        ? err
        : "";

  const text = raw.trim();
  if (!text) return fallback;

  const lower = text.toLowerCase();

  if (
    lower.includes("failed to fetch") ||
    lower.includes("networkerror") ||
    lower.includes("load failed") ||
    lower.includes("network request failed") ||
    lower.includes("fetch failed")
  ) {
    return "Could not reach the payment server. Check your internet connection and try again.";
  }

  if (lower.includes("checkout failed") || lower.includes("order poll failed")) {
    return "The payment service is temporarily unavailable. Please try again in a moment.";
  }

  if (lower.includes("timeout") || lower.includes("timed out")) {
    return "That took too long. Please try again.";
  }

  if (lower.includes("cors") || lower.includes("blocked")) {
    return "Could not connect to the payment server. Please try again later.";
  }

  // Hide stack-ish / TypeError / status-code dumps
  if (
    /^typeerror\b/i.test(text) ||
    /^error:\s/i.test(text) ||
    /\bstatus\b.*\d{3}/i.test(text) ||
    text.includes(" at ") ||
    text.length > 160
  ) {
    return fallback;
  }

  // Already a short human sentence
  if (/^[A-Z]/.test(text) && !text.includes("{") && text.length < 140) {
    return text;
  }

  return fallback;
}
