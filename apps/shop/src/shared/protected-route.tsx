import type { ReactNode } from "react";
import { redirectToLogin } from "./api-error";
import { PageLoading } from "./ui";
import { useAuth } from "./use-auth";

export function ProtectedRoute({ children }: { children: ReactNode }) {
  const auth = useAuth();

  if (auth.status === "loading") return <PageLoading />;

  if (auth.status === "unauthenticated") {
    redirectToLogin();
    return null;
  }

  return <>{children}</>;
}
