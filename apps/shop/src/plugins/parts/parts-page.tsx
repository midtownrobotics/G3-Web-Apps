import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "../../shared/api";
import { getErrorMessage } from "../../shared/api-error";
import { fetchPartDefinitions, fetchProcesses, fetchSubsystems } from "../../shared/getters";
import type { PartDefinition, Process, Subsystem } from "../../shared/types";

export function PartsPage() {
  const navigate = useNavigate();
  const [parts, setParts] = useState<PartDefinition[]>([]);
  const [subsystems, setSubsystems] = useState<Subsystem[]>([]);
  const [processes, setProcesses] = useState<Process[]>([]);
  const [loading, setLoading] = useState(true);
  const [banner, setBanner] = useState<string | null>(null);

  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState({
    name: "",
    onshapePartNumber: "",
    revision: "",
    subsystemId: 0,
    notes: "",
    partDrawingUrl: "",
  });
  const [selectedProcessIds, setSelectedProcessIds] = useState<number[]>([]);
  const [createError, setCreateError] = useState("");

  async function load() {
    try {
      const [p, s, pr] = await Promise.all([
        fetchPartDefinitions(),
        fetchSubsystems(),
        fetchProcesses(),
      ]);
      setParts(p);
      setSubsystems(s);
      setProcesses(pr);
    } catch {}
    setLoading(false);
  }

  // biome-ignore lint/correctness/useExhaustiveDependencies: load is stable
  useEffect(() => {
    load();
  }, []);

  function toggleProcess(id: number) {
    setSelectedProcessIds((prev) =>
      prev.includes(id) ? prev.filter((p) => p !== id) : [...prev, id],
    );
  }

  async function handleCreate() {
    if (!form.name.trim() || !form.onshapePartNumber.trim() || !form.revision.trim()) {
      setCreateError("Name, Onshape part #, and revision are required.");
      return;
    }
    if (!form.subsystemId) {
      setCreateError("Select a subsystem.");
      return;
    }
    const res = await api["part-definitions"].$post({
      json: {
        name: form.name.trim(),
        onshapePartNumber: form.onshapePartNumber.trim(),
        revision: form.revision.trim(),
        subsystemId: form.subsystemId,
        notes: form.notes.trim() || undefined,
        partDrawingUrl: form.partDrawingUrl.trim() || undefined,
        processIds: selectedProcessIds,
      },
    });
    if (!res.ok) {
      setBanner(await getErrorMessage(res as unknown as Response));
      return;
    }
    const created = (await res.json()) as PartDefinition;
    navigate(`/parts/${created.id}`);
  }

  if (loading) {
    return (
      <main className="min-h-screen bg-gray-950 flex items-center justify-center">
        <p className="text-gray-400">Loading…</p>
      </main>
    );
  }

  const subsystemName = (id: number) => subsystems.find((s) => s.id === id)?.name ?? "—";
  const grouped = subsystems
    .map((s) => ({ subsystem: s, parts: parts.filter((p) => p.subsystemId === s.id) }))
    .filter((g) => g.parts.length > 0);
  const orphans = parts.filter((p) => !subsystems.some((s) => s.id === p.subsystemId));

  return (
    <main className="min-h-screen bg-gray-950 text-white">
      <div className="max-w-3xl mx-auto px-4 py-8 space-y-6">
        <div className="flex items-center justify-between">
          <h1 className="text-3xl font-bold tracking-tight">Parts</h1>
          {!creating && (
            <button
              type="button"
              onClick={() => {
                setCreating(true);
                setBanner(null);
              }}
              className="px-4 py-2 bg-red-600 hover:bg-red-500 text-white text-sm font-semibold rounded-lg transition-colors"
            >
              + New Part
            </button>
          )}
        </div>

        {banner && (
          <p className="text-red-400 text-sm bg-red-950 border border-red-800 rounded-lg px-4 py-2">
            {banner}
          </p>
        )}

        {creating && (
          <div className="bg-gray-900 rounded-xl border border-gray-700 p-5 space-y-3">
            <h2 className="font-semibold text-gray-200">New Part</h2>

            {subsystems.length === 0 ? (
              <p className="text-yellow-400 text-sm">Create a subsystem in Settings first.</p>
            ) : (
              <>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <Field
                    label="Name"
                    value={form.name}
                    onChange={(v) => setForm({ ...form, name: v })}
                    placeholder="Front left bracket"
                  />
                  <div className="space-y-1">
                    <span className="text-xs font-medium text-gray-400">Subsystem</span>
                    <select
                      value={form.subsystemId}
                      onChange={(e) => setForm({ ...form, subsystemId: Number(e.target.value) })}
                      className="w-full bg-gray-800 border border-gray-600 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-red-500"
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
                    label="Onshape Part #"
                    value={form.onshapePartNumber}
                    onChange={(v) => setForm({ ...form, onshapePartNumber: v })}
                    placeholder="0001"
                  />
                  <Field
                    label="Revision"
                    value={form.revision}
                    onChange={(v) => setForm({ ...form, revision: v })}
                    placeholder="A"
                  />
                  <Field
                    label="Drawing URL (optional)"
                    value={form.partDrawingUrl}
                    onChange={(v) => setForm({ ...form, partDrawingUrl: v })}
                    placeholder="https://…"
                  />
                  <Field
                    label="Notes (optional)"
                    value={form.notes}
                    onChange={(v) => setForm({ ...form, notes: v })}
                    placeholder=""
                  />
                </div>

                <div className="space-y-1.5">
                  <span className="text-xs font-medium text-gray-400">
                    Process blueprint (tap in order)
                  </span>
                  {processes.length === 0 ? (
                    <p className="text-gray-600 text-sm">No processes — add some in Settings.</p>
                  ) : (
                    <div className="flex flex-wrap gap-2">
                      {processes.map((p) => {
                        const pos = selectedProcessIds.indexOf(p.id);
                        const selected = pos !== -1;
                        return (
                          <button
                            key={p.id}
                            type="button"
                            onClick={() => toggleProcess(p.id)}
                            className={`px-3 py-1.5 text-sm font-medium rounded-lg border transition-colors ${
                              selected
                                ? "bg-red-600 border-red-500 text-white"
                                : "bg-gray-800 border-gray-700 text-gray-300 hover:border-gray-500"
                            }`}
                          >
                            {selected && <span className="font-bold mr-1">{pos + 1}.</span>}
                            {p.name}
                          </button>
                        );
                      })}
                    </div>
                  )}
                </div>

                {createError && <p className="text-red-400 text-xs">{createError}</p>}
                <div className="flex gap-2 pt-1">
                  <button
                    type="button"
                    onClick={handleCreate}
                    className="px-4 py-2 bg-red-600 hover:bg-red-500 text-white text-sm font-semibold rounded-lg"
                  >
                    Create
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setCreating(false);
                      setCreateError("");
                      setSelectedProcessIds([]);
                    }}
                    className="px-4 py-2 bg-gray-700 hover:bg-gray-600 text-gray-200 text-sm rounded-lg"
                  >
                    Cancel
                  </button>
                </div>
              </>
            )}
          </div>
        )}

        {parts.length === 0 && !creating && (
          <p className="text-gray-500 text-center py-12">
            No parts yet. Create one to get started.
          </p>
        )}

        {[...grouped, ...(orphans.length ? [{ subsystem: null, parts: orphans }] : [])].map(
          (group) => (
            <section key={group.subsystem?.id ?? "orphans"} className="space-y-2">
              <h2 className="text-xs font-bold uppercase tracking-widest text-gray-500">
                {group.subsystem?.name ?? "Other"}
              </h2>
              <div className="space-y-2">
                {group.parts.map((part) => (
                  <button
                    key={part.id}
                    type="button"
                    onClick={() => navigate(`/parts/${part.id}`)}
                    className="w-full bg-gray-900 hover:bg-gray-800 border border-gray-700 hover:border-gray-600 rounded-xl p-4 text-left transition-colors group"
                  >
                    <div className="flex items-center justify-between gap-3">
                      <div className="min-w-0">
                        <p className="text-base font-semibold text-white group-hover:text-red-400 transition-colors truncate">
                          {part.name}
                        </p>
                        <p className="text-xs text-gray-500 mt-0.5 font-mono">
                          {part.onshapePartNumber} · Rev {part.revision} ·{" "}
                          {subsystemName(part.subsystemId)}
                        </p>
                      </div>
                      <span className="text-gray-500 group-hover:text-red-400 transition-colors shrink-0">
                        →
                      </span>
                    </div>
                  </button>
                ))}
              </div>
            </section>
          ),
        )}
      </div>
    </main>
  );
}

function Field({
  label,
  value,
  onChange,
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
}) {
  return (
    <div className="space-y-1">
      <span className="text-xs font-medium text-gray-400">{label}</span>
      <input
        type="text"
        value={value}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
        className="w-full bg-gray-800 border border-gray-600 rounded-lg px-3 py-2 text-sm text-white placeholder-gray-500 focus:outline-none focus:border-red-500"
      />
    </div>
  );
}
