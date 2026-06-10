import { QRCodeSVG } from "qrcode.react";
import { useCallback, useEffect, useState } from "react";
import { API } from "../utils/auth";
import { type PageType, WINDOW_MS, msUntilNextWindow } from "../utils/token";
import "./KioskPage.css";

interface Props {
  type: PageType;
}

// The live code comes from the admin-protected /code route, not the client clock.
async function fetchCode(): Promise<number | null> {
  try {
    const r = await fetch(`${API}/code`, { credentials: "include" });
    if (!r.ok) return null;
    const data = (await r.json()) as { w?: number };
    return typeof data.w === "number" ? data.w : null;
  } catch {
    return null;
  }
}

export default function KioskPage({ type }: Props) {
  const isSignIn = type === "signin";
  const label = isSignIn ? "SIGN IN" : "SIGN OUT";

  const [qrValue, setQrValue] = useState<string | null>(null);
  const [secondsLeft, setSecondsLeft] = useState(Math.ceil(msUntilNextWindow() / 1000));
  const [refreshKey, setRefreshKey] = useState(0);

  const refreshToken = useCallback(async () => {
    const w = await fetchCode();
    if (w != null) {
      setQrValue(`${window.location.origin}/?action=${type}&w=${w}`);
      setRefreshKey((k) => k + 1);
    }
  }, [type]);

  // Initial code
  useEffect(() => {
    refreshToken();
  }, [refreshToken]);

  // Align refresh to exact window boundary, then repeat every 30s
  useEffect(() => {
    let interval: ReturnType<typeof setInterval>;
    const timeout = setTimeout(() => {
      refreshToken();
      interval = setInterval(refreshToken, WINDOW_MS);
    }, msUntilNextWindow());
    return () => {
      clearTimeout(timeout);
      clearInterval(interval);
    };
  }, [refreshToken]);

  useEffect(() => {
    const tick = setInterval(() => setSecondsLeft(Math.ceil(msUntilNextWindow() / 1000)), 500);
    return () => clearInterval(tick);
  }, []);

  const progress = 1 - msUntilNextWindow() / WINDOW_MS;
  const R = 148;
  const circ = 2 * Math.PI * R;

  return (
    <div className={`kiosk kiosk--${type}`}>
      <div className="scanlines" aria-hidden="true" />
      <div className="kiosk__content">
        <h1 className="kiosk__label">{label}</h1>

        <div className="kiosk__qr-wrapper">
          <svg className="kiosk__ring" viewBox="0 0 320 320" aria-hidden="true">
            <circle className="ring-track" cx="160" cy="160" r={R} fill="none" strokeWidth="3" />
            <circle
              className="ring-progress"
              cx="160"
              cy="160"
              r={R}
              fill="none"
              strokeWidth="3"
              strokeDasharray={circ}
              strokeDashoffset={circ * (1 - progress)}
              strokeLinecap="round"
              transform="rotate(-90 160 160)"
            />
          </svg>

          <div className="kiosk__qr-frame" key={refreshKey}>
            {qrValue ? (
              <QRCodeSVG
                value={qrValue}
                size={220}
                bgColor="transparent"
                fgColor={isSignIn ? "#00ff88" : "#ff3344"}
                level="M"
              />
            ) : (
              <div className="kiosk__qr-loading">…</div>
            )}
          </div>
        </div>

        <div className="kiosk__timer">
          <span className="kiosk__timer-label">NEW CODE IN</span>
          <span className="kiosk__timer-seconds">{secondsLeft}s</span>
        </div>
      </div>
    </div>
  );
}
