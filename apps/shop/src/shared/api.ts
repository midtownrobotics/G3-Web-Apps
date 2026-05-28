const apiBase = import.meta.env.VITE_API_BASE_URL ?? "";

async function get<T>(path: string) {
  const res = await fetch(`${apiBase}${path}`, { credentials: "include" });
  const data = (await res.json()) as T;
  return { data, ok: res.ok, status: res.status };
}

async function post<T>(path: string, body: unknown) {
  const res = await fetch(`${apiBase}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
    credentials: "include",
  });
  const data = (await res.json()) as T;
  return { data, ok: res.ok, status: res.status };
}

async function patch<T>(path: string, body: unknown) {
  const res = await fetch(`${apiBase}${path}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
    credentials: "include",
  });
  const data = (await res.json()) as T;
  return { data, ok: res.ok, status: res.status };
}

async function del<T>(path: string) {
  const res = await fetch(`${apiBase}${path}`, { method: "DELETE", credentials: "include" });
  const data = (await res.json()) as T;
  return { data, ok: res.ok, status: res.status };
}

// --- Types ---

export type Me = { userId: string; isAdmin: boolean, displayName: string, email: string };

// --- Endpoints ---

export const api = {
  me: () => get<Me>("/me")
};
