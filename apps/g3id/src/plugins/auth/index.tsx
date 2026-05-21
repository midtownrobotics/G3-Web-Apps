import type { Plugin } from "../../shared/plugin-types";
import { DashboardPage } from "./dashboard-page";
import { EmailLoginPage } from "./email-login-page";
import { EmailSignupPage } from "./email-signup-page";
import { LoginPage } from "./login-page";
import { OAuthErrorPage } from "./oauth-error-page";
import { PendingPage } from "./pending-page";
import { SignupPage } from "./signup-page";
import { SlackLoginPage } from "./slack-login-page";

export const authPlugin: Plugin = {
  name: "auth",
  routes: [
    { path: "/login", element: <LoginPage /> },
    { path: "/login/email", element: <EmailLoginPage /> },
    { path: "/login/error", element: <OAuthErrorPage /> },
    { path: "/login/slack", element: <SlackLoginPage /> },
    { path: "/signup", element: <SignupPage /> },
    { path: "/signup/email", element: <EmailSignupPage /> },
    { path: "/signup/pending", element: <PendingPage /> },
    { path: "/dashboard", element: <DashboardPage /> },
  ],
  navItems: [
    { label: "Dash", to: "/dashboard", order: 0 },
    { label: "Log in", to: "/login", order: 1 },
    { label: "Sign up", to: "/signup", order: 2 },
  ],
};
