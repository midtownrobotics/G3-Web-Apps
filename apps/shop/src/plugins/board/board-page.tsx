import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "../../shared/api";
import { getErrorMessage } from "../../shared/api-error";
import {
  fetchAllInstances,
  fetchPartDefinitions,
  fetchProcessQueue,
  fetchProcesses,
} from "../../shared/getters";
import type {
  PartDefinition,
  PartInstance,
  PartInstanceProcess,
  Process,
} from "../../shared/types";

export function BoardPage() {
  const navigate = useNavigate();
  const [processes, setProcesses] = useState<Process[]>([]);
  const [parts, setParts] = useState<PartDefinition[]>([]);
  const [instances, setInstances] = useState<PartInstance[]>([]);
  const [selectedProcessId, setSelectedProcessId] = useState<number | null>(null);
  const [queue, setQueue] = useState<PartInstanceProcess[]>([]);
  const [loading, setLoading] = useState(true);
  const [banner, setBanner] = useState<string | null>(null);

  const partById = useMemo(() => new Map(parts.map((p) => [p.id, p])), [parts]);
  const instById = useMemo(() => new Map(instances.map((i) => [i.id, i])), [instances]);

  useEffect(() => {
    Promise.all([fetchProcesses(), fetchPartDefinitions(), fetchAllInstances()])
      .then(([procs, defs, insts]) => {
        setProcesses(procs);
        setParts(defs);
        setInstances(insts);
        if (procs.length > 0) setSelectedProcessId(procs[0].id);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    if (selectedProcessId !== null) loadQueue(selectedProcessId);
  }, [selectedProcessId]);

  async function loadQueue(processId: number) {
    try {
      const rows = await fetchProcessQueue(processId);
      setQueue(rows.filter((r) => r.status === "todo" || r.status === "doing"));
    } catch {}
  }

  async function advance(proc: PartInstanceProcess, to: "doing" | "done") {
    const res = await api["part-instance-processes"][":partInstanceId"].processes[":processId"][
      to
    ].$post({
      param: { partInstanceId: String(proc.partInstanceId), processId: String(proc.processId) },
    });
    if (!res.ok) {
      setBanner(await getErrorMessage(res as unknown as Response));
      return;
    }
    if (selectedProcessId !== null) await loadQueue(selectedProcessId);
  }

  function label(proc: PartInstanceProcess): { name: string; sub: string; partId: number | null } {
    const inst = instById.get(proc.partInstanceId);
    if (!inst) return { name: `Instance ${proc.partInstanceId}`, sub: "", partId: null };
    const part = partById.get(inst.partDefinitionId);
    return {
      name: part ? part.name : `Part ${inst.partDefinitionId}`,
      sub: part
        ? `${part.onshapePartNumber} · Rev ${part.revision} · #${inst.instanceNumber}`
        : `#${inst.instanceNumber}`,
      partId: part?.id ?? null,
    };
  }

  if (loading) {
    return (
      <main className="min-h-screen bg-gray-950 flex items-center justify-center">
        <p className="text-gray-400">Loading…</p>
      </main>
    );
  }

  const todo = queue.filter((q) => q.status === "todo");
  const doing = queue.filter((q) => q.status === "doing");

  return (
    <main className="min-h-screen bg-gray-950 text-white">
      <div className="max-w-3xl mx-auto px-4 py-8 space-y-6">
        <h1 className="text-3xl font-bold tracking-tight">Shop Floor</h1>

        {banner && (
          <p className="text-red-400 text-sm bg-red-950 border border-red-800 rounded-lg px-4 py-2">
            {banner}
          </p>
        )}

        {processes.length === 0 ? (
          <p className="text-gray-500 text-center py-12">
            No processes defined.{" "}
            <button
              type="button"
              onClick={() => navigate("/settings")}
              className="text-red-400 hover:text-red-300 underline"
            >
              Add some in Settings.
            </button>
          </p>
        ) : (
          <>
            {/* Process selector */}
            <div className="flex flex-wrap gap-2">
              {processes.map((p) => (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => setSelectedProcessId(p.id)}
                  className={`px-3 py-1.5 text-sm font-semibold rounded-lg border transition-colors ${
                    selectedProcessId === p.id
                      ? "bg-red-600 border-red-500 text-white"
                      : "bg-gray-800 border-gray-700 text-gray-300 hover:border-gray-500"
                  }`}
                >
                  {p.name}
                </button>
              ))}
            </div>

            {/* Two columns: In Progress + Up Next */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
              <Column title="In Progress" count={doing.length} accent="text-yellow-400">
                {doing.length === 0 && <Empty />}
                {doing.map((proc) => {
                  const l = label(proc);
                  return (
                    <Card
                      key={proc.id}
                      l={l}
                      onPart={() => l.partId && navigate(`/parts/${l.partId}`)}
                    >
                      <button
                        type="button"
                        onClick={() => advance(proc, "done")}
                        className="text-xs px-3 py-1.5 bg-green-700 hover:bg-green-600 text-white rounded-lg font-semibold shrink-0"
                      >
                        Done
                      </button>
                    </Card>
                  );
                })}
              </Column>

              <Column title="Up Next" count={todo.length} accent="text-blue-400">
                {todo.length === 0 && <Empty />}
                {todo.map((proc) => {
                  const l = label(proc);
                  return (
                    <Card
                      key={proc.id}
                      l={l}
                      onPart={() => l.partId && navigate(`/parts/${l.partId}`)}
                    >
                      <button
                        type="button"
                        onClick={() => advance(proc, "doing")}
                        className="text-xs px-3 py-1.5 bg-yellow-700 hover:bg-yellow-600 text-white rounded-lg font-semibold shrink-0"
                      >
                        Start
                      </button>
                    </Card>
                  );
                })}
              </Column>
            </div>
          </>
        )}
      </div>
    </main>
  );
}

function Column({
  title,
  count,
  accent,
  children,
}: {
  title: string;
  count: number;
  accent: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-2">
      <h2 className="text-xs font-bold uppercase tracking-widest text-gray-500">
        {title} <span className={accent}>{count}</span>
      </h2>
      <div className="space-y-2">{children}</div>
    </div>
  );
}

function Card({
  l,
  onPart,
  children,
}: {
  l: { name: string; sub: string };
  onPart: () => void;
  children: React.ReactNode;
}) {
  return (
    <div className="flex items-center gap-3 bg-gray-900 border border-gray-800 rounded-xl px-4 py-3">
      <button type="button" onClick={onPart} className="flex-1 min-w-0 text-left">
        <p className="text-sm font-semibold text-white truncate">{l.name}</p>
        <p className="text-xs text-gray-500 font-mono truncate">{l.sub}</p>
      </button>
      {children}
    </div>
  );
}

function Empty() {
  return <p className="text-gray-700 text-sm">Nothing here.</p>;
}
