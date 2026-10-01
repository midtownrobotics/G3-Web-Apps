import { useEffect, useState } from "react";
import { api } from "./api";

type Status =
  | { kind: "idle" }
  | { kind: "sending" }
  | { kind: "sent" }
  | { kind: "error"; message: string };

/**
 * Prints a part revision's drawing on the shop printer (one-sided, black and
 * white). The shop worker sends the PDF from storage straight to the edge
 * box, so nothing is downloaded to this device.
 */
export function PrintDrawingButton({
  partNumber,
  revision,
  size = "small",
}: {
  partNumber: string;
  revision: string;
  /** "kiosk": full-width touch button; "small": inline link-sized button. */
  size?: "kiosk" | "small";
}) {
  const [status, setStatus] = useState<Status>({ kind: "idle" });

  // Let "Sent" fade back to the normal label so it can be pressed again.
  useEffect(() => {
    if (status.kind !== "sent") return;
    const t = setTimeout(() => setStatus({ kind: "idle" }), 4000);
    return () => clearTimeout(t);
  }, [status]);

  async function print() {
    setStatus({ kind: "sending" });
    try {
      const res = await api.print.drawing[":partNumber"][":revision"].$post({
        param: { partNumber, revision },
      });
      const data = (await res.json()) as { ok: boolean; error?: string };
      setStatus(
        data.ok ? { kind: "sent" } : { kind: "error", message: data.error ?? "Print failed." },
      );
    } catch {
      setStatus({ kind: "error", message: "Couldn't reach the print service." });
    }
  }

  const label =
    status.kind === "sending"
      ? "Sending…"
      : status.kind === "sent"
        ? "Sent to printer ✓"
        : "Print Drawing";

  if (size === "kiosk") {
    return (
      <div className="space-y-2">
        <button
          type="button"
          onClick={print}
          disabled={status.kind === "sending"}
          className={`w-full px-6 py-4 text-lg font-semibold rounded-lg border transition-colors disabled:opacity-50 ${
            status.kind === "sent"
              ? "text-emerald-700 bg-emerald-50 border-emerald-200"
              : "text-steel-dark bg-steel-tint border-steel/30 hover:bg-steel/20 hover:border-steel/50 active:bg-steel/30"
          }`}
        >
          {label}
        </button>
        {status.kind === "error" && <p className="text-sm text-crimson-dark">{status.message}</p>}
      </div>
    );
  }

  return (
    <span className="inline-flex flex-wrap items-center gap-2">
      <button
        type="button"
        onClick={print}
        disabled={status.kind === "sending"}
        className={`text-xs font-medium underline disabled:opacity-50 ${
          status.kind === "sent" ? "text-emerald-700" : "text-crimson hover:text-crimson-dark"
        }`}
      >
        {label}
      </button>
      {status.kind === "error" && (
        <span className="text-xs text-crimson-dark">{status.message}</span>
      )}
    </span>
  );
}
