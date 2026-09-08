import { useEffect, useState } from "react";
import { drawingUrl, fetchDrawingObjectUrl } from "../../shared/getters";

type State =
  | { kind: "loading" }
  | { kind: "ready"; objectUrl: string }
  | { kind: "none" }
  | { kind: "error" };

/**
 * Shows the released drawing for a part revision, falling back to a placeholder when R2
 * has no drawing for it. Clicking opens the full PDF in a new tab.
 */
export function DrawingPreview({
  partNumber,
  revision,
}: {
  partNumber: string;
  revision: string;
}) {
  const [state, setState] = useState<State>({ kind: "loading" });

  useEffect(() => {
    const controller = new AbortController();
    let objectUrl: string | null = null;

    fetchDrawingObjectUrl(partNumber, revision, controller.signal)
      .then((url) => {
        if (controller.signal.aborted) {
          if (url) URL.revokeObjectURL(url);
          return;
        }
        objectUrl = url;
        setState(url ? { kind: "ready", objectUrl: url } : { kind: "none" });
      })
      .catch((err) => {
        if (err?.name === "AbortError") return;
        setState({ kind: "error" });
      });

    return () => {
      controller.abort();
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [partNumber, revision]);

  if (state.kind === "ready") {
    return (
      <div className="relative h-44 rounded-xl border border-steel/30 bg-paper overflow-hidden">
        {/* Chrome/Edge honour these viewer hints; other viewers just ignore them. */}
        <iframe
          src={`${state.objectUrl}#toolbar=0&navpanes=0&scrollbar=0&view=FitH`}
          title={`Drawing for ${partNumber} Rev ${revision}`}
          className="w-full h-full border-none pointer-events-none bg-paper"
        />
        <a
          href={drawingUrl(partNumber, revision)}
          target="_blank"
          rel="noreferrer"
          className="absolute inset-0 flex items-end justify-end p-2 bg-transparent hover:bg-ink/5 transition-colors"
        >
          <span className="text-[11px] font-semibold text-paper bg-ink/70 rounded-md px-2 py-1">
            Open drawing ↗
          </span>
        </a>
      </div>
    );
  }

  return (
    <div className="h-44 rounded-xl border border-dashed border-steel/40 bg-mist flex flex-col items-center justify-center gap-1 text-steel">
      <svg
        width="32"
        height="32"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
        aria-hidden="true"
      >
        <rect x="3" y="3" width="18" height="18" rx="2" />
        <circle cx="8.5" cy="8.5" r="1.5" />
        <path d="m21 15-5-5L5 21" />
      </svg>
      <span className="text-xs">
        {state.kind === "loading"
          ? "Loading drawing…"
          : state.kind === "error"
            ? "Drawing unavailable"
            : "No drawing for this revision"}
      </span>
    </div>
  );
}
