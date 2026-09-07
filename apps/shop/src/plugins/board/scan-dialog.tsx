import { useEffect, useRef, useState } from "react";
import { type InstanceRow, matchScannedDrawing, partLabel } from "../../shared/derive";

type Props = {
  /** Rows in the queue currently on screen. */
  queue: InstanceRow[];
  /** Every live row, so a part sitting in another queue can be named rather than denied. */
  all: InstanceRow[];
  onFound: (row: InstanceRow) => void;
  onClose: () => void;
};

/**
 * Kiosk scan prompt. The handheld scanner is a keyboard wedge: it types the barcode into the
 * focused field and presses Enter, so a focused input is all that is needed to "wait for" a
 * scan. The field stays focused while the dialog is open in case the tablet moves focus.
 */
export function ScanDialog({ queue, all, onFound, onClose }: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [value, setValue] = useState("");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    inputRef.current?.focus();
    const id = setInterval(() => {
      if (document.activeElement !== inputRef.current) inputRef.current?.focus();
    }, 500);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  function submit(scanned: string) {
    const trimmed = scanned.trim();
    if (!trimmed) return;

    const result = matchScannedDrawing(trimmed, queue, all);
    if (result.kind === "found") {
      onFound(result.row);
      return;
    }

    setValue("");
    if (result.kind === "not-in-queue") {
      setError(
        `${partLabel(result.row)} is not in this queue — it is at ${
          result.row.current ? "another process" : "no process"
        }. Scan a part from this station's list.`,
      );
    } else {
      setError(`No part matches "${trimmed}". Check the drawing is the current revision.`);
    }
  }

  return (
    <div className="fixed inset-0 z-[70] bg-ink/70 flex items-center justify-center p-6">
      <div className="bg-paper rounded-2xl shadow-xl max-w-lg w-full p-8 space-y-5">
        <div className="flex items-start justify-between gap-4">
          <h2 className="font-display text-3xl text-ink">Scan a drawing</h2>
          <button
            type="button"
            onClick={onClose}
            className="text-3xl leading-none text-steel hover:text-ink transition-colors"
            aria-label="Close"
          >
            ✕
          </button>
        </div>

        <p className="text-steel-dark">
          Point the scanner at the barcode in the bottom-left corner of the drawing.
        </p>

        <form
          onSubmit={(e) => {
            e.preventDefault();
            submit(value);
          }}
        >
          <input
            ref={inputRef}
            value={value}
            onChange={(e) => {
              setValue(e.target.value);
              if (error) setError(null);
            }}
            placeholder="Waiting for scan…"
            aria-label="Scanned barcode"
            className="w-full bg-mist border-2 border-dashed border-steel/40 rounded-xl px-4 py-5 text-2xl font-mono text-center text-ink placeholder-steel/70 focus:outline-none focus:border-crimson focus:bg-paper transition-colors"
          />
        </form>

        {error ? (
          <p className="text-sm text-crimson-dark bg-crimson-tint border border-crimson/30 rounded-lg px-4 py-3">
            {error}
          </p>
        ) : (
          <p className="text-sm text-steel">
            Or type the number under the barcode and press Enter.
          </p>
        )}
      </div>
    </div>
  );
}
