import { useEffect, useState } from "react";
import { api } from "./api";

type AuthState = { id: string; displayName: string; isAdmin: boolean; email: string } | null;

export function useAuth(): { user: AuthState; loading: boolean } {
  const [user, setUser] = useState<AuthState>(undefined as unknown as AuthState);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.me
      .$get()
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => setUser(data))
      .catch(() => setUser(null))
      .finally(() => setLoading(false));
  }, []);

  return { user, loading };
}
