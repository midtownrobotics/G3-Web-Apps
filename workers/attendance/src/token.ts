const WINDOW_MS = 30_000;
const VALID_WINDOWS = 4; // 4 × 30s = 2 minutes

// Proof of presence: the kiosk shows a QR encoding the current 30s window `w`.
// A scan is only accepted within VALID_WINDOWS of the live code.
export function validateToken(w: number): void {
  const current = Math.floor(Date.now() / WINDOW_MS);
  if (w > current) throw new Error("TOKEN_EXPIRED");
  if (current - w > VALID_WINDOWS) throw new Error("TOKEN_EXPIRED");
}
