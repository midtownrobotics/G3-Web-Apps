import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { api } from "../../shared/api";
import { getErrorMessage } from "../../shared/api-error";
import {
  fetchBlueprint,
  fetchInstanceProcesses,
  fetchInstances,
  fetchPartDefinitions,
  fetchProcesses,
  fetchSubsystems,
} from "../../shared/getters";
import type {
  Blueprint,
  PartDefinition,
  PartInstance,
  PartInstanceProcess,
  Process,
  ProcessStatus,
  Subsystem,
} from "../../shared/types";

const STATUS_META: Record<ProcessStatus, { label: string; cls: string }> = {
  waiting: { label: "Waiting", cls: "bg-gray-800 text-gray-500 border-gray-700" },
  todo: { label: "To do", cls: "bg-blue-900/30 text-blue-300 border-blue-700" },
  doing: { label: "Doing", cls: "bg-yellow-900/30 text-yellow-300 border-yellow-700" },
  done: { label: "Done", cls: "bg-green-900/30 text-green-400 border-green-700" },
};

export function PartDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();

  const [part, setPart] = useState<PartDefinition | null>(null);
  const [subsystems, setSubsystems] = useState<Subsystem[]>([]);
  const [processes, setProcesses] = useState<Process[]>([]);
  const [blueprint, setBlueprint] = useState<Blueprint[]>([]);
  const [instances, setInstances] = useState<PartInstance[]>([]);
  const [instanceProcs, setInstanceProcs] = useState<Record<number, PartInstanceProcess[]>>({});
  const [expandedId, setExpandedId] = useState<number | null>(null);

  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [banner, setBanner] = useState<string | null>(null);

  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<Partial<PartDefinition>>({});

  const [addProcessId, setAddProcessId] = useState(0);
  const [quantity, setQuantity] = useState(1);

  const processName = (pid: number) => processes.find((p) => p.id === pid)?.name ?? `#${pid}`;

  async function load() {
    if (!id) return;
    try {
      const [defs, subs, procs, bp, insts] = await Promise.all([
        fetchPartDefinitions(),
        fetchSubsystems(),
        fetchProcesses(),
        fetchBlueprint(id),
        fetchInstances(id),
      ]);
      const found = defs.find((d) => d.id === Number(id)) ?? null;
      if (!found) {
        setNotFound(true);
        setLoading(false);
        return;
      }
      setPart(found);
      setSubsystems(subs);
      setProcesses(procs);
      setBlueprint([...bp].sort((a, b) => a.index - b.index));
      setInstances([...insts].sort((a, b) => a.instanceNumber - b.instanceNumber));
    } catch {}
    setLoading(false);
  }

  // biome-ignore lint/correctness/useExhaustiveDependencies: re-run on id change
  useEffect(() => {
    load();
  }, [id]);

  async function loadInstanceProcs(instanceId: number) {
    try {
      const procs = await fetchInstanceProcesses(instanceId);
      setInstanceProcs((prev) => ({
        ...prev,
        [instanceId]: [...procs].sort((a, b) => a.index - b.index),
      }));
    } catch {}
  }

  function toggleExpand(instanceId: number) {
    if (expandedId === instanceId) {
      setExpandedId(null);
      return;
    }
    setExpandedId(instanceId);
    if (!instanceProcs[instanceId]) loadInstanceProcs(instanceId);
  }

  // ── Metadata ──────────────────────────────────────────────────────────────

  async function saveMetadata() {
    if (!part) return;
    const res = await api["part-definitions"][":id"].$patch({
      param: { id: String(part.id) },
      json: {
        name: draft.name,
        onshapePartNumber: draft.onshapePartNumber,
        revision: draft.revision,
        subsystemId: draft.subsystemId,
        notes: draft.notes ?? null,
        partDrawingUrl: draft.partDrawingUrl ?? null,
      },
    });
    if (!res.ok) {
      setBanner(await getErrorMessage(res as unknown as Response));
      return;
    }
    setEditing(false);
    setBanner(null);
    await load();
  }

  // ── Blueprint ─────────────────────────────────────────────────────────────

  async function addBlueprintProcess() {
    if (!part || !addProcessId) return;
    const res = await api["part-definitions"][":id"].processes.$post({
      param: { id: String(part.id) },
      json: { processId: addProcessId, index: blueprint.length },
    });
    if (!res.ok) {
      setBanner(await getErrorMessage(res as unknown as Response));
      return;
    }
    setAddProcessId(0);
    await reloadBlueprint();
  }

  async function removeBlueprintProcess(processId: number) {
    if (!part) return;
    const res = await api["part-definitions"][":id"].processes[":processId"].$delete({
      param: { id: String(part.id), processId: String(processId) },
    });
    if (!res.ok) {
      setBanner(await getErrorMessage(res as unknown as Response));
      return;
    }
    await reloadBlueprint();
  }

  async function moveBlueprint(pos: number, dir: "up" | "down") {
    if (!part) return;
    const swap = dir === "up" ? pos - 1 : pos + 1;
    if (swap < 0 || swap >= blueprint.length) return;
    const order = blueprint.map((b) => b.processId);
    [order[pos], order[swap]] = [order[swap], order[pos]];
    // optimistic
    const reordered = [...blueprint];
    [reordered[pos], reordered[swap]] = [reordered[swap], reordered[pos]];
    setBlueprint(reordered.map((b, i) => ({ ...b, index: i })));

    const res = await api["part-definitions"][":id"].processes.reorder.$patch({
      param: { id: String(part.id) },
      json: { processIds: order },
    });
    if (!res.ok) {
      setBanner(await getErrorMessage(res as unknown as Response));
      await reloadBlueprint();
    }
  }

  async function reloadBlueprint() {
    if (!part) return;
    const bp = await fetchBlueprint(part.id);
    setBlueprint([...bp].sort((a, b) => a.index - b.index));
  }

  // ── Instances ─────────────────────────────────────────────────────────────

  async function createInstances() {
    if (!part || quantity < 1) return;
    const res = await api["part-instances"].$post({
      json: { partDefinitionId: part.id, quantity },
    });
    if (!res.ok) {
      setBanner(await getErrorMessage(res as unknown as Response));
      return;
    }
    setQuantity(1);
    const insts = await fetchInstances(part.id);
    setInstances([...insts].sort((a, b) => a.instanceNumber - b.instanceNumber));
  }

  async function toggleFlag(instance: PartInstance, field: "isPriority" | "isStale") {
    const next = !instance[field];
    setInstances((prev) =>
      prev.map((i) => (i.id === instance.id ? { ...i, [field]: next ? 1 : 0 } : i)),
    );
    const res = await api["part-instances"][":id"].$patch({
      param: { id: String(instance.id) },
      json: { [field]: next },
    });
    if (!res.ok) {
      setBanner(await getErrorMessage(res as unknown as Response));
      const insts = await fetchInstances(instance.partDefinitionId);
      setInstances([...insts].sort((a, b) => a.instanceNumber - b.instanceNumber));
    }
  }

  async function advanceProcess(
    instanceId: number,
    proc: PartInstanceProcess,
    to: "doing" | "done",
  ) {
    const res = await api["part-instance-processes"][":partInstanceId"].processes[":processId"][
      to
    ].$post({
      param: { partInstanceId: String(instanceId), processId: String(proc.processId) },
    });
    if (!res.ok) {
      setBanner(await getErrorMessage(res as unknown as Response));
      return;
    }
    await loadInstanceProcs(instanceId);
  }

  if (loading) {
    return (
      <main className="min-h-screen bg-gray-950 flex items-center justify-center">
        <p className="text-gray-400">Loading…</p>
      </main>
    );
  }

  if (notFound || !part) {
    return (
      <main className="min-h-screen bg-gray-950 flex flex-col items-center justify-center gap-4">
        <p className="text-gray-400">Part not found.</p>
        <button
          type="button"
          onClick={() => navigate("/parts")}
          className="text-red-400 hover:text-red-300 text-sm underline"
        >
          Back to Parts
        </button>
      </main>
    );
  }

  const subsystemName = subsystems.find((s) => s.id === part.subsystemId)?.name ?? "—";
  const availableToAdd = processes;

  return (
    <main className="min-h-screen bg-gray-950 text-white">
      <div className="max-w-3xl mx-auto px-4 py-8 space-y-6">
        <button
          type="button"
          onClick={() => navigate("/parts")}
          className="text-sm text-gray-500 hover:text-gray-300 transition-colors"
        >
          ← Back to Parts
        </button>

        {banner && (
          <p className="text-red-400 text-sm bg-red-950 border border-red-800 rounded-lg px-4 py-2">
            {banner}
          </p>
        )}

        {/* Header / metadata */}
        {editing ? (
          <div className="bg-gray-900 rounded-xl border border-gray-700 p-5 space-y-3">
            <h2 className="font-semibold text-gray-200">Edit Part</h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <EditField
                label="Name"
                value={draft.name ?? ""}
                onChange={(v) => setDraft({ ...draft, name: v })}
              />
              <div className="space-y-1">
                <span className="text-xs font-medium text-gray-400">Subsystem</span>
                <select
                  value={draft.subsystemId ?? part.subsystemId}
                  onChange={(e) => setDraft({ ...draft, subsystemId: Number(e.target.value) })}
                  className="w-full bg-gray-800 border border-gray-600 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-red-500"
                >
                  {subsystems.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name}
                    </option>
                  ))}
                </select>
              </div>
              <EditField
                label="Onshape Part #"
                value={draft.onshapePartNumber ?? ""}
                onChange={(v) => setDraft({ ...draft, onshapePartNumber: v })}
              />
              <EditField
                label="Revision"
                value={draft.revision ?? ""}
                onChange={(v) => setDraft({ ...draft, revision: v })}
              />
              <EditField
                label="Drawing URL"
                value={draft.partDrawingUrl ?? ""}
                onChange={(v) => setDraft({ ...draft, partDrawingUrl: v })}
              />
              <EditField
                label="Notes"
                value={draft.notes ?? ""}
                onChange={(v) => setDraft({ ...draft, notes: v })}
              />
            </div>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={saveMetadata}
                className="px-4 py-2 bg-red-600 hover:bg-red-500 text-white text-sm font-semibold rounded-lg"
              >
                Save
              </button>
              <button
                type="button"
                onClick={() => setEditing(false)}
                className="px-4 py-2 bg-gray-700 hover:bg-gray-600 text-gray-200 text-sm rounded-lg"
              >
                Cancel
              </button>
            </div>
          </div>
        ) : (
          <div className="space-y-1">
            <div className="flex items-start justify-between gap-3">
              <h1 className="text-3xl font-bold tracking-tight">{part.name}</h1>
              <button
                type="button"
                onClick={() => {
                  setDraft(part);
                  setEditing(true);
                }}
                className="px-3 py-1.5 bg-gray-800 hover:bg-gray-700 text-gray-300 text-sm rounded-lg shrink-0"
              >
                Edit
              </button>
            </div>
            <p className="text-sm text-gray-500 font-mono">
              {part.onshapePartNumber} · Rev {part.revision} · {subsystemName}
            </p>
            {part.notes && <p className="text-sm text-gray-400 mt-1">{part.notes}</p>}
            {part.partDrawingUrl && (
              <a
                href={part.partDrawingUrl}
                target="_blank"
                rel="noreferrer"
                className="text-sm text-red-400 hover:text-red-300 underline inline-block mt-1"
              >
                View drawing ↗
              </a>
            )}
          </div>
        )}

        {/* Blueprint */}
        <section className="space-y-3 pt-2 border-t border-gray-800">
          <h2 className="text-lg font-semibold text-gray-200">Process Blueprint</h2>
          {blueprint.length === 0 ? (
            <p className="text-gray-600 text-sm">No processes in the blueprint yet.</p>
          ) : (
            <div className="space-y-2">
              {blueprint.map((bp, pos) => (
                <div
                  key={bp.id}
                  className="flex items-center gap-3 bg-gray-900 border border-gray-800 rounded-lg px-4 py-2.5"
                >
                  <span className="text-gray-600 font-mono text-sm w-5 shrink-0">{pos + 1}</span>
                  <span className="flex-1 text-sm text-gray-200">{processName(bp.processId)}</span>
                  <div className="flex items-center gap-0.5 shrink-0">
                    <button
                      type="button"
                      onClick={() => moveBlueprint(pos, "up")}
                      disabled={pos === 0}
                      className="p-1 text-gray-600 hover:text-gray-300 disabled:opacity-20 leading-none"
                      aria-label="Move up"
                    >
                      ▲
                    </button>
                    <button
                      type="button"
                      onClick={() => moveBlueprint(pos, "down")}
                      disabled={pos === blueprint.length - 1}
                      className="p-1 text-gray-600 hover:text-gray-300 disabled:opacity-20 leading-none"
                      aria-label="Move down"
                    >
                      ▼
                    </button>
                    <button
                      type="button"
                      onClick={() => removeBlueprintProcess(bp.processId)}
                      className="p-1 ml-1 text-gray-600 hover:text-red-400"
                      aria-label="Remove"
                    >
                      ✕
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
          <div className="flex gap-2">
            <select
              value={addProcessId}
              onChange={(e) => setAddProcessId(Number(e.target.value))}
              className="flex-1 bg-gray-800 border border-gray-600 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-red-500"
            >
              <option value={0}>Add a process…</option>
              {availableToAdd.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
            <button
              type="button"
              onClick={addBlueprintProcess}
              disabled={!addProcessId}
              className="px-4 py-2 bg-red-600 hover:bg-red-500 disabled:opacity-40 text-white text-sm font-semibold rounded-lg"
            >
              Add
            </button>
          </div>
          {blueprint.length > 0 && (
            <p className="text-xs text-gray-600">
              Note: blueprint changes only affect instances created afterward.
            </p>
          )}
        </section>

        {/* Instances */}
        <section className="space-y-3 pt-2 border-t border-gray-800">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold text-gray-200">
              Instances{" "}
              <span className="text-gray-600 text-sm font-normal">({instances.length})</span>
            </h2>
            <div className="flex items-center gap-2">
              <input
                type="number"
                min={1}
                value={quantity}
                onChange={(e) => setQuantity(Math.max(1, Number(e.target.value)))}
                className="w-16 bg-gray-800 border border-gray-600 rounded-lg px-2 py-1.5 text-sm text-white focus:outline-none focus:border-red-500 [appearance:textfield]"
              />
              <button
                type="button"
                onClick={createInstances}
                className="px-3 py-1.5 bg-red-600 hover:bg-red-500 text-white text-sm font-semibold rounded-lg"
              >
                + Make
              </button>
            </div>
          </div>

          {instances.length === 0 && (
            <p className="text-gray-600 text-sm">No instances made yet.</p>
          )}

          <div className="space-y-2">
            {instances.map((inst) => {
              const procs = instanceProcs[inst.id];
              const doneCount = procs?.filter((p) => p.status === "done").length ?? 0;
              const total = procs?.length ?? 0;
              return (
                <div
                  key={inst.id}
                  className={`rounded-xl border ${inst.isPriority ? "border-red-700" : "border-gray-800"} bg-gray-900`}
                >
                  <div className="flex items-center gap-3 px-4 py-3">
                    <button
                      type="button"
                      onClick={() => toggleExpand(inst.id)}
                      className="flex items-center gap-3 flex-1 min-w-0 text-left"
                    >
                      <span className="text-base font-bold text-white">#{inst.instanceNumber}</span>
                      {procs && (
                        <span className="text-xs text-gray-500">
                          {doneCount}/{total} done
                        </span>
                      )}
                      {inst.isStale ? (
                        <span className="text-xs px-2 py-0.5 rounded-full bg-yellow-900/40 text-yellow-500">
                          stale
                        </span>
                      ) : null}
                    </button>
                    <button
                      type="button"
                      onClick={() => toggleFlag(inst, "isPriority")}
                      title="Priority"
                      className={`p-1 ${inst.isPriority ? "text-red-400" : "text-gray-600 hover:text-gray-400"}`}
                    >
                      ★
                    </button>
                    <button
                      type="button"
                      onClick={() => toggleFlag(inst, "isStale")}
                      title="Mark stale (CAD changed)"
                      className={`text-xs px-2 py-1 rounded ${inst.isStale ? "bg-yellow-900/40 text-yellow-400" : "bg-gray-800 text-gray-500 hover:text-gray-300"}`}
                    >
                      stale
                    </button>
                    <button
                      type="button"
                      onClick={() => toggleExpand(inst.id)}
                      className="text-gray-500 text-sm"
                    >
                      {expandedId === inst.id ? "▲" : "▼"}
                    </button>
                  </div>

                  {expandedId === inst.id && (
                    <div className="px-4 pb-3 space-y-1.5 border-t border-gray-800 pt-2">
                      {!procs && <p className="text-gray-600 text-sm">Loading…</p>}
                      {procs && procs.length === 0 && (
                        <p className="text-gray-600 text-sm">
                          No processes (blueprint was empty when this was made).
                        </p>
                      )}
                      {procs?.map((proc) => {
                        const meta = STATUS_META[proc.status];
                        return (
                          <div key={proc.id} className="flex items-center gap-3">
                            <span className="text-gray-600 font-mono text-xs w-4 shrink-0">
                              {proc.index + 1}
                            </span>
                            <span className="flex-1 text-sm text-gray-200">
                              {processName(proc.processId)}
                            </span>
                            <span className={`text-xs px-2 py-0.5 rounded-full border ${meta.cls}`}>
                              {meta.label}
                            </span>
                            {proc.status === "todo" && (
                              <button
                                type="button"
                                onClick={() => advanceProcess(inst.id, proc, "doing")}
                                className="text-xs px-2 py-1 bg-yellow-700 hover:bg-yellow-600 text-white rounded font-semibold"
                              >
                                Start
                              </button>
                            )}
                            {proc.status === "doing" && (
                              <button
                                type="button"
                                onClick={() => advanceProcess(inst.id, proc, "done")}
                                className="text-xs px-2 py-1 bg-green-700 hover:bg-green-600 text-white rounded font-semibold"
                              >
                                Done
                              </button>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </section>
      </div>
    </main>
  );
}

function EditField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <div className="space-y-1">
      <span className="text-xs font-medium text-gray-400">{label}</span>
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full bg-gray-800 border border-gray-600 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-red-500"
      />
    </div>
  );
}
