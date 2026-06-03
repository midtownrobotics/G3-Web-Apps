import { useEffect, useState } from "react";
import { api } from "../../shared/api";
import { getErrorMessage } from "../../shared/api-error";
import { fetchProcesses, fetchSubsystems } from "../../shared/getters";
import type { Process, Subsystem } from "../../shared/types";

export function SettingsPage() {
  const [subsystems, setSubsystems] = useState<Subsystem[]>([]);
  const [processes, setProcesses] = useState<Process[]>([]);
  const [loading, setLoading] = useState(true);
  const [banner, setBanner] = useState<string | null>(null);

  const [newSubsystem, setNewSubsystem] = useState("");
  const [newProcess, setNewProcess] = useState("");

  async function load() {
    try {
      const [s, p] = await Promise.all([fetchSubsystems(), fetchProcesses()]);
      setSubsystems(s);
      setProcesses(p);
    } catch {}
    setLoading(false);
  }

  // biome-ignore lint/correctness/useExhaustiveDependencies: load is stable
  useEffect(() => {
    load();
  }, []);

  async function addSubsystem() {
    if (!newSubsystem.trim()) return;
    const res = await api.subsystems.$post({ json: { name: newSubsystem.trim() } });
    if (!res.ok) {
      setBanner(await getErrorMessage(res as unknown as Response));
      return;
    }
    setNewSubsystem("");
    setBanner(null);
    await load();
  }

  async function addProcess() {
    if (!newProcess.trim()) return;
    const res = await api.processes.$post({ json: { name: newProcess.trim() } });
    if (!res.ok) {
      setBanner(await getErrorMessage(res as unknown as Response));
      return;
    }
    setNewProcess("");
    setBanner(null);
    await load();
  }

  if (loading) {
    return (
      <main className="min-h-screen bg-gray-950 flex items-center justify-center">
        <p className="text-gray-400">Loading…</p>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-gray-950 text-white">
      <div className="max-w-3xl mx-auto px-4 py-8 space-y-8">
        <h1 className="text-3xl font-bold tracking-tight">Settings</h1>

        {banner && (
          <p className="text-red-400 text-sm bg-red-950 border border-red-800 rounded-lg px-4 py-2">
            {banner}
          </p>
        )}

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* Subsystems */}
          <section className="space-y-3">
            <h2 className="text-lg font-semibold text-gray-200">
              Subsystems{" "}
              <span className="text-gray-600 text-sm font-normal">({subsystems.length})</span>
            </h2>
            <div className="flex gap-2">
              <input
                type="text"
                placeholder="New subsystem"
                value={newSubsystem}
                onChange={(e) => setNewSubsystem(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") addSubsystem();
                }}
                className="flex-1 bg-gray-800 border border-gray-600 rounded-lg px-3 py-2 text-sm text-white placeholder-gray-500 focus:outline-none focus:border-red-500"
              />
              <button
                type="button"
                onClick={addSubsystem}
                className="px-3 py-2 bg-red-600 hover:bg-red-500 text-white text-sm font-semibold rounded-lg"
              >
                Add
              </button>
            </div>
            <div className="space-y-2">
              {subsystems.length === 0 && (
                <p className="text-gray-600 text-sm">No subsystems yet.</p>
              )}
              {subsystems.map((s) => (
                <div
                  key={s.id}
                  className="bg-gray-900 border border-gray-800 rounded-lg px-4 py-2.5 text-sm text-gray-200"
                >
                  {s.name}
                </div>
              ))}
            </div>
          </section>

          {/* Processes */}
          <section className="space-y-3">
            <h2 className="text-lg font-semibold text-gray-200">
              Processes{" "}
              <span className="text-gray-600 text-sm font-normal">({processes.length})</span>
            </h2>
            <div className="flex gap-2">
              <input
                type="text"
                placeholder="New process (e.g. Mill)"
                value={newProcess}
                onChange={(e) => setNewProcess(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") addProcess();
                }}
                className="flex-1 bg-gray-800 border border-gray-600 rounded-lg px-3 py-2 text-sm text-white placeholder-gray-500 focus:outline-none focus:border-red-500"
              />
              <button
                type="button"
                onClick={addProcess}
                className="px-3 py-2 bg-red-600 hover:bg-red-500 text-white text-sm font-semibold rounded-lg"
              >
                Add
              </button>
            </div>
            <div className="space-y-2">
              {processes.length === 0 && <p className="text-gray-600 text-sm">No processes yet.</p>}
              {processes.map((p) => (
                <div
                  key={p.id}
                  className="bg-gray-900 border border-gray-800 rounded-lg px-4 py-2.5 text-sm text-gray-200"
                >
                  {p.name}
                </div>
              ))}
            </div>
          </section>
        </div>
      </div>
    </main>
  );
}
