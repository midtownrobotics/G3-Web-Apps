function cookieDomain(frontendUrl: string): string | undefined {
  try {
    const { hostname } = new URL(frontendUrl);
    if (hostname === "localhost") return undefined;
    // For subdomains like g3id.g3robotics.com, share the cookie across all subdomains
    const parts = hostname.split(".");
    if (parts.length >= 2) return parts.slice(-2).join(".");
  } catch {}
  return undefined;
}

export function sessionCookieOptions(frontendUrl: string) {
  const domain = cookieDomain(frontendUrl);
  return {
    httpOnly: true,
    secure: true,
    sameSite: "Lax" as const,
    maxAge: 60 * 60 * 24 * 7,
    path: "/",
    ...(domain ? { domain } : {}),
  };
}

export function deleteCookieOptions(frontendUrl: string) {
  const domain = cookieDomain(frontendUrl);
  return {
    path: "/",
    ...(domain ? { domain } : {}),
  };
}
