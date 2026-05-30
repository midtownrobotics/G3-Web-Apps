import { useEffect, useState } from "react";
import { api } from "../../shared/api";
import { getErrorMessage } from "../../shared/api-error";
import { useAuth } from "../../shared/use-auth";

export function AdminPage() {
  const { user, loading: authLoading } = useAuth();

  const [eventKey, setEventKey] = useState("");
  const [teamNumber, setTeamNumber] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [banner, setBanner] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  const isAdmin = user?.isAdmin === true;

  useEffect(() => {
    if (!isAdmin) {
      setLoading(false);
      return;
    }
    api.admin.settings
      .$get()
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (data) {
          setEventKey(data.eventKey);
          setTeamNumber(data.teamNumber);
        }
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [isAdmin]);

  async function handleSave() {
    setSaving(true);
    setSaved(false);
    const res = await api.admin.settings["event-key"].$patch({
      json: { eventKey: eventKey.trim() },
    });
    setSaving(false);
    if (!res.ok) {
      setBanner(await getErrorMessage(res as unknown as Response));
      return;
    }
    setBanner(null);
    setSaved(true);
  }

  if (authLoading || loading) {
    return (
      <main className="min-h-screen bg-gray-950 flex items-center justify-center">
        <p className="text-gray-500">Loading…</p>
      </main>
    );
  }

  if (!isAdmin) {
    return (
      <main className="min-h-screen bg-gray-950 flex flex-col items-center justify-center gap-2">
        <p className="text-gray-300 text-lg font-semibold">Access denied</p>
        <p className="text-gray-600 text-sm">You must be an admin to view this page.</p>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-gray-950 text-white">
      <div className="max-w-2xl mx-auto px-4 py-8 space-y-6">
        <h1 className="text-3xl font-bold tracking-tight">Admin</h1>

        {banner && (
          <p className="text-red-400 text-sm bg-red-950 border border-red-800 rounded-lg px-4 py-2">
            {banner}
          </p>
        )}

        <div className="bg-gray-900 rounded-xl border border-gray-700 p-5 space-y-4">
          <div>
            <h2 className="text-lg font-semibold text-gray-200">Event Configuration</h2>
            <p className="text-sm text-gray-500 mt-0.5">
              Team {teamNumber}. Used by the Pit Monitor for Nexus, TBA, and Statbotics data.
            </p>
          </div>

          <div className="space-y-1.5">
            <label htmlFor="event-key" className="text-sm font-medium text-gray-400">
              Event Key
            </label>
            <input
              id="event-key"
              type="text"
              placeholder="e.g. 2026gacmp"
              value={eventKey}
              onChange={(e) => {
                setEventKey(e.target.value);
                setSaved(false);
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter") handleSave();
              }}
              className="w-full bg-gray-800 border border-gray-600 rounded-lg px-3 py-2 text-sm text-white placeholder-gray-500 focus:outline-none focus:border-red-500 font-mono"
            />
            <p className="text-xs text-gray-600">
              The Blue Alliance event key (year + event code). Leave blank to disable monitor data.
            </p>
          </div>

          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={handleSave}
              disabled={saving}
              className="px-4 py-2 bg-red-600 hover:bg-red-500 disabled:opacity-50 text-white text-sm font-semibold rounded-lg transition-colors"
            >
              {saving ? "Saving…" : "Save"}
            </button>
            {saved && <span className="text-green-400 text-sm">Saved ✓</span>}
          </div>
        </div>
      </div>
    </main>
  );
}
