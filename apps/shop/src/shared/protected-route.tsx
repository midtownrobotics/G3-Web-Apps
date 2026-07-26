import type { ReactNode } from "react";
import { redirectToLogin } from "./api-error";
import { KioskShell } from "./kiosk-shell";
import { PageLoading } from "./ui";
import { AuthUserContext, useAuth } from "./use-auth";

export function ProtectedRoute({ children }: { children: ReactNode }) {
  const auth = useAuth();

  if (auth.status === "loading") return <PageLoading />;

  if (auth.status === "unauthenticated") {
    redirectToLogin();
    return null;
  }

  return (
    <AuthUserContext.Provider value={auth.user}>
      <KioskShell>{children}</KioskShell>
    </AuthUserContext.Provider>
  );
}
