import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../../shared/api";
import { getErrorMessage } from "../../shared/api-error";
import type { Process, Subsystem } from "../../shared/types";
import { ErrorBanner, PageLoading } from "../../shared/ui";
import { useShopData } from "../../shared/use-shop-data";
import { useTouchDevice } from "../../shared/use-touch";

type PendingPart = {
  id: number;
  partNumber: string;
  entityId: string | null;
  partDrawingEntityId: string | null;
  versionId: string | null;
  quantity: number | null;
  onshapeReleaseId: string;
  releaseId: number | null;
  createdAt: number;
  revision: string | null;
  name: string | null;
  description: string | null;
};

type PendingPartsData = {
  parts: PendingPart[];
  subsystems: Subsystem[];
};

type PartForm = {
  onshapePartNumber: string;
  revision: string;
  subsystemId: number;
  name: string;
  quantity: number;
  notes: string;
  partDrawingUrl: string;
  isPriority: boolean;
  processIds: number[];
};

export function IngestPartsPage() {
  const { data, loading } = useShopData();
  const touch = useTouchDevice();
  const [pendingData, setPendingData] = useState<PendingPartsData | null>(null);
  const [pendingLoading, setPendingLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [currentIndex, setCurrentIndex] = useState<number | null>(null);

  useEffect(() => {
    loadPendingParts();
  }, []);

  async function loadPendingParts() {
    try {
      setPendingLoading(true);
      setError(null);
      // biome-ignore lint/suspicious/noExplicitAny: workaround for Hono client type generation
      const res = await (api as any).admin.parts.pending.$get();
      if (!res.ok) {
        setError(await getErrorMessage(res as unknown as Response));
        return;
      }
      const result = (await res.json()) as PendingPartsData;
      setPendingData(result);
      setCurrentIndex(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load pending parts");
    } finally {
      setPendingLoading(false);
    }
  }

  if (loading || pendingLoading) return <PageLoading />;

  if (error) {
    return (
      <main className="min-h-screen bg-mist">
        <div className="max-w-2xl mx-auto px-6 py-8 space-y-5">
          <Link to="/parts" className="text-sm text-steel hover:text-ink transition-colors">
            ← Back to Parts
          </Link>
          <h1 className="font-display text-4xl text-ink">Ingest Parts</h1>
          <ErrorBanner message={error} />
        </div>
      </main>
    );
  }

  if (!pendingData || pendingData.parts.length === 0) {
    return (
      <main className="min-h-screen bg-mist">
        <div className="max-w-2xl mx-auto px-6 py-8 space-y-5">
          <Link to="/parts" className="text-sm text-steel hover:text-ink transition-colors">
            ← Back to Parts
          </Link>
          <h1 className="font-display text-4xl text-ink">Ingest Parts</h1>
          <div className="bg-paper border border-steel/30 rounded-xl p-6">
            <p className="text-sm text-steel">No pending parts to ingest.</p>
          </div>
        </div>
      </main>
    );
  }

  // If currentIndex is null, show list view; otherwise show detail view
  if (currentIndex === null) {
    return (
      <main className="min-h-screen bg-mist">
        <div className="max-w-4xl mx-auto px-6 py-8 space-y-5">
          <Link to="/parts" className="text-sm text-steel hover:text-ink transition-colors">
            ← Back to Parts
          </Link>
          <h1 className="font-display text-4xl text-ink">Ingest Parts</h1>

          <div className="bg-paper border border-steel/30 rounded-xl overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-mist border-b border-steel/25">
                  <tr>
                    <th className="px-4 py-3 text-left font-semibold text-steel-dark">
                      Part Number
                    </th>
                    <th className="px-4 py-3 text-left font-semibold text-steel-dark">
                      Release ID
                    </th>
                    <th className="px-4 py-3 text-left font-semibold text-steel-dark">Entity ID</th>
                    <th className="px-4 py-3 text-left font-semibold text-steel-dark">Drawing</th>
                    <th className="px-4 py-3 text-right font-semibold text-steel-dark">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-steel/25">
                  {pendingData.parts.map((part, idx) => (
                    <tr
                      key={`${part.onshapeReleaseId}-${part.partNumber}`}
                      className="hover:bg-mist transition-colors"
                    >
                      <td className="px-4 py-3 text-ink font-medium">{part.partNumber}</td>
                      <td className="px-4 py-3 text-steel text-xs font-mono">
                        {part.onshapeReleaseId}
                      </td>
                      <td className="px-4 py-3 text-steel text-xs font-mono">
                        {part.entityId ? `${part.entityId.slice(0, 12)}…` : "—"}
                      </td>
                      <td className="px-4 py-3 text-steel">
                        {part.partDrawingEntityId ? "✓" : "—"}
                      </td>
                      <td className="px-4 py-3 text-right">
                        <button
                          type="button"
                          onClick={() => setCurrentIndex(idx)}
                          className="text-xs font-medium text-crimson hover:text-crimson-dark underline"
                        >
                          Ingest →
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </main>
    );
  }

  const currentPart = pendingData.parts[currentIndex];
  if (!currentPart) return null;

  return (
    <main className="min-h-screen bg-mist">
      <div className="max-w-2xl mx-auto px-6 py-8 space-y-5">
        <button
          type="button"
          onClick={() => setCurrentIndex(null)}
          className="text-sm text-steel hover:text-ink transition-colors"
        >
          ← Back to List
        </button>
        <h1 className="font-display text-4xl text-ink">Ingest Parts</h1>

        <div className="text-sm text-steel">
          Part {currentIndex + 1} of {pendingData.parts.length}
        </div>

        {data && (
          <PartIngestCard
            part={currentPart}
            subsystems={pendingData.subsystems}
            processes={data.processes}
            onNext={() => {
              if (currentIndex + 1 < pendingData.parts.length) {
                setCurrentIndex(currentIndex + 1);
              } else {
                setCurrentIndex(null);
              }
            }}
            onRefresh={loadPendingParts}
            touch={touch}
          />
        )}
      </div>
    </main>
  );
}

function PartIngestCard({
  part,
  subsystems,
  processes,
  onNext,
  onRefresh,
  touch,
}: {
  part: PendingPart;
  subsystems: Subsystem[];
  processes: Process[];
  onNext: () => void;
  onRefresh: () => void;
  touch: boolean;
}) {
  const [form, setForm] = useState<PartForm>({
    onshapePartNumber: part.partNumber,
    revision: part.revision || "",
    subsystemId: 0,
    name: part.name || part.partNumber,
    quantity: part.quantity ?? 1,
    notes: part.description || "",
    partDrawingUrl: "",
    isPriority: false,
    processIds: [],
  });

  const [drawingFetching, setDrawingFetching] = useState(false);
  const [drawingError, setDrawingError] = useState<string | null>(null);
  const [drawingSuccess, setDrawingSuccess] = useState(false);
  const [showExistsAlert, setShowExistsAlert] = useState(false);
  const [showRefetchConfirm, setShowRefetchConfirm] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState("");
  const [banner, setBanner] = useState<string | null>(null);
  const [documentId, setDocumentId] = useState<string | null>(null);
  const [existingRevisions, setExistingRevisions] = useState<string[]>([]);
  const [showDuplicateConfirm, setShowDuplicateConfirm] = useState(false);

  // Load document ID for OnShape link
  useEffect(() => {
    loadDocumentId();
  }, []);

  async function loadDocumentId() {
    try {
      // biome-ignore lint/suspicious/noExplicitAny: workaround for Hono client type generation
      const res = await (api as any).admin.onshape.config.$get();
      if (res.ok) {
        const config = (await res.json()) as { documentId: string };
        setDocumentId(config.documentId);
      }
    } catch (err) {
      console.error("Failed to load document ID");
    }
  }

  async function checkDrawingExists() {
    try {
      const res = await fetch(`/api/parts/${part.partNumber}/drawing`);
      return res.ok;
    } catch {
      return false;
    }
  }

  async function handleFetchDrawing() {
    // Check if drawing already exists
    const exists = await checkDrawingExists();

    if (exists) {
      // Show alert that drawing already exists
      setShowExistsAlert(true);
      return;
    }

    // No existing drawing, fetch from OnShape
    await performDrawingFetch();
  }

  function handleViewExisting() {
    // Open existing drawing in new tab for preview
    window.open(`/api/parts/${part.partNumber}/drawing`, "_blank");
    setShowExistsAlert(false);
    setShowRefetchConfirm(true);
  }

  function handleKeepExisting() {
    // Set the drawing URL based on environment
    const apiBase = import.meta.env.VITE_API_BASE_URL || "http://localhost:5174/api";
    const drawingUrl = `${apiBase}/parts/${part.partNumber}/drawing`;
    setForm((prev) => ({ ...prev, partDrawingUrl: drawingUrl }));
    setShowRefetchConfirm(false);
  }

  async function performDrawingFetch() {
    setDrawingFetching(true);
    setDrawingError(null);
    setDrawingSuccess(false);
    setShowRefetchConfirm(false);

    try {
      // biome-ignore lint/suspicious/noExplicitAny: workaround for Hono client type generation
      const res = await (api as any).admin.parts[":partNumber"]["fetch-drawing"].$post(
        {
          param: { partNumber: part.partNumber },
        },
        { json: {} },
      );

      if (!res.ok) {
        setDrawingError(await getErrorMessage(res as unknown as Response));
        return;
      }

      const apiBase = import.meta.env.VITE_API_BASE_URL || "http://localhost:5174/api";
      const drawingUrl = `${apiBase}/parts/${part.partNumber}/drawing`;
      setForm((prev) => ({ ...prev, partDrawingUrl: drawingUrl }));
      setDrawingSuccess(true);
    } catch (err) {
      setDrawingError(err instanceof Error ? err.message : "Failed to fetch drawing");
    } finally {
      setDrawingFetching(false);
    }
  }

  function setProcessAt(index: number, processId: number) {
    setForm((prev) => {
      const next = { ...prev };
      if (processId === 0) {
        next.processIds.splice(index, 1);
      } else {
        next.processIds[index] = processId;
      }
      return next;
    });
  }

  async function checkForDuplicates(): Promise<string[]> {
    try {
      // biome-ignore lint/suspicious/noExplicitAny: workaround for Hono client type generation
      const res = await (api as any)["part-definitions"].$get({
        query: { onshapePartNumber: form.onshapePartNumber.trim() },
      });
      if (res.ok) {
        const parts = (await res.json()) as { revision: string }[];
        return parts.map((p) => p.revision);
      }
      return [];
    } catch {
      return [];
    }
  }

  async function handleSubmit() {
    if (
      !form.onshapePartNumber.trim() ||
      !form.revision.trim() ||
      !form.name.trim() ||
      !form.subsystemId
    ) {
      setFormError("Onshape part number, revision, subsystem, and name are required.");
      return;
    }
    if (!Number.isInteger(form.quantity) || form.quantity < 1) {
      setFormError("Quantity must be a whole number of at least 1.");
      return;
    }

    // Check for existing parts with same number
    const revisions = await checkForDuplicates();
    if (revisions.length > 0) {
      setExistingRevisions(revisions);
      setShowDuplicateConfirm(true);
      return;
    }

    await performCreate(false);
  }

  async function performCreate(obsolete = false) {
    setFormError("");
    setSubmitting(true);

    try {
      const createPayload = {
        onshapePartNumber: form.onshapePartNumber.trim(),
        revision: form.revision.trim(),
        subsystemId: form.subsystemId,
        name: form.name.trim(),
        notes: form.notes.trim() || undefined,
        partDrawingUrl: form.partDrawingUrl.trim() || undefined,
        processIds: form.processIds,
        obsoleteExisting: obsolete,
      };

      const defRes = await api["part-definitions"].$post({
        json: createPayload,
      });

      if (!defRes.ok) {
        setBanner(await getErrorMessage(defRes as unknown as Response));
        return;
      }

      const definition = (await defRes.json()) as { id: number };

      const instRes = await api["part-instances"].$post({
        json: {
          partDefinitionId: definition.id,
          quantity: form.quantity,
        },
      });

      if (!instRes.ok) {
        setBanner(await getErrorMessage(instRes as unknown as Response));
        return;
      }

      const instances = (await instRes.json()) as { id: number }[];

      if (form.isPriority) {
        await Promise.all(
          instances.map((inst) =>
            api["part-instances"][":id"].$patch({
              param: { id: String(inst.id) },
              json: { isPriority: true },
            }),
          ),
        );
      }

      setShowDuplicateConfirm(false);
      await onRefresh();
      // Reset errors and scroll to top
      setFormError("");
      setBanner(null);
      setDrawingError(null);
      setDrawingSuccess(false);
      setShowExistsAlert(false);
      setShowRefetchConfirm(false);
      window.scrollTo(0, 0);
    } catch (err) {
      setBanner(err instanceof Error ? err.message : "An error occurred");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="bg-paper border border-steel/30 rounded-xl p-6 space-y-4">
      <div className="pb-2 border-b border-steel/25 space-y-2">
        <h3 className="font-semibold text-ink">{part.partNumber}</h3>
        <p className="text-xs text-steel">From OnShape Release: {part.onshapeReleaseId}</p>
        {documentId && part.entityId && part.versionId && (
          <a
            href={`https://cad.onshape.com/documents/${documentId}/v/${part.versionId}/e/${part.entityId}`}
            target="_blank"
            rel="noopener noreferrer"
            className="text-xs text-crimson hover:text-crimson-dark underline"
          >
            View in OnShape →
          </a>
        )}
      </div>

      {banner && (
        <div className="text-sm text-crimson-dark bg-crimson-50 border border-crimson-200 rounded-lg px-3 py-2">
          {banner}
        </div>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <Field
          label="Onshape Part Number"
          required
          value={form.onshapePartNumber}
          onChange={(v) => setForm({ ...form, onshapePartNumber: v })}
          placeholder="P-0042"
        />
        <Field
          label="Revision"
          required
          value={form.revision}
          onChange={(v) => setForm({ ...form, revision: v })}
          placeholder="A"
        />
        <div className="space-y-1">
          <FieldLabel label="Subsystem" required />
          <select
            value={form.subsystemId}
            onChange={(e) => setForm({ ...form, subsystemId: Number(e.target.value) })}
            className="w-full bg-paper border border-steel/40 rounded-lg px-3 py-2 text-sm text-ink focus:outline-none focus:border-crimson"
          >
            <option value={0}>Select…</option>
            {subsystems.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
        </div>
        <Field
          label="Name"
          required
          value={form.name}
          onChange={(v) => setForm({ ...form, name: v })}
          placeholder="Same as Onshape"
        />
        <div className="space-y-1">
          <FieldLabel label="Quantity" required />
          <input
            type="number"
            min={1}
            value={form.quantity}
            onChange={(e) =>
              setForm({
                ...form,
                quantity: Math.max(1, Math.floor(Number(e.target.value))),
              })
            }
            className="w-full bg-paper border border-steel/40 rounded-lg px-3 py-2 text-sm text-ink focus:outline-none focus:border-crimson"
          />
        </div>
        <Field
          label="Notes"
          value={form.notes}
          onChange={(v) => setForm({ ...form, notes: v })}
          placeholder="Optional"
        />
        <div className="sm:col-span-2 space-y-1">
          <div className="flex items-center justify-between">
            <FieldLabel label="Part Drawing URL" />
            {form.partDrawingUrl && (
              <button
                type="button"
                onClick={() => window.open(form.partDrawingUrl, "_blank")}
                className="text-xs text-crimson hover:text-crimson-dark underline"
              >
                Open →
              </button>
            )}
          </div>
          <input
            type="text"
            value={form.partDrawingUrl}
            onChange={(e) => setForm({ ...form, partDrawingUrl: e.target.value })}
            placeholder="https://…"
            className="w-full bg-paper border border-steel/40 rounded-lg px-3 py-2 text-sm text-ink placeholder-steel focus:outline-none focus:border-crimson"
          />
          <p className="text-xs text-steel">Can be auto-populated by fetching from OnShape</p>
        </div>
      </div>

      <div className="p-3 bg-mist rounded-lg border border-steel/25 space-y-2">
        {showExistsAlert ? (
          <div className="space-y-2">
            <p className="text-xs font-medium text-steel-dark">
              Drawing already exists for this part
            </p>
            <p className="text-xs text-steel">
              Would you like to view the existing drawing to check if it needs updating?
            </p>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={handleViewExisting}
                className="text-xs font-medium rounded-lg px-3 py-1.5 bg-paper border border-steel/40 text-ink hover:bg-steel-tint"
              >
                View Existing
              </button>
              <button
                type="button"
                onClick={() => setShowExistsAlert(false)}
                className="text-xs font-medium rounded-lg px-3 py-1.5 bg-steel-tint border border-steel/40 text-steel-dark hover:bg-steel/20"
              >
                Cancel
              </button>
            </div>
          </div>
        ) : showRefetchConfirm ? (
          <div className="space-y-2">
            <p className="text-xs font-medium text-steel-dark">Ready to update the drawing?</p>
            <p className="text-xs text-steel">
              Click below to refetch the drawing from OnShape and overwrite the cached version.
            </p>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={performDrawingFetch}
                disabled={drawingFetching}
                className="text-xs font-medium rounded-lg px-3 py-1.5 bg-crimson hover:bg-crimson-dark disabled:opacity-50 text-paper"
              >
                {drawingFetching ? "Refetching…" : "Refetch & Overwrite"}
              </button>
              <button
                type="button"
                onClick={handleKeepExisting}
                className="text-xs font-medium rounded-lg px-3 py-1.5 bg-steel-tint border border-steel/40 text-steel-dark hover:bg-steel/20"
              >
                Keep Existing
              </button>
            </div>
          </div>
        ) : (
          <div className="space-y-2">
            <p className="text-xs font-medium text-steel-dark mb-2">Auto-fetch Drawing</p>
            <button
              type="button"
              onClick={handleFetchDrawing}
              disabled={drawingFetching || drawingSuccess}
              className={`text-xs font-medium rounded-lg transition-colors px-3 py-1.5 w-full ${
                drawingSuccess
                  ? "bg-emerald-50 border border-emerald-300 text-emerald-700 cursor-default"
                  : drawingError
                    ? "bg-crimson-50 border border-crimson-200 text-crimson hover:bg-crimson-100"
                    : "bg-paper border border-steel/40 text-ink hover:bg-steel-tint"
              }`}
            >
              {drawingFetching
                ? "Fetching…"
                : drawingSuccess
                  ? "✓ Drawing Cached"
                  : drawingError
                    ? "⚠ Retry"
                    : "Try Auto Fetch"}
            </button>
          </div>
        )}
        {drawingError && <p className="text-xs text-crimson-dark">{drawingError}</p>}
      </div>

      <label className="flex items-center gap-2 cursor-pointer select-none text-sm text-ink">
        <input
          type="checkbox"
          checked={form.isPriority}
          onChange={(e) => setForm({ ...form, isPriority: e.target.checked })}
          className="accent-crimson w-4 h-4"
        />
        Priority part
      </label>

      <hr className="border-steel/25" />

      <div className="space-y-2">
        <FieldLabel label="Processes" />
        <p className="text-xs text-steel">
          The order here is the order the part moves through the shop.
        </p>
        {processes.length === 0 ? (
          <p className="text-sm text-steel">No processes exist yet.</p>
        ) : (
          <div className="space-y-2">
            {form.processIds.map((pid, i) => (
              <div key={`${i}-${pid}`} className="flex items-center gap-2">
                <span className="w-6 text-sm font-mono text-steel text-right shrink-0">
                  {i + 1}.
                </span>
                <select
                  value={pid}
                  onChange={(e) => setProcessAt(i, Number(e.target.value))}
                  className="flex-1 bg-paper border border-steel/40 rounded-lg px-3 py-2 text-sm text-ink focus:outline-none focus:border-crimson"
                >
                  <option value={0}>Remove</option>
                  {processes.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
                </select>
              </div>
            ))}
            <div className="flex items-center gap-2">
              <span className="w-6 text-sm font-mono text-steel text-right shrink-0">
                {form.processIds.length + 1}.
              </span>
              <select
                value={0}
                onChange={(e) => {
                  const pid = Number(e.target.value);
                  if (pid) setForm((prev) => ({ ...prev, processIds: [...prev.processIds, pid] }));
                }}
                className="flex-1 bg-mist border border-dashed border-steel/40 rounded-lg px-3 py-2 text-sm text-steel-dark focus:outline-none focus:border-crimson"
              >
                <option value={0}>Add a process…</option>
                {processes.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
            </div>
          </div>
        )}
      </div>

      {formError && <p className="text-crimson-dark text-sm">{formError}</p>}

      {showDuplicateConfirm && (
        <div className="p-4 bg-crimson-50 border border-crimson-200 rounded-lg space-y-2">
          <p className="text-sm font-medium text-crimson-dark">
            A part with number <span className="font-mono">{form.onshapePartNumber}</span> already
            exists in the system
          </p>
          <p className="text-xs text-crimson">
            Existing revisions: <span className="font-mono">{existingRevisions.join(", ")}</span>
          </p>
          <div className="flex gap-2 pt-2">
            <button
              type="button"
              onClick={() => {
                setShowDuplicateConfirm(false);
              }}
              className="text-xs font-medium rounded-lg px-3 py-1.5 bg-paper border border-steel/40 text-ink hover:bg-steel-tint"
            >
              Skip This Part
            </button>
            <button
              type="button"
              onClick={() => {
                setShowDuplicateConfirm(false);
                performCreate(true);
              }}
              className="text-xs font-medium rounded-lg px-3 py-1.5 bg-crimson hover:bg-crimson-dark text-paper"
            >
              Obsolete Old Revisions & Add
            </button>
          </div>
        </div>
      )}

      <div className="flex gap-2 pt-2">
        <button
          type="button"
          onClick={handleSubmit}
          disabled={submitting}
          className={`bg-crimson hover:bg-crimson-dark disabled:opacity-50 text-paper text-sm font-semibold rounded-lg transition-colors ${
            touch ? "px-6 py-3" : "px-5 py-2"
          }`}
        >
          {submitting ? "Creating…" : "Create Part & Instances"}
        </button>
        <button
          type="button"
          onClick={() => {
            setFormError("");
            setBanner(null);
            setDrawingError(null);
            setDrawingSuccess(false);
            setShowExistsAlert(false);
            setShowRefetchConfirm(false);
            window.scrollTo(0, 0);
            onNext();
          }}
          disabled={submitting}
          className={`bg-steel-tint hover:bg-steel/30 text-steel-dark text-sm font-medium rounded-lg transition-colors ${
            touch ? "px-6 py-3" : "px-5 py-2"
          }`}
        >
          Skip to Next
        </button>
        <button
          type="button"
          onClick={() => {
            setFormError("");
            setBanner(null);
            setDrawingError(null);
            setDrawingSuccess(false);
            setShowExistsAlert(false);
            setShowRefetchConfirm(false);
            window.scrollTo(0, 0);
          }}
          className={`ml-auto bg-paper border border-steel/40 hover:bg-mist text-ink text-sm font-medium rounded-lg transition-colors ${
            touch ? "px-6 py-3" : "px-5 py-2"
          }`}
        >
          ← Back to List
        </button>
      </div>
    </div>
  );
}

function FieldLabel({ label, required }: { label: string; required?: boolean }) {
  return (
    <span className="text-xs font-medium text-steel-dark">
      {label}
      {required && <span className="text-crimson"> *</span>}
    </span>
  );
}

function Field({
  label,
  value,
  onChange,
  placeholder,
  required,
  hint,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  required?: boolean;
  hint?: string;
}) {
  return (
    <div className="space-y-1">
      <FieldLabel label={label} required={required} />
      <input
        type="text"
        value={value}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
        className="w-full bg-paper border border-steel/40 rounded-lg px-3 py-2 text-sm text-ink placeholder-steel focus:outline-none focus:border-crimson"
      />
      {hint && <p className="text-xs text-steel">{hint}</p>}
    </div>
  );
}
