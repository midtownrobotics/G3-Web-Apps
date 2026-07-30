import { useEffect, useState } from "react";
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

        {/* Section 4: OnShape Configuration */}
        <Section title="OnShape Configuration" defaultOpen={false}>
          {data ? <OnShapeConfig /> : <p className="text-sm text-steel">Loading…</p>}
        </Section>

        {/* Section 5: Slack Configuration */}
        <Section title="Slack Configuration" defaultOpen={false}>
          <SlackSettings />
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

function OnShapeConfig() {
  const [documentId, setDocumentId] = useState("");
  const [mainAssemblyId, setMainAssemblyId] = useState("");
  const [urlInput, setUrlInput] = useState("");
  const [saving, setSaving] = useState(false);
  const [banner, setBanner] = useState<string | null>(null);

  function parseUrl() {
    // Format: https://cad.onshape.com/documents/[DOCID]/[not used]/[not used]/e/[MAINASSEMBLYID]
    const match = urlInput.match(/\/documents\/([^/]+)\/[^/]*\/[^/]*\/e\/([^/?]+)/);
    if (!match) {
      setBanner(
        "Invalid URL format. Expected: https://cad.onshape.com/documents/[DOCID]/[...]/e/[MAINASSEMBLYID]",
      );
      return;
    }

    const [, docId, assemblyId] = match;
    setDocumentId(docId);
    setMainAssemblyId(assemblyId);
    setUrlInput("");
    setBanner(null);
  }

  async function loadConfig() {
    try {
      // biome-ignore lint/suspicious/noExplicitAny: workaround for Hono client type generation
      const res = await (api as any).admin.onshape.config.$get();
      if (!res.ok) {
        setBanner(await getErrorMessage(res as unknown as Response));
        return;
      }
      const config = (await res.json()) as { documentId: string; mainAssemblyId: string };
      setDocumentId(config.documentId || "");
      setMainAssemblyId(config.mainAssemblyId || "");
    } catch (err) {
      setBanner(err instanceof Error ? err.message : "Failed to load OnShape config");
    }
  }

  async function handleSave() {
    if (!documentId.trim()) {
      setBanner("Document ID is required");
      return;
    }

    setSaving(true);
    try {
      // biome-ignore lint/suspicious/noExplicitAny: workaround for Hono client type generation
      const res = await (api as any).admin.onshape.config.$post({
        json: {
          documentId: documentId.trim(),
          mainAssemblyId: mainAssemblyId.trim() || undefined,
        },
      });

      if (!res.ok) {
        setBanner(await getErrorMessage(res as unknown as Response));
        return;
      }

      setBanner(null);
      await loadConfig();
    } catch (err) {
      setBanner(err instanceof Error ? err.message : "Failed to save config");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-4 max-w-xl">
      {banner && (
        <div
          className={`text-sm rounded-lg px-3 py-2 ${
            banner.includes("Failed") || banner.includes("required") || banner.includes("Invalid")
              ? "text-crimson-dark bg-crimson-50 border border-crimson-200"
              : "text-emerald-700 bg-emerald-50 border border-emerald-300"
          }`}
        >
          {banner}
        </div>
      )}

      <div className="p-3 bg-mist rounded-lg border border-steel/25 space-y-2">
        <p className="text-xs font-medium text-steel-dark">Quick Add from URL</p>
        <div className="flex gap-2">
          <input
            type="text"
            value={urlInput}
            onChange={(e) => setUrlInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") parseUrl();
            }}
            placeholder="https://cad.onshape.com/documents/[...]/e/[...]"
            className="flex-1 bg-paper border border-steel/40 rounded-lg px-3 py-2 text-sm text-ink placeholder-steel focus:outline-none focus:border-crimson"
          />
          <button
            type="button"
            onClick={parseUrl}
            className="px-3 py-2 bg-paper border border-steel/40 hover:bg-steel-tint text-ink text-sm font-medium rounded-lg transition-colors"
          >
            Parse
          </button>
        </div>
      </div>

      <div className="space-y-1">
        <label htmlFor="doc-id" className="text-xs font-medium text-steel-dark">
          Document ID *
        </label>
        <input
          id="doc-id"
          type="text"
          value={documentId}
          onChange={(e) => setDocumentId(e.target.value)}
          placeholder="e.g. abc123def456"
          className="w-full bg-paper border border-steel/40 rounded-lg px-3 py-2 text-sm text-ink placeholder-steel focus:outline-none focus:border-crimson"
        />
        <p className="text-xs text-steel">
          From OnShape URL: cad.onshape.com/documents/[DOCUMENT_ID]/...
        </p>
      </div>

      <div className="space-y-1">
        <label htmlFor="main-asm-id" className="text-xs font-medium text-steel-dark">
          Main Assembly ID
        </label>
        <input
          id="main-asm-id"
          type="text"
          value={mainAssemblyId}
          onChange={(e) => setMainAssemblyId(e.target.value)}
          placeholder="e.g. xyz789 (optional)"
          className="w-full bg-paper border border-steel/40 rounded-lg px-3 py-2 text-sm text-ink placeholder-steel focus:outline-none focus:border-crimson"
        />
        <p className="text-xs text-steel">Optional — usually not needed for drawing exports</p>
      </div>

      <div className="flex gap-2 pt-2">
        <button
          type="button"
          onClick={loadConfig}
          className="px-4 py-2 bg-steel-tint hover:bg-steel/30 text-steel-dark text-sm font-medium rounded-lg transition-colors"
        >
          Load Current
        </button>
        <button
          type="button"
          onClick={handleSave}
          disabled={saving}
          className="px-4 py-2 bg-crimson hover:bg-crimson-dark disabled:opacity-50 text-paper text-sm font-semibold rounded-lg transition-colors"
        >
          {saving ? "Saving…" : "Save"}
        </button>
      </div>
    </div>
  );
}

function SlackSettings() {
  const [channelId, setChannelId] = useState("");
  const [saving, setSaving] = useState(false);
  const [banner, setBanner] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    loadConfig();
  }, []);

  async function loadConfig() {
    try {
      // biome-ignore lint/suspicious/noExplicitAny: workaround for Hono client type generation
      const res = await (api as any).admin.slack.config.$get();
      if (!res.ok) {
        setBanner(await getErrorMessage(res as unknown as Response));
        return;
      }
      const config = (await res.json()) as { slackReleaseChannelId: string };
      setChannelId(config.slackReleaseChannelId || "");
      setBanner(null);
      setLoaded(true);
    } catch (err) {
      setBanner(err instanceof Error ? err.message : "Failed to load Slack config");
    }
  }

  async function handleSave() {
    if (!channelId.trim()) {
      setBanner("Slack channel ID is required");
      return;
    }

    setSaving(true);
    try {
      // biome-ignore lint/suspicious/noExplicitAny: workaround for Hono client type generation
      const res = await (api as any).admin.slack.config.$post({
        json: {
          slackReleaseChannelId: channelId.trim(),
        },
      });

      if (!res.ok) {
        setBanner(await getErrorMessage(res as unknown as Response));
        return;
      }

      setBanner("Slack channel ID updated successfully");
      setTimeout(() => setBanner(null), 3000);
    } catch (err) {
      setBanner(err instanceof Error ? err.message : "Failed to save config");
    } finally {
      setSaving(false);
    }
  }

  if (!loaded) {
    return <p className="text-sm text-steel">Loading…</p>;
  }

  return (
    <div className="space-y-4 max-w-xl">
      {banner && (
        <div
          className={`text-sm rounded-lg px-3 py-2 ${
            banner.includes("successfully")
              ? "text-emerald-700 bg-emerald-50 border border-emerald-300"
              : "text-crimson-dark bg-crimson-50 border border-crimson-200"
          }`}
        >
          {banner}
        </div>
      )}

      <div className="space-y-1">
        <label htmlFor="channel-id" className="text-xs font-medium text-steel-dark">
          Release Notification Channel ID *
        </label>
        <input
          id="channel-id"
          type="text"
          value={channelId}
          onChange={(e) => setChannelId(e.target.value)}
          placeholder="e.g. C09QYMTSGKT"
          className="w-full bg-paper border border-steel/40 rounded-lg px-3 py-2 text-sm text-ink placeholder-steel focus:outline-none focus:border-crimson"
        />
        <p className="text-xs text-steel">
          The Slack channel ID where release notifications are sent. Find it by clicking on the
          channel name in Slack.
        </p>
      </div>

      <div className="flex gap-2 pt-2">
        <button
          type="button"
          onClick={loadConfig}
          className="px-4 py-2 bg-steel-tint hover:bg-steel/30 text-steel-dark text-sm font-medium rounded-lg transition-colors"
        >
          Reload
        </button>
        <button
          type="button"
          onClick={handleSave}
          disabled={saving}
          className="px-4 py-2 bg-crimson hover:bg-crimson-dark disabled:opacity-50 text-paper text-sm font-semibold rounded-lg transition-colors"
        >
          {saving ? "Saving…" : "Save"}
        </button>
      </div>
    </div>
  );
}
