const apiBase = import.meta.env.VITE_API_BASE_URL ?? "";

export async function getApi<T>(path: string): Promise<{ data: T; ok: boolean; status: number }> {
  const res = await fetch(`${apiBase}${path}`);
  const data = (await res.json()) as T;
  return { data, ok: res.ok, status: res.status };
}

export async function deleteApi<T>(path: string): Promise<{ data: T; ok: boolean; status: number }> {
  const res = await fetch(`${apiBase}${path}`, { method: "DELETE" });
  const data = (await res.json()) as T;
  return { data, ok: res.ok, status: res.status };
}

export async function postApi<T>(path: string, body: unknown): Promise<{ data: T; ok: boolean; status: number }> {
  const res = await fetch(`${apiBase}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = (await res.json()) as T;
  return { data, ok: res.ok, status: res.status };
}
