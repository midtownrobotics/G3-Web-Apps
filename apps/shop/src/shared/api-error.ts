/** Send the user to g3id login, preserving where they were so they return after auth. */
export function redirectToLogin(): void {
  const g3idUrl = import.meta.env.VITE_G3ID_URL || "http://localhost:5174";
  const redirect = encodeURIComponent(window.location.href);
  window.location.href = `${g3idUrl}/login?redirect=${redirect}`;
}

export async function getErrorMessage(res: Response): Promise<string> {
  if ((res.status as number) === 401) {
    redirectToLogin();
    return "Redirecting to login...";
  }
  try {
    const body = (await res.clone().json()) as { error?: string };
    if (body.error) return body.error;
  } catch {}
  return `Request failed (${res.status}).`;
}
