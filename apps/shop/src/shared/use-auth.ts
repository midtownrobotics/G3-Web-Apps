import { createContext, useContext, useEffect, useState } from "react";
import { api } from "./api";

export type AuthUser = {
  userId: string;
  isAdmin: boolean;
  email: string;
  displayName: string;
  sessionType: "oauth" | "pin";
  kioskDeviceId: number | null;
  kioskDeviceName: string | null;
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

/** The authenticated user, provided by ProtectedRoute for the whole app. */
export const AuthUserContext = createContext<AuthUser | null>(null);

export function useAuthUser(): AuthUser | null {
  return useContext(AuthUserContext);
}

/** True when the app should present the kiosk experience: either the session
 * is a PIN session or this device has been marked as a kiosk. */
export function useKiosk(): { active: boolean; machineName: string | null } {
  const user = useAuthUser();
  const active = user?.sessionType === "pin";
  return { active, machineName: user?.kioskDeviceName ?? null };
}
