import { apiBase, loginUrl } from "@g3/config/client";
export const API = apiBase("attendance");

export type Me = {
  id: string;
  displayName: string;
  email: string;
  isAdmin: boolean;
};

// Send the browser to the G3ID login page, returning here afterward.
export function redirectToLogin(): void {
  window.location.href = loginUrl();
}
