import { useState } from "react";
import { api } from "../../shared/api";
import { getErrorMessage } from "../../shared/api-error";
import { enableKioskMode } from "../../shared/kiosk";
import { ErrorBanner, PageLoading } from "../../shared/ui";
import { useShopData } from "../../shared/use-shop-data";
import { ActionsLog } from "./actions-log";

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

  return (
    <main className="min-h-screen bg-mist">
      <div className="max-w-4xl mx-auto px-6 py-8 space-y-5">
        <h1 className="font-display text-4xl text-ink">Admin</h1>

        {error && <ErrorBanner message={error} />}
        {banner && <ErrorBanner message={banner} />}

        {/* Section 1: Actions Log */}
        <Section title="Actions Log">
          {data ? (
            <ActionsLog data={data} />
          ) : (
            <p className="text-sm text-steel">Loading shop data…</p>
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
              }))}
              draft={newProcess}
              setDraft={setNewProcess}
              onAdd={addProcess}
              placeholder="New process (e.g. Welding)"
            />
          </div>
        </Section>

        {/* Section 3: Kiosk Mode */}
        <Section title="Kiosk Mode" defaultOpen={false}>
          <KioskModeSettings />
        </Section>

        {/* Section 4: Admin Settings */}
        <Section title="Admin Settings" defaultOpen={false}>
          <p className="text-sm text-steel">Nothing here yet.</p>
        </Section>
      </div>
    </main>
  );
}

function KioskModeSettings() {
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);

  return (
    <div className="space-y-3 max-w-xl">
      <p className="text-sm text-steel-dark">
        Kiosk mode turns this device into a shared shop-floor station. It logs out the current
        account, sends the device through G3ID kiosk activation, and users then sign in with their
        3-digit PIN. Name the kiosk after a machine (e.g. a process like “Mill”) and the app will
        auto-open that machine's queue and show machine-specific stats.
      </p>
      {confirming ? (
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-sm font-medium text-ink">
            You'll be logged out on this device. Continue?
          </span>
          <button
            type="button"
            disabled={busy}
            onClick={() => {
              setBusy(true);
              enableKioskMode();
            }}
            className="px-3.5 py-2 bg-crimson hover:bg-crimson-dark text-paper text-sm font-semibold rounded-lg transition-colors disabled:opacity-50"
          >
            {busy ? "Switching…" : "Yes, enable kiosk mode"}
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={() => setConfirming(false)}
            className="px-3.5 py-2 bg-steel-tint hover:bg-steel/30 text-steel-dark text-sm font-medium rounded-lg transition-colors"
          >
            Cancel
          </button>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => setConfirming(true)}
          className="px-3.5 py-2 bg-crimson hover:bg-crimson-dark text-paper text-sm font-semibold rounded-lg transition-colors"
        >
          Enable Kiosk Mode on This Device
        </button>
      )}
    </div>
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
  items: { id: number; name: string }[];
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
            <button
              type="button"
              disabled
              title="Removal isn't available yet"
              className="text-steel/50 cursor-not-allowed px-1"
              aria-label={`Remove ${item.name}`}
            >
              ✕
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}
