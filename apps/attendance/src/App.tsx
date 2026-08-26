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
function KioskGate({ type }: { type: PageType }) {
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
    return <KioskPage types={[type]} />;
  }

  return (
    <div className={`kiosk kiosk--${type}`}>
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
    const primaryType = hostPageType();
    const columns =
      primaryType === "signin"
        ? "minmax(0, 2.4fr) minmax(0, 1fr)"
        : "minmax(0, 1fr) minmax(0, 2.4fr)";

    return (
      <main
        style={{ display: "grid", gridTemplateColumns: columns, width: "100%", height: "100dvh" }}
      >
        <iframe
          title="G3 Attendance Sign In"
          src="https://signin.attendance.g3robotics.com/"
          style={{ width: "100%", height: "100%", border: 0, display: "block" }}
        />
        <iframe
          title="G3 Attendance Sign Out"
          src="https://signout.attendance.g3robotics.com/"
          style={{ width: "100%", height: "100%", border: 0, display: "block" }}
        />
      </main>
    );
  }

  // Member scanned the kiosk QR → confirm sign-in/out as their G3ID identity.
  if (action && w) {
    return <ConfirmPage action={action} w={w} />;
  }

  // Default: the (admin-gated) kiosk QR display.
  return <KioskGate type={hostPageType()} />;
}
