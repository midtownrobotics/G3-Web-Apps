import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { api } from "../../shared/api";
import { getErrorMessage } from "../../shared/api-error";
import type { PartDefinition, PartInstance } from "../../shared/types";
import { ErrorBanner, PageLoading } from "../../shared/ui";
import { useShopData } from "../../shared/use-shop-data";

export function AddPartPage() {
  const navigate = useNavigate();
  const { data, loading } = useShopData();

  const [form, setForm] = useState({
    onshapePartNumber: "",
    revision: "",
    subsystemId: 0,
    name: "",
    quantity: 1,
    notes: "",
    partDrawingUrl: "",
    isPriority: false,
  });
  const [processIds, setProcessIds] = useState<number[]>([]);
  const [formError, setFormError] = useState("");
  const [banner, setBanner] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  if (loading) return <PageLoading />;

  function setProcessAt(index: number, processId: number) {
    setProcessIds((prev) => {
      const next = [...prev];
      if (processId === 0) next.splice(index, 1);
      else next[index] = processId;
      return next;
    });
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
    setFormError("");
    setSubmitting(true);

    try {
      const defRes = await api["part-definitions"].$post({
        json: {
          onshapePartNumber: form.onshapePartNumber.trim(),
          revision: form.revision.trim(),
          subsystemId: form.subsystemId,
          name: form.name.trim(),
          notes: form.notes.trim() || undefined,
          partDrawingUrl: form.partDrawingUrl.trim() || undefined,
          processIds,
        },
      });
      if (!defRes.ok) {
        setBanner(await getErrorMessage(defRes as unknown as Response));
        return;
      }
      const definition = (await defRes.json()) as PartDefinition;

      const instRes = await api["part-instances"].$post({
        json: { partDefinitionId: definition.id, quantity: form.quantity },
      });
      if (!instRes.ok) {
        setBanner(await getErrorMessage(instRes as unknown as Response));
        return;
      }

      if (form.isPriority) {
        const instances = (await instRes.json()) as PartInstance[];
        await Promise.all(
          instances.map((inst) =>
            api["part-instances"][":id"].$patch({
              param: { id: String(inst.id) },
              json: { isPriority: true },
            }),
          ),
        );
      }

      navigate("/parts");
    } finally {
      setSubmitting(false);
    }
  }

  const subsystems = data?.subsystems ?? [];
  const processes = data?.processes ?? [];

  return (
    <main className="min-h-screen bg-mist">
      <div className="max-w-2xl mx-auto px-6 py-8 space-y-5">
        <div>
          <Link to="/parts" className="text-sm text-steel hover:text-ink transition-colors">
            ← Back to Parts
          </Link>
          <h1 className="font-display text-4xl text-ink mt-2">Add Part</h1>
        </div>

        {banner && <ErrorBanner message={banner} />}

        <div className="bg-paper border border-steel/30 rounded-xl p-6 space-y-4">
          {subsystems.length === 0 ? (
            <p className="text-sm text-amber-700 bg-amber-50 border border-amber-300 rounded-lg px-4 py-2.5">
              No subsystems exist yet — add one on the{" "}
              <Link to="/admin" className="underline font-medium">
                Admin page
              </Link>{" "}
              first.
            </p>
          ) : (
            <>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <Field
                  label="Onshape Part Number"
                  required
                  value={form.onshapePartNumber}
                  onChange={(v) => setForm({ ...form, onshapePartNumber: v })}
                  placeholder="P-0042"
                />
                <Field
                  label="Onshape Revision"
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
                      setForm({ ...form, quantity: Math.max(1, Math.floor(Number(e.target.value))) })
                    }
                    className="w-full bg-paper border border-steel/40 rounded-lg px-3 py-2 text-sm text-ink focus:outline-none focus:border-crimson"
                  />
                  <p className="text-xs text-steel">One part instance is made per quantity.</p>
                </div>
                <Field
                  label="Notes"
                  value={form.notes}
                  onChange={(v) => setForm({ ...form, notes: v })}
                  placeholder="Optional"
                />
                <div className="sm:col-span-2">
                  <Field
                    label="Part Drawing URL"
                    value={form.partDrawingUrl}
                    onChange={(v) => setForm({ ...form, partDrawingUrl: v })}
                    placeholder="https://…"
                    hint="Not required if the part is purely CNC or 3D printed."
                  />
                </div>
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

              {/* Processes */}
              <div className="space-y-2">
                <FieldLabel label="Processes" />
                <p className="text-xs text-steel">
                  The order here is the order the part moves through the shop.
                </p>
                {processes.length === 0 ? (
                  <p className="text-sm text-steel">
                    No processes exist yet — add some on the Admin page.
                  </p>
                ) : (
                  <div className="space-y-2">
                    {processIds.map((pid, i) => (
                      <div
                        // biome-ignore lint/suspicious/noArrayIndexKey: positional rows; duplicates of the same process are allowed
                        key={i}
                        className="flex items-center gap-2"
                      >
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
                        {processIds.length + 1}.
                      </span>
                      <select
                        value={0}
                        onChange={(e) => {
                          const pid = Number(e.target.value);
                          if (pid) setProcessIds((prev) => [...prev, pid]);
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

              <div className="flex gap-2 pt-2">
                <button
                  type="button"
                  onClick={handleSubmit}
                  disabled={submitting}
                  className="px-5 py-2 bg-crimson hover:bg-crimson-dark disabled:opacity-50 text-paper text-sm font-semibold rounded-lg transition-colors"
                >
                  {submitting ? "Creating…" : "Create Part"}
                </button>
                <Link
                  to="/parts"
                  className="px-5 py-2 bg-steel-tint hover:bg-steel/30 text-steel-dark text-sm font-medium rounded-lg transition-colors"
                >
                  Cancel
                </Link>
              </div>
            </>
          )}
        </div>
      </div>
    </main>
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
