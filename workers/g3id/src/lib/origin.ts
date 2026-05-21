/**
 * Extracts the frontend origin from the Referer header and validates it
 * against the allowlist. Falls back to FRONTEND_URL if the referer is
 * missing or from an untrusted origin.
 *
 * This lets preview deployments (*.pages.dev) work without a config change.
 */
export function getReturnOrigin(request: Request, fallback: string): string {
  const referer = request.headers.get("Referer");
  if (referer) {
    try {
      const { origin } = new URL(referer);
      if (isAllowedOrigin(origin)) return origin;
    } catch {
      // malformed Referer — fall through to fallback
    }
  }
  return fallback;
}

export function isAllowedOrigin(origin: string): boolean {
  if (origin === "http://localhost:5173") return true;
  if (origin === "https://g3id.g3robotics.com") return true;
  try {
    const url = new URL(origin);
    if (url.hostname.endsWith(".pages.dev")) return true;
  } catch {}
  return false;
}
