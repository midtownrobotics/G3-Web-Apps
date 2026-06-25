import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { api } from "../../shared/api";
import { getErrorMessage } from "../../shared/api-error";
import type { InstanceRow } from "../../shared/derive";
import { processPath } from "../../shared/nav";
import type { ShopData } from "../../shared/use-shop-data";
import { useUserNames } from "../../shared/use-user-names";

/** Advance a revision by one for convenience (A→B, Z→AA, 1→2). */
export function advanceRevision(rev: string): string {
  const r = rev.trim();
  if (!r) return "A";
  if (/^[A-Za-z]+$/.test(r)) {
    const isUpper = r === r.toUpperCase();
    const arr = r.toUpperCase().split("");
    let i = arr.length - 1;
    while (i >= 0) {
      if (arr[i] === "Z") {
        arr[i] = "A";
        i--;
      } else {
        arr[i] = String.fromCharCode(arr[i].charCodeAt(0) + 1);
        break;
      }
    }
    if (i < 0) arr.unshift("A");
    const out = arr.join("");
    return isUpper ? out : out.toLowerCase();
  }
  if (/^\d+$/.test(r)) return String(Number(r) + 1);
  return r;
}

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
  const navigate = useNavigate();
  const [banner, setBanner] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [editingDrawing, setEditingDrawing] = useState(false);
  const [drawingDraft, setDrawingDraft] = useState(row.definition.partDrawingUrl ?? "");

  const resolveName = useUserNames([row.definition.creator]);
  const isObsolete = !!row.instance.isStale;

  const processName = (pid: number) =>
    data.processes.find((p) => p.id === pid)?.name ?? `Process #${pid}`;
  const subsystemName =
    data.subsystems.find((s) => s.id === row.definition.subsystemId)?.name ?? "—";
  const totalInstances = data.instances.filter(
    (i) => i.partDefinitionId === row.definition.id,
  ).length;

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

  async function saveDrawing(url: string | null) {
    setBusy(true);
    const res = await api["part-definitions"][":id"].$patch({
      param: { id: String(row.definition.id) },
      json: { partDrawingUrl: url },
    });
    if (!res.ok) {
      setBanner(await getErrorMessage(res as unknown as Response));
      setBusy(false);
      return;
    }
    setBanner(null);
    setEditingDrawing(false);
    await onChanged();
    setBusy(false);
  }

  async function makeObsolete() {
    if (!window.confirm("Mark this part as obsolete? It will move to the Obsolete table.")) return;
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

  /** Open the Add Part page pre-filled from this part for a process transfer. */
  function transferProcesses() {
    navigate("/parts/new", {
      state: {
        transferFrom: {
          sourceInstanceId: row.instance.id,
          onshapePartNumber: row.definition.onshapePartNumber,
          revision: advanceRevision(row.definition.revision),
          subsystemId: row.definition.subsystemId,
          name: row.definition.name,
          notes: row.definition.notes ?? "",
          isPriority: !!row.instance.isPriority,
          // Pipeline in order, flagged with whether each step was already done.
          processes: row.procs.map((p) => ({
            processId: p.processId,
            done: p.status === "done",
          })),
        },
      },
    });
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
              <span className="text-steel text-2xl">
                #{row.instance.instanceNumber} of {totalInstances}
              </span>
            </h2>
            <p className="text-sm text-steel-dark font-mono">
              {row.definition.onshapePartNumber} · Rev {row.definition.revision}
            </p>
            {isObsolete && (
              <span className="inline-block mt-1.5 text-[10px] font-semibold uppercase tracking-wider text-steel-dark bg-steel-tint border border-steel/40 rounded-full px-2 py-0.5">
                Obsolete · view only
              </span>
            )}
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
              <Meta
                label="Instance"
                value={`#${row.instance.instanceNumber} of ${totalInstances}`}
                mono
              />
              <Meta label="Subsystem" value={subsystemName} />
              <Meta label="Notes" value={row.definition.notes || "—"} />
              <dt className="text-steel">Drawing</dt>
              <dd className="text-ink">
                {isObsolete ? (
                  row.definition.partDrawingUrl ? (
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
                  )
                ) : editingDrawing ? (
                  <div className="space-y-2">
                    <input
                      type="text"
                      value={drawingDraft}
                      onChange={(e) => setDrawingDraft(e.target.value)}
                      placeholder="https://…"
                      className="w-full bg-paper border border-steel/40 rounded-lg px-2.5 py-1.5 text-sm text-ink placeholder-steel focus:outline-none focus:border-crimson"
                    />
                    <div className="flex gap-2">
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => saveDrawing(drawingDraft.trim() || null)}
                        className="text-xs px-3 py-1.5 bg-crimson hover:bg-crimson-dark text-paper rounded-lg font-semibold transition-colors disabled:opacity-50"
                      >
                        Save
                      </button>
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => {
                          setEditingDrawing(false);
                          setDrawingDraft(row.definition.partDrawingUrl ?? "");
                        }}
                        className="text-xs px-3 py-1.5 bg-steel-tint hover:bg-steel/30 text-steel-dark rounded-lg font-medium transition-colors"
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                ) : row.definition.partDrawingUrl ? (
                  <span className="inline-flex items-center gap-3">
                    <a
                      href={row.definition.partDrawingUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="text-crimson hover:text-crimson-dark underline"
                    >
                      View drawing ↗
                    </a>
                    <button
                      type="button"
                      onClick={() => setEditingDrawing(true)}
                      className="text-xs text-steel hover:text-ink underline"
                    >
                      Edit
                    </button>
                  </span>
                ) : (
                  <button
                    type="button"
                    onClick={() => setEditingDrawing(true)}
                    className="text-crimson hover:text-crimson-dark underline"
                  >
                    + Link a drawing
                  </button>
                )}
              </dd>
              <Meta
                label="Created"
                value={new Date(row.definition.createdAt).toLocaleDateString()}
              />
              <Meta label="Created By" value={resolveName(row.definition.creator)} />
              <dt className="text-steel">Priority</dt>
              <dd>
                <label className="inline-flex items-center gap-2 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={!!row.instance.isPriority}
                    disabled={busy || isObsolete}
                    onChange={(e) => setPriority(e.target.checked)}
                    className="accent-crimson w-4 h-4 disabled:opacity-50"
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
                      <Link
                        to={processPath(proc.processId)}
                        title={`Go to ${processName(proc.processId)} on the shop floor`}
                        className={`text-xs font-semibold px-2.5 py-1 rounded-full border transition-colors hover:border-crimson ${
                          isCurrent
                            ? "bg-crimson border-crimson text-paper hover:bg-crimson-dark"
                            : isDone
                              ? "bg-mist border-steel/30 text-steel/70 line-through"
                              : "bg-paper border-steel/50 text-ink"
                        }`}
                      >
                        {processName(proc.processId)}
                      </Link>
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
            {row.current && row.state === "doing" && (
              <p className="text-xs text-steel-dark mt-2">
                Currently in progress at{" "}
                <Link
                  to={processPath(row.current.processId)}
                  className="font-semibold text-ink hover:text-crimson underline transition-colors"
                >
                  {processName(row.current.processId)}
                </Link>
                .
              </p>
            )}
          </Section>

          <div className={`grid grid-cols-1 gap-2 ${isObsolete ? "" : "sm:grid-cols-2"}`}>
            <button
              type="button"
              onClick={transferProcesses}
              disabled={busy}
              className="w-full py-2.5 rounded-lg border border-steel/50 text-steel-dark hover:bg-steel-tint text-sm font-semibold transition-colors disabled:opacity-50"
            >
              Transfer Processes
            </button>
            {/* An already-obsolete part can't be made obsolete again — only transferred. */}
            {!isObsolete && (
              <button
                type="button"
                onClick={makeObsolete}
                disabled={busy}
                className="w-full py-2.5 rounded-lg border border-crimson/50 text-crimson hover:bg-crimson-tint text-sm font-semibold transition-colors disabled:opacity-50"
              >
                Make Obsolete
              </button>
            )}
          </div>
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
