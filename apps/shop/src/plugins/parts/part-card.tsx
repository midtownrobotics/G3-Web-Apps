import { useState } from "react";
import { api } from "../../shared/api";
import { getErrorMessage } from "../../shared/api-error";
import type { InstanceRow } from "../../shared/derive";
import type { ShopData } from "../../shared/use-shop-data";

export function PartCard({
  row,
  data,
  onClose,
  onChanged,
}: {
  row: InstanceRow;
  data: ShopData;
  onClose: () => void;
  onChanged: () => Promise<void>;
}) {
  const [banner, setBanner] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const processName = (pid: number) =>
    data.processes.find((p) => p.id === pid)?.name ?? `Process #${pid}`;
  const subsystemName =
    data.subsystems.find((s) => s.id === row.definition.subsystemId)?.name ?? "—";

  async function setPriority(next: boolean) {
    setBusy(true);
    const res = await api["part-instances"][":id"].$patch({
      param: { id: String(row.instance.id) },
      json: { isPriority: next },
    });
    if (!res.ok) setBanner(await getErrorMessage(res as unknown as Response));
    else {
      setBanner(null);
      await onChanged();
    }
    setBusy(false);
  }

  async function makeStale() {
    if (!window.confirm("Mark this part as stale? It will disappear from the parts table.")) return;
    setBusy(true);
    const res = await api["part-instances"][":id"].$patch({
      param: { id: String(row.instance.id) },
      json: { isStale: true },
    });
    if (!res.ok) {
      setBanner(await getErrorMessage(res as unknown as Response));
      setBusy(false);
      return;
    }
    await onChanged();
    onClose();
  }

  return (
    // biome-ignore lint/a11y/useKeyWithClickEvents: backdrop click-to-close convenience; the close button is the accessible control
    <div
      className="fixed inset-0 z-50 bg-ink/50 flex items-center justify-center p-4"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="bg-paper rounded-2xl shadow-xl max-w-lg w-full max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="flex items-start justify-between gap-3 px-5 pt-5">
          <div className="min-w-0">
            <h2 className="font-display text-3xl text-ink truncate">
              {row.definition.name}{" "}
              <span className="text-steel text-2xl">#{row.instance.instanceNumber}</span>
            </h2>
            <p className="text-sm text-steel-dark font-mono">
              {row.definition.onshapePartNumber} · Rev {row.definition.revision}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="text-steel hover:text-ink text-xl leading-none p-1 shrink-0"
          >
            ✕
          </button>
        </div>

        <div className="px-5 pb-5 pt-4 space-y-4">
          {banner && (
            <p className="text-crimson-dark text-sm bg-crimson-tint border border-crimson/30 rounded-lg px-3 py-2">
              {banner}
            </p>
          )}

          {/* Picture placeholder */}
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
            <span className="text-xs">Photo coming soon</span>
          </div>

          {/* Information */}
          <Section title="Information">
            <dl className="grid grid-cols-[8rem_1fr] gap-y-2 text-sm">
              <Meta label="Name" value={row.definition.name} />
              <Meta label="Part Number" value={row.definition.onshapePartNumber} mono />
              <Meta label="Revision" value={row.definition.revision} mono />
              <Meta label="Instance" value={`#${row.instance.instanceNumber}`} mono />
              <Meta label="Subsystem" value={subsystemName} />
              <Meta label="Notes" value={row.definition.notes || "—"} />
              <dt className="text-steel">Drawing</dt>
              <dd className="text-ink">
                {row.definition.partDrawingUrl ? (
                  <a
                    href={row.definition.partDrawingUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="text-crimson hover:text-crimson-dark underline"
                  >
                    View drawing ↗
                  </a>
                ) : (
                  "—"
                )}
              </dd>
              <Meta
                label="Created"
                value={new Date(row.definition.createdAt).toLocaleDateString()}
              />
              <Meta label="Created By" value={row.definition.creator} />
              <dt className="text-steel">Priority</dt>
              <dd>
                <label className="inline-flex items-center gap-2 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={!!row.instance.isPriority}
                    disabled={busy}
                    onChange={(e) => setPriority(e.target.checked)}
                    className="accent-crimson w-4 h-4"
                  />
                  <span className="text-ink">
                    {row.instance.isPriority ? "Priority part" : "Standard"}
                  </span>
                </label>
              </dd>
            </dl>
          </Section>

          {/* Status */}
          <Section title="Status">
            {row.procs.length === 0 ? (
              <p className="text-sm text-steel">
                No processes — the blueprint was empty when this instance was made.
              </p>
            ) : (
              <div className="flex items-center flex-wrap gap-y-2">
                {row.procs.map((proc, i) => {
                  const isDone = proc.status === "done";
                  const isCurrent = row.current?.id === proc.id;
                  return (
                    <div key={proc.id} className="flex items-center">
                      {i > 0 && <span className="w-4 h-px bg-steel/40 mx-1" />}
                      <span
                        title={
                          isDone ? "Completed" : isCurrent ? "Current process" : "Still to come"
                        }
                        className={`text-xs font-semibold px-2.5 py-1 rounded-full border ${
                          isCurrent
                            ? "bg-crimson border-crimson text-paper"
                            : isDone
                              ? "bg-mist border-steel/30 text-steel/70 line-through"
                              : "bg-paper border-steel/50 text-ink"
                        }`}
                      >
                        {processName(proc.processId)}
                      </span>
                    </div>
                  );
                })}
                {row.state === "complete" && (
                  <span className="ml-2 text-xs font-semibold px-2.5 py-1 rounded-full border bg-emerald-50 border-emerald-300 text-emerald-700">
                    Complete
                  </span>
                )}
              </div>
            )}
            {row.current && (
              <p className="text-xs text-steel-dark mt-2">
                Currently {row.state === "doing" ? "in progress" : "queued"} at{" "}
                <span className="font-semibold text-ink">{processName(row.current.processId)}</span>
                .
              </p>
            )}
          </Section>

          <button
            type="button"
            onClick={makeStale}
            disabled={busy}
            className="w-full py-2.5 rounded-lg border border-crimson/50 text-crimson hover:bg-crimson-tint text-sm font-semibold transition-colors disabled:opacity-50"
          >
            Make Stale
          </button>
        </div>
      </div>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  const [open, setOpen] = useState(true);
  return (
    <section className="border border-steel/25 rounded-xl">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="w-full flex items-center justify-between px-4 py-2.5 text-left"
      >
        <span className="text-sm font-bold uppercase tracking-wider text-steel-dark">{title}</span>
        <span className={`text-steel text-xs transition-transform ${open ? "rotate-180" : ""}`}>
          ▼
        </span>
      </button>
      {open && <div className="px-4 pb-4">{children}</div>}
    </section>
  );
}

function Meta({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <>
      <dt className="text-steel">{label}</dt>
      <dd className={`text-ink break-words ${mono ? "font-mono" : ""}`}>{value}</dd>
    </>
  );
}
