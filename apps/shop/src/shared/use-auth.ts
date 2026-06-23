import { useEffect, useState } from "react";
import { api } from "./api";

export type AuthUser = {
  userId: string;
  isAdmin: boolean;
  email: string;
  displayName: string;
};

type AuthState =
  | { status: "loading" }
  | { status: "authenticated"; user: AuthUser }
  | { status: "unauthenticated" };

export function useAuth(): AuthState {
  const [state, setState] = useState<AuthState>({ status: "loading" });

  useEffect(() => {
    api.me.$get().then(async (res) => {
      if (res.ok) {
        const user = (await res.json()) as AuthUser;
        setState({ status: "authenticated", user });
      } else {
        setState({ status: "unauthenticated" });
      }
    });
  }, []);

  return state;
}
