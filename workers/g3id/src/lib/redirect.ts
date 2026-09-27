import { isLocalHostname, isTeamHostname } from "@g3/config";

export function sanitizeRedirect(redirect: string | undefined | null): string | null {
  if (!redirect) return null;
  try {
    const { hostname } = new URL(redirect);
    if (isTeamHostname(hostname) || isLocalHostname(hostname)) return redirect;
  } catch {
    if (redirect.startsWith("/")) return redirect;
  }
  return null;
}
