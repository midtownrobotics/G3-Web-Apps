import { useState } from "react";
import { api } from "../../shared/api";
import { getErrorMessage } from "../../shared/api-error";
import { ErrorBanner, PageLoading } from "../../shared/ui";
import { useShopData } from "../../shared/use-shop-data";

/** Processes every shop has; they can't be removed. */
const DEFAULT_PROCESSES = ["Mill", "CNC Router", "Lathe", "Miter Saw"];

export function AdminPage() {
  const { data, loading, error, refresh } = useShopData();
  const [banner, setBanner] = useState<string | null>(null);

  const [newSubsystem, setNewSubsystem] = useState("");
  const [newProcess, setNewProcess] = useState("");

  async function addSubsystem() {
    if (!newSubsystem.trim()) return;
    const res = await api.subsystems.$post({ json: { name: newSubsystem.trim() } });
    if (!res.ok) {
      setBanner(await getErrorMessage(res as unknown as Response));
      return;
    }
    setNewSubsystem("");
    setBanner(null);
    await refresh();
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
    await refresh();
  }

  if (loading) return <PageLoading />;

  const defById = new Map((data?.definitions ?? []).map((d) => [d.id, d]));
  const staleInstances = (data?.instances ?? []).filter((i) => i.isStale);
  const subsystemName = (sid: number) =>
    data?.subsystems.find((s) => s.id === sid)?.name ?? "—";

  return (
    <main className="min-h-screen bg-mist">
      <div className="max-w-4xl mx-auto px-6 py-8 space-y-5">
        <h1 className="font-display text-4xl text-ink">Admin</h1>

        {error && <ErrorBanner message={error} />}
        {banner && <ErrorBanner message={banner} />}

        {/* Section 1: Part Management */}
        <Section title="Part Management">
          {staleInstances.length === 0 ? (
            <p className="text-sm text-steel">No stale parts. Everything is current.</p>
          ) : (
            <div className="border border-steel/25 rounded-lg divide-y divide-steel/15">
              <div className="flex items-center gap-3 px-4 py-2 bg-mist text-xs font-semibold uppercase tracking-wider text-steel">
                <span className="flex-1">Part</span>
                <span className="w-40 hidden sm:block">Number / Rev</span>
                <span className="w-28 hidden md:block">Subsystem</span>
                <span className="w-44 text-right">Actions</span>
              </div>
              {staleInstances.map((inst) => {
                const def = defById.get(inst.partDefinitionId);
                return (
                  <div key={inst.id} className="flex items-center gap-3 px-4 py-2.5">
                    <span className="flex-1 min-w-0 text-sm font-medium text-ink truncate">
                      {def?.name ?? `Part ${inst.partDefinitionId}`}
                      <span className="text-steel font-normal ml-1.5">
                        #{inst.instanceNumber}
                      </span>
                    </span>
                    <span className="w-40 hidden sm:block text-sm font-mono text-steel-dark truncate">
                      {def ? `${def.onshapePartNumber} · Rev ${def.revision}` : "—"}
                    </span>
                    <span className="w-28 hidden md:block text-sm text-steel-dark truncate">
                      {def ? subsystemName(def.subsystemId) : "—"}
                    </span>
                    <span className="w-44 flex justify-end gap-2 shrink-0">
                      <button
                        type="button"
                        disabled
                        title="Coming soon"
                        className="text-xs px-2.5 py-1.5 rounded-lg border border-steel/40 text-steel cursor-not-allowed"
                      >
                        Archive
                      </button>
                      <button
                        type="button"
                        disabled
                        title="Coming soon"
                        className="text-xs px-2.5 py-1.5 rounded-lg border border-steel/40 text-steel cursor-not-allowed"
                      >
                        Transfer Processes
                      </button>
                    </span>
                  </div>
                );
              })}
            </div>
          )}
        </Section>

        {/* Section 2: Shop Settings */}
        <Section title="Shop Settings">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <NameList
              title="Subsystems"
              items={(data?.subsystems ?? []).map((s) => ({ id: s.id, name: s.name }))}
              draft={newSubsystem}
              setDraft={setNewSubsystem}
              onAdd={addSubsystem}
              placeholder="New subsystem"
            />
            <NameList
              title="Processes"
              items={(data?.processes ?? []).map((p) => ({
                id: p.id,
                name: p.name,
                isDefault: DEFAULT_PROCESSES.includes(p.name),
              }))}
              draft={newProcess}
              setDraft={setNewProcess}
              onAdd={addProcess}
              placeholder="New process (e.g. Welding)"
            />
          </div>
        </Section>

        {/* Section 3: Admin Settings */}
        <Section title="Admin Settings" defaultOpen={false}>
          <p className="text-sm text-steel">Nothing here yet.</p>
        </Section>
      </div>
    </main>
  );
}

function Section({
  title,
  defaultOpen = true,
  children,
}: {
  title: string;
  defaultOpen?: boolean;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <section className="bg-paper border border-steel/30 rounded-xl">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="w-full flex items-center justify-between px-5 py-3.5 text-left"
      >
        <span className="font-display text-2xl text-ink">{title}</span>
        <span className={`text-steel text-sm transition-transform ${open ? "rotate-180" : ""}`}>
          ▼
        </span>
      </button>
      {open && <div className="px-5 pb-5">{children}</div>}
    </section>
  );
}

function NameList({
  title,
  items,
  draft,
  setDraft,
  onAdd,
  placeholder,
}: {
  title: string;
  items: { id: number; name: string; isDefault?: boolean }[];
  draft: string;
  setDraft: (v: string) => void;
  onAdd: () => void;
  placeholder: string;
}) {
  return (
    <div className="space-y-3">
      <h3 className="text-sm font-bold uppercase tracking-wider text-steel-dark">
        {title} <span className="text-steel font-normal">({items.length})</span>
      </h3>
      <div className="flex gap-2">
        <input
          type="text"
          placeholder={placeholder}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") onAdd();
          }}
          className="flex-1 bg-paper border border-steel/40 rounded-lg px-3 py-2 text-sm text-ink placeholder-steel focus:outline-none focus:border-crimson"
        />
        <button
          type="button"
          onClick={onAdd}
          className="px-3.5 py-2 bg-crimson hover:bg-crimson-dark text-paper text-sm font-semibold rounded-lg transition-colors"
        >
          Add
        </button>
      </div>
      <div className="space-y-1.5">
        {items.length === 0 && <p className="text-steel text-sm">None yet.</p>}
        {items.map((item) => (
          <div
            key={item.id}
            className="flex items-center gap-2 bg-mist border border-steel/20 rounded-lg px-3.5 py-2 text-sm text-ink"
          >
            <span className="flex-1 truncate">{item.name}</span>
            {item.isDefault ? (
              <span className="text-[10px] font-semibold uppercase tracking-wider text-steel bg-steel-tint border border-steel/30 rounded-full px-2 py-0.5">
                Default
              </span>
            ) : (
              <button
                type="button"
                disabled
                title="Removal isn't available yet"
                className="text-steel/50 cursor-not-allowed px-1"
                aria-label={`Remove ${item.name}`}
              >
                ✕
              </button>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
