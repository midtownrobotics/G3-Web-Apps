export function sanitizeRedirect(redirect: string | undefined | null): string | null {
  if (!redirect) return null;
  try {
    const url = new URL(redirect);
    const { hostname } = url;
    if (
      hostname === "g3robotics.com" ||
      hostname.endsWith(".g3robotics.com") ||
      hostname === "localhost"
    ) {
      return redirect;
    }
  } catch {
    if (redirect.startsWith("/")) return redirect;
  }
  return null;
}
