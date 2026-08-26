import { useEffect, useState } from "react";
import "./index.css";
import ConfirmPage from "./pages/ConfirmPage";
import KioskPage from "./pages/KioskPage";
import { API, type Me, redirectToLogin } from "./utils/auth";
import type { PageType } from "./utils/token";

// signin.attendance.* shows the SIGN IN kiosk; signout.attendance.* the SIGN OUT one.
function hostPageType(): PageType {
  return window.location.hostname.includes("signout") ? "signout" : "signin";
}

// The kiosk display (QR + live code) is admin-only. Members never need it — they
// just scan it. Non-admins are redirected to G3ID; logged-in non-admins are denied.
function KioskGate({ types }: { types: PageType[] }) {
  const [state, setState] = useState<"loading" | "ok" | "denied">("loading");

  useEffect(() => {
    (async () => {
      try {
        const r = await fetch(`${API}/me`, { credentials: "include" });
        if (r.status === 401) {
          redirectToLogin();
          return;
        }
        if (!r.ok) {
          setState("denied");
          return;
        }
        const me = (await r.json()) as Me;
        setState(me.isAdmin ? "ok" : "denied");
      } catch {
        setState("denied");
      }
    })();
  }, []);

  if (state === "ok") {
    return <KioskPage types={types} />;
  }

  return (
    <div className={`kiosk ${types.length > 1 ? "kiosk--combined" : `kiosk--${types[0]}`}`}>
      <div className="scanlines" aria-hidden="true" />
      <div className="kiosk__content kiosk-gate">
        {state === "loading" ? (
          <p className="kiosk-gate__text">AUTHORIZING…</p>
        ) : (
          <>
            <p className="kiosk-gate__title">ADMIN ACCESS REQUIRED</p>
            <p className="kiosk-gate__text">
              Sign in with an admin G3ID account to run this kiosk.
            </p>
          </>
        )}
      </div>
    </div>
  );
}

export default function App() {
  const params = new URLSearchParams(window.location.search);
  const action = params.get("action") as PageType | null;
  const w = params.get("w");

  // Fixed side-by-side kiosk view available on both attendance sites.
  if (window.location.pathname === "/display") {
    return <KioskGate types={["signin", "signout"]} />;
  }

  // Member scanned the kiosk QR → confirm sign-in/out as their G3ID identity.
  if (action && w) {
    return <ConfirmPage action={action} w={w} />;
  }

  // Default: the (admin-gated) kiosk QR display.
  return <KioskGate types={[hostPageType()]} />;
}
