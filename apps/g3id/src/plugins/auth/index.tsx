import type { Plugin } from "../../shared/plugin-types";
import { EmailLoginPage } from "./email-login-page";
import { LoginPage } from "./login-page";
import { SignupPage } from "./signup-page";

export const authPlugin: Plugin = {
  name: "auth",
  routes: [
    { path: "/login", element: <LoginPage /> },
    { path: "/login/email", element: <EmailLoginPage /> },
    { path: "/signup", element: <SignupPage /> },
  ],
  navItems: [
    { label: "Log in", to: "/login", order: 1 },
    { label: "Sign up", to: "/signup", order: 2 },
  ],
};
