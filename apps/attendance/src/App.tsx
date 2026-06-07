import "./index.css";
import ConfirmPage from "./pages/ConfirmPage";
import KioskPage from "./pages/KioskPage";
import type { PageType } from "./utils/token";

// signin.attendance.* shows the SIGN IN kiosk; signout.attendance.* the SIGN OUT one.
function hostPageType(): PageType {
  return window.location.hostname.includes("signout") ? "signout" : "signin";
}

export default function App() {
  const params = new URLSearchParams(window.location.search);
  const action = params.get("action") as PageType | null;
  const w = params.get("w");

  // Member scanned the kiosk QR → confirm sign-in/out as their G3ID identity.
  if (action && w) {
    return <ConfirmPage action={action} w={w} />;
  }

  // Default: the kiosk QR display.
  return <KioskPage type={hostPageType()} />;
}
