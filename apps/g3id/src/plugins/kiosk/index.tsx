import type { Plugin } from "../../shared/plugin-types";
import { KioskActivatePage } from "./kiosk-activate-page";
import { KioskLoginPage } from "./kiosk-login-page";

export const kioskPlugin: Plugin = {
  name: "kiosk",
  routes: [
    { path: "/kiosk/activate", element: <KioskActivatePage /> },
    { path: "/kiosk/login", element: <KioskLoginPage /> },
  ],
};
