import { QRCodeSVG } from "qrcode.react";
import { useCallback, useEffect, useState } from "react";
import { API } from "../utils/auth";
import { type PageType, WINDOW_MS, msUntilNextWindow } from "../utils/token";
import "./KioskPage.css";

interface Props {
  types: PageType[];
}

async function fetchCode(): Promise<number | null> {
  try {
    const response = await fetch(`${API}/code`, { credentials: "include" });
    if (!response.ok) return null;
    const data = (await response.json()) as { w?: number };
    return typeof data.w === "number" ? data.w : null;
  } catch {
    return null;
  }
}

export default function KioskPage({ types }: Props) {
  const isCombined = types.length > 1;
  const [code, setCode] = useState<number | null>(null);
  const [secondsLeft, setSecondsLeft] = useState(Math.ceil(msUntilNextWindow() / 1000));
  const [refreshKey, setRefreshKey] = useState(0);

  const refreshToken = useCallback(async () => {
    const nextCode = await fetchCode();
    if (nextCode != null) {
      setCode(nextCode);
      setRefreshKey((key) => key + 1);
    }
  }, []);

  useEffect(() => {
    refreshToken();
  }, [refreshToken]);

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

  return (
    <div className={`kiosk ${isCombined ? "kiosk--combined" : `kiosk--${types[0]}`}`}>
      <div className="scanlines" aria-hidden="true" />
      <div className="kiosk__content">
        <div className={`kiosk__codes ${isCombined ? "kiosk__codes--combined" : ""}`}>
          {types.map((type) => {
            const isSignIn = type === "signin";
            return (
              <section className={`kiosk__code kiosk__code--${type}`} key={type}>
                <h2 className="kiosk__label">{isSignIn ? "SIGN IN" : "SIGN OUT"}</h2>
                <div className="kiosk__qr-wrapper">
                  <div className="kiosk__qr-frame" key={`${type}-${refreshKey}`}>
                    {code != null ? (
                      <QRCodeSVG
                        className="kiosk__qr-code"
                        value={`${window.location.origin}/?action=${type}&w=${code}`}
                        size={460}
                        bgColor="transparent"
                        fgColor={isSignIn ? "#00ff88" : "#ff3344"}
                        level="M"
                      />
                    ) : (
                      <div className="kiosk__qr-loading">…</div>
                    )}
                  </div>
                </div>
              </section>
            );
          })}
        </div>

        <div className="kiosk__timer">
          <span className="kiosk__timer-label">NEW CODE IN</span>
          <span className="kiosk__timer-seconds">{secondsLeft}s</span>
        </div>
      </div>
    </div>
  );
}
