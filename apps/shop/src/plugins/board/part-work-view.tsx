import * as pdfjs from "pdfjs-dist";
import workerUrl from "pdfjs-dist/build/pdf.worker.min.mjs?url";
import { useEffect, useRef, useState } from "react";

import { api } from "../../shared/api";
import { getErrorMessage } from "../../shared/api-error";
import type { InstanceRow } from "../../shared/derive";
import type { ShopData } from "../../shared/use-shop-data";

pdfjs.GlobalWorkerOptions.workerSrc = workerUrl;

type PDFState =
  | { kind: "loading" }
  | { kind: "rendering" }
  | { kind: "ready" }
  | { kind: "none" }
  | { kind: "error" };

function PDFViewer({ url }: { url: string }) {
  const [state, setState] = useState<PDFState>({ kind: "loading" });
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const controller = new AbortController();
    let cancelled = false;
    let doc: pdfjs.PDFDocumentProxy | null = null;
    let task: pdfjs.RenderTask | null = null;
    const timeout = setTimeout(() => {
      cancelled = true;
      setState({ kind: "error" });
    }, 30000);

    Promise.resolve()
      .then(async () => {
        if (controller.signal.aborted || cancelled || !url) {
          return;
        }

        setState({ kind: "rendering" });

        try {
          doc = await pdfjs.getDocument({ url }).promise;
          if (cancelled) return;

          const page = await doc.getPage(1);
          if (cancelled) return;

          const canvas = canvasRef.current;
          if (!canvas) {
            return;
          }

          const dpr = window.devicePixelRatio || 1;
          const width = canvasRef.current?.parentElement?.clientWidth || 600;
          const scale = width / page.getViewport({ scale: 1 }).width;
          const viewport = page.getViewport({ scale: scale * dpr });

          canvas.width = viewport.width;
          canvas.height = viewport.height;
          canvas.style.width = `${width}px`;
          canvas.style.height = `${viewport.height / dpr}px`;

          const ctx = canvas.getContext("2d");
          if (!ctx) {
            setState({ kind: "error" });
            return;
          }

          task = page.render({
            canvasContext: ctx,
            viewport,
            canvas,
          });

          await task.promise.catch(() => {});
          setState({ kind: "ready" });
          clearTimeout(timeout);
        } catch (err) {
          if (err instanceof Error && err.name === "AbortError") return;
          setState({ kind: "error" });
        }
      })
      .catch(() => {
        setState({ kind: "error" });
      });

    return () => {
      cancelled = true;
      controller.abort();
      task?.cancel();
      clearTimeout(timeout);
    };
  }, [url]);

  if (state.kind === "ready" || state.kind === "rendering") {
    return <canvas ref={canvasRef} className="max-w-full max-h-full object-contain" />;
  }

  if (state.kind === "error") {
    return (
      <div className="w-full h-full flex items-center justify-center bg-white">
        <p className="text-steel text-center">Drawing unavailable</p>
      </div>
    );
  }

  return (
    <div className="w-full h-full flex items-center justify-center bg-white">
      <p className="text-steel text-center">Loading drawing…</p>
    </div>
  );
}

export function PartWorkView({
  row,
  data,
  onClose,
  onMarkComplete,
  onChanged,
}: {
  row: InstanceRow;
  data: ShopData;
  onClose: () => void;
  onMarkComplete: () => Promise<void>;
  onChanged?: () => Promise<void>;
}) {
  const [busy, setBusy] = useState(false);
  const [banner, setBanner] = useState<string | null>(null);
  const [showRevertModal, setShowRevertModal] = useState(false);
  const [revertStatus, setRevertStatus] = useState<"todo" | "doing">("todo");
  const subsystem = data.subsystems.find((s) => s.id === row.definition.subsystemId);
  const currentProcess = row.current;

  async function handleRevert() {
    if (!currentProcess) return;
    setBusy(true);
    const res = await api["part-instance-processes"][":partInstanceId"].processes[
      ":processId"
    ].$patch({
      param: {
        partInstanceId: String(row.instance.id),
        processId: String(currentProcess.processId),
      },
      json: { status: revertStatus },
    });
    if (!res.ok) {
      setBanner(await getErrorMessage(res as unknown as Response));
      setBusy(false);
      return;
    }
    setBanner(null);
    setShowRevertModal(false);
    await onChanged?.();
    setBusy(false);
  }

  return (
    <div className="fixed inset-0 bg-paper z-50 flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between px-6 py-5 border-b border-steel/30">
        <h1 className="font-display text-3xl text-ink">
          {row.definition.name}
          <span className="text-steel font-normal ml-2">#{row.instance.instanceNumber}</span>
        </h1>
        <button
          type="button"
          onClick={onClose}
          className="text-3xl text-steel hover:text-ink transition-colors"
        >
          ✕
        </button>
      </div>

      {/* Error banner */}
      {banner && (
        <div className="px-6 py-3 bg-crimson-tint border-b border-crimson/30">
          <p className="text-sm text-crimson-dark">{banner}</p>
        </div>
      )}

      {/* Main content */}
      <div className="flex-1 flex overflow-hidden">
        {/* Drawing PDF - 3/4 width */}
        <div className="flex-1 border-r border-steel/30 bg-white">
          {row.definition.partDrawingUrl ? (
            <PDFViewer url={row.definition.partDrawingUrl} />
          ) : (
            <div className="w-full h-full flex items-center justify-center bg-mist">
              <p className="text-steel text-center">No drawing available</p>
            </div>
          )}
        </div>

        {/* Part info - 1/4 width */}
        <div className="w-1/4 flex flex-col p-6 overflow-y-auto">
          <div className="space-y-5 flex-1">
            <div>
              <p className="text-sm font-semibold text-steel mb-2">Name</p>
              <p className="text-base text-ink">{row.definition.name || "—"}</p>
            </div>

            <div>
              <p className="text-sm font-semibold text-steel mb-2">Part Number</p>
              <p className="text-base font-mono text-ink">{row.definition.onshapePartNumber}</p>
            </div>

            <div>
              <p className="text-sm font-semibold text-steel mb-2">Revision</p>
              <p className="text-base text-ink">{row.definition.revision || "—"}</p>
            </div>

            <div>
              <p className="text-sm font-semibold text-steel mb-2">Instance</p>
              <p className="text-base text-ink">#{row.instance.instanceNumber}</p>
            </div>

            <div>
              <p className="text-sm font-semibold text-steel mb-2">Subsystem</p>
              <p className="text-base text-ink">{subsystem?.name || "—"}</p>
            </div>

            {row.definition.notes && (
              <div>
                <p className="text-sm font-semibold text-steel mb-2">Notes</p>
                <p className="text-base text-ink whitespace-pre-wrap">{row.definition.notes}</p>
              </div>
            )}

            {row.instance.isPriority ? (
              <div className="pt-2">
                <span className="inline-block text-xs font-semibold px-2.5 py-1 bg-amber-50 text-amber-700 border border-amber-200 rounded">
                  Priority
                </span>
              </div>
            ) : null}
          </div>

          {/* Buttons */}
          <div className="space-y-3 pt-6 border-t border-steel/30 mt-6">
            <button
              type="button"
              onClick={onClose}
              className="w-full px-6 py-4 text-lg font-semibold text-steel bg-steel-tint border border-steel/30 hover:border-steel/50 hover:text-ink rounded-lg transition-colors"
            >
              Exit
            </button>
            {currentProcess && row.state !== "complete" && (
              <button
                type="button"
                onClick={() => {
                  setRevertStatus(row.state === "doing" ? "todo" : "doing");
                  setShowRevertModal(true);
                }}
                disabled={busy}
                className="w-full px-6 py-4 text-lg font-semibold text-amber-700 bg-amber-50 border border-amber-200 hover:bg-amber-100 rounded-lg transition-colors disabled:opacity-50"
              >
                ↶ Send Back
              </button>
            )}
            <button
              type="button"
              onClick={onMarkComplete}
              disabled={busy}
              className="w-full px-6 py-4 text-lg font-semibold text-paper bg-emerald-600 hover:bg-emerald-700 rounded-lg transition-colors disabled:opacity-50"
            >
              Mark Complete
            </button>
          </div>

          {/* Revert Modal */}
          {showRevertModal && (
            <div className="fixed inset-0 z-[60] bg-black/40 flex items-center justify-center p-4">
              <div className="bg-paper rounded-lg shadow-lg max-w-sm w-full p-6 space-y-4">
                <h3 className="text-lg font-bold text-ink">Send Back</h3>
                <p className="text-sm text-steel">Move this part back to which status?</p>

                <div className="space-y-2">
                  {(["todo", "doing"] as const).map((s) => (
                    <label key={s} className="flex items-center gap-2 cursor-pointer">
                      <input
                        type="radio"
                        name="revert-status"
                        value={s}
                        checked={revertStatus === s}
                        onChange={() => setRevertStatus(s)}
                        className="accent-amber-500"
                      />
                      <span className="text-sm text-ink capitalize">{s}</span>
                    </label>
                  ))}
                </div>

                <div className="flex gap-2 pt-2">
                  <button
                    type="button"
                    onClick={() => setShowRevertModal(false)}
                    disabled={busy}
                    className="flex-1 py-2 rounded-lg border border-steel/50 text-steel-dark hover:bg-steel-tint text-sm font-semibold transition-colors disabled:opacity-50"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    onClick={() => handleRevert()}
                    disabled={busy}
                    className="flex-1 py-2 rounded-lg bg-amber-500 hover:bg-amber-600 text-white text-sm font-semibold transition-colors disabled:opacity-50"
                  >
                    Send Back
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
