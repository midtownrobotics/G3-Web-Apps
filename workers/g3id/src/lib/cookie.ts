import { cookieDomain } from "@g3/config";

export function sessionCookieOptions(frontendUrl: string) {
  const domain = cookieDomain(frontendUrl);
  let secure = true;
  try {
    secure = new URL(frontendUrl).protocol === "https:";
  } catch {}
  return {
    httpOnly: true,
    secure,
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
