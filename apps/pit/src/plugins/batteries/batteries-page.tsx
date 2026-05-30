import { useEffect, useRef, useState } from "react";
import { api } from "../../shared/api";
import { getErrorMessage } from "../../shared/api-error";
import { fetchBatteries } from "../../shared/getters/batteries";
import type { Battery, BatteryState } from "../../shared/getters/types";

const POLL_INTERVAL_MS = 3000;

const STATE_META: Record<
  BatteryState,
  { label: string; color: string; bg: string; border: string }
> = {
  Charging: {
    label: "Charging",
    color: "text-blue-400",
    bg: "bg-blue-900/30",
    border: "border-blue-700",
  },
  "In Robot": {
    label: "In Robot",
    color: "text-red-400",
    bg: "bg-red-900/30",
    border: "border-red-700",
  },
  Idle: { label: "Idle", color: "text-gray-400", bg: "bg-gray-800", border: "border-gray-600" },
  Broken: {
    label: "Broken",
    color: "text-yellow-400",
    bg: "bg-yellow-900/30",
    border: "border-yellow-700",
  },
};

const STATES: BatteryState[] = ["Charging", "In Robot", "Idle", "Broken"];

const STATE_BTN: Record<BatteryState, string> = {
  Charging: "bg-blue-700 hover:bg-blue-600 text-white",
  "In Robot": "bg-red-700 hover:bg-red-600 text-white",
  Idle: "bg-gray-700 hover:bg-gray-600 text-white",
  Broken: "bg-yellow-700 hover:bg-yellow-600 text-white",
};

function voltageColor(v: number): string {
  if (v >= 12.5) return "text-green-400";
  if (v >= 12.0) return "text-yellow-400";
  return "text-red-400";
}

function formatElapsed(sinceMs: number): string {
  const ms = Date.now() - sinceMs;
  const totalMinutes = Math.floor(ms / 60000);
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  if (hours > 0) return `${hours}h ${minutes}m`;
  if (minutes > 0) return `${minutes}m`;
  return "just now";
}

export function BatteriesPage() {
  const [batteries, setBatteries] = useState<Battery[]>([]);
  const [loading, setLoading] = useState(true);
  const [banner, setBanner] = useState<string | null>(null);

  const [adding, setAdding] = useState(false);
  const [newName, setNewName] = useState("");
  const [addError, setAddError] = useState("");

  const [confirmDeleteId, setConfirmDeleteId] = useState<number | null>(null);
  const [editingVoltageId, setEditingVoltageId] = useState<number | null>(null);
  const [voltageInput, setVoltageInput] = useState("");

  const voltageInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    fetchBatteries()
      .then(setBatteries)
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    if (loading) return;
    const interval = setInterval(() => {
      fetchBatteries()
        .then(setBatteries)
        .catch(() => {});
    }, POLL_INTERVAL_MS);
    return () => clearInterval(interval);
  }, [loading]);

  useEffect(() => {
    if (editingVoltageId !== null) voltageInputRef.current?.focus();
  }, [editingVoltageId]);

  async function handleAddBattery() {
    if (!newName.trim()) {
      setAddError("Name is required.");
      return;
    }
    const res = await api.batteries.$post({ json: { name: newName.trim() } });
    if (!res.ok) {
      setBanner(await getErrorMessage(res as unknown as Response));
      return;
    }
    setAdding(false);
    setNewName("");
    setAddError("");
    setBanner(null);
    fetchBatteries()
      .then(setBatteries)
      .catch(() => {});
  }

  async function handleDeleteBattery(id: number) {
    setBatteries((prev) => prev.filter((b) => b.id !== id));
    setConfirmDeleteId(null);
    const res = await api.batteries[":id"].$delete({ param: { id: String(id) } });
    if (!res.ok) {
      setBanner(await getErrorMessage(res as unknown as Response));
      fetchBatteries()
        .then(setBatteries)
        .catch(() => {});
    }
  }

  async function handleSetState(battery: Battery, state: BatteryState) {
    if (battery.state === state) return;
    setBatteries((prev) =>
      prev.map((b) =>
        b.id === battery.id ? { ...b, state, stateSince: Date.now(), voltage: null } : b,
      ),
    );
    const res = await api.batteries[":id"].state.$patch({
      param: { id: String(battery.id) },
      json: { state },
    });
    if (!res.ok) {
      setBanner(await getErrorMessage(res as unknown as Response));
      fetchBatteries()
        .then(setBatteries)
        .catch(() => {});
    }
  }

  async function handleSetVoltage(battery: Battery) {
    const v = Number.parseFloat(voltageInput);
    if (voltageInput.trim() !== "" && Number.isNaN(v)) {
      setBanner("Voltage must be a number.");
      return;
    }
    const voltage = voltageInput.trim() === "" ? null : v;
    setEditingVoltageId(null);
    setVoltageInput("");
    setBatteries((prev) => prev.map((b) => (b.id === battery.id ? { ...b, voltage } : b)));
    const res = await api.batteries[":id"].voltage.$patch({
      param: { id: String(battery.id) },
      json: { voltage },
    });
    if (!res.ok) {
      setBanner(await getErrorMessage(res as unknown as Response));
      fetchBatteries()
        .then(setBatteries)
        .catch(() => {});
    }
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
      <div className="max-w-2xl mx-auto px-4 py-8 space-y-6">
        <div className="flex items-center justify-between">
          <h1 className="text-3xl font-bold tracking-tight">Batteries</h1>
          {!adding && (
            <button
              type="button"
              onClick={() => {
                setAdding(true);
                setBanner(null);
              }}
              className="px-3 py-1.5 bg-red-600 hover:bg-red-500 text-white text-sm font-semibold rounded-lg transition-colors"
            >
              + Add Battery
            </button>
          )}
        </div>

        {banner && (
          <p className="text-red-400 text-sm bg-red-950 border border-red-800 rounded-lg px-4 py-2">
            {banner}
          </p>
        )}

        {adding && (
          <div className="bg-gray-900 rounded-xl border border-gray-700 p-4 space-y-3">
            <input
              type="text"
              placeholder="Battery name (e.g. A1)"
              value={newName}
              onChange={(e) => {
                setNewName(e.target.value);
                setAddError("");
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter") handleAddBattery();
                if (e.key === "Escape") setAdding(false);
              }}
              className="w-full bg-gray-800 border border-gray-600 rounded-lg px-3 py-2 text-sm text-white placeholder-gray-500 focus:outline-none focus:border-red-500"
              // biome-ignore lint/a11y/noAutofocus: intentional
              autoFocus
            />
            {addError && <p className="text-red-400 text-xs">{addError}</p>}
            <div className="flex gap-2">
              <button
                type="button"
                onClick={handleAddBattery}
                className="px-4 py-2 bg-red-600 hover:bg-red-500 text-white text-sm font-semibold rounded-lg"
              >
                Add
              </button>
              <button
                type="button"
                onClick={() => {
                  setAdding(false);
                  setNewName("");
                  setAddError("");
                }}
                className="px-4 py-2 bg-gray-700 hover:bg-gray-600 text-gray-200 text-sm rounded-lg"
              >
                Cancel
              </button>
            </div>
          </div>
        )}

        {batteries.length === 0 && !adding && (
          <p className="text-gray-600 text-sm text-center py-12">
            No batteries yet. Add one above.
          </p>
        )}

        <div className="space-y-3">
          {batteries.map((battery) => {
            const meta = STATE_META[battery.state];
            return (
              <div
                key={battery.id}
                className={`rounded-xl border ${meta.border} ${meta.bg} p-4 space-y-4`}
              >
                {/* Header */}
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-lg font-bold text-white">{battery.name}</p>
                    <p className={`text-sm font-semibold ${meta.color}`}>
                      {battery.state}
                      <span className="text-gray-500 font-normal ml-2">
                        for {formatElapsed(battery.stateSince)}
                      </span>
                    </p>
                  </div>
                  <div className="flex items-center gap-3 shrink-0">
                    {/* Voltage display / edit */}
                    {editingVoltageId === battery.id ? (
                      <div className="flex items-center gap-1.5">
                        <input
                          ref={voltageInputRef}
                          type="number"
                          step="0.01"
                          placeholder="12.60"
                          value={voltageInput}
                          onChange={(e) => setVoltageInput(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === "Enter") handleSetVoltage(battery);
                            if (e.key === "Escape") {
                              setEditingVoltageId(null);
                              setVoltageInput("");
                            }
                          }}
                          className="w-20 bg-gray-800 border border-gray-600 rounded px-2 py-1 text-sm text-white focus:outline-none focus:border-red-500 [appearance:textfield]"
                        />
                        <button
                          type="button"
                          onClick={() => handleSetVoltage(battery)}
                          className="px-2 py-1 bg-red-600 hover:bg-red-500 text-white text-xs font-semibold rounded"
                        >
                          Set
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setEditingVoltageId(null);
                            setVoltageInput("");
                          }}
                          className="text-gray-500 hover:text-gray-300 text-xs px-1"
                        >
                          ✕
                        </button>
                      </div>
                    ) : (
                      <button
                        type="button"
                        onClick={() => {
                          setEditingVoltageId(battery.id);
                          setVoltageInput(battery.voltage != null ? String(battery.voltage) : "");
                        }}
                        className="text-sm font-mono tabular-nums"
                        title="Set voltage"
                      >
                        {battery.voltage != null ? (
                          <span className={voltageColor(battery.voltage)}>
                            {battery.voltage.toFixed(2)}V
                          </span>
                        ) : (
                          <span className="text-gray-600">—V</span>
                        )}
                      </button>
                    )}

                    {/* Delete */}
                    {confirmDeleteId === battery.id ? (
                      <div className="flex items-center gap-1.5">
                        <button
                          type="button"
                          onClick={() => handleDeleteBattery(battery.id)}
                          className="px-2 py-1 bg-red-700 hover:bg-red-600 text-white text-xs font-semibold rounded"
                        >
                          Delete
                        </button>
                        <button
                          type="button"
                          onClick={() => setConfirmDeleteId(null)}
                          className="px-2 py-1 bg-gray-700 hover:bg-gray-600 text-gray-200 text-xs rounded"
                        >
                          Cancel
                        </button>
                      </div>
                    ) : (
                      <button
                        type="button"
                        onClick={() => setConfirmDeleteId(battery.id)}
                        className="p-1.5 text-gray-600 hover:text-red-400 rounded transition-colors"
                        title="Delete battery"
                      >
                        ✕
                      </button>
                    )}
                  </div>
                </div>

                {/* State buttons */}
                <div className="flex flex-wrap gap-2">
                  {STATES.map((s) => (
                    <button
                      key={s}
                      type="button"
                      onClick={() => handleSetState(battery, s)}
                      className={`px-3 py-1.5 text-sm font-semibold rounded-lg transition-colors ${
                        battery.state === s
                          ? STATE_BTN[s]
                          : "bg-gray-800 hover:bg-gray-700 text-gray-400 hover:text-white"
                      }`}
                    >
                      {s}
                    </button>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </main>
  );
}
