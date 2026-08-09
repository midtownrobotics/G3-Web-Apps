import { useEffect, useRef, useState } from "react";
import { api } from "../../shared/api";
import { getErrorMessage } from "../../shared/api-error";
import { fetchBatteries } from "../../shared/getters/batteries";
import { generateBatteryAndStatesPDF } from "../../shared/generate-state-labels";
import type { Battery, BatteryState } from "../../shared/getters/types";

const POLL_INTERVAL_MS = 3000;

const STATE_META: Record<
  BatteryState,
  { label: string; color: string; bg: string; border: string }
> = {
  "In Robot": {
    label: "In Robot",
    color: "text-red-400",
    bg: "bg-red-900/30",
    border: "border-red-700",
  },
  "Next Up": {
    label: "Next Up",
    color: "text-emerald-400",
    bg: "bg-emerald-900/30",
    border: "border-emerald-600",
  },
  Charging: {
    label: "Charging",
    color: "text-blue-400",
    bg: "bg-blue-900/30",
    border: "border-blue-700",
  },
  Idle: { label: "Idle", color: "text-gray-400", bg: "bg-gray-800", border: "border-gray-600" },
  Broken: {
    label: "Broken",
    color: "text-yellow-400",
    bg: "bg-yellow-900/30",
    border: "border-yellow-700",
  },
};

const STATE_ORDER: Record<BatteryState, number> = {
  "In Robot": 0,
  "Next Up": 1,
  Charging: 2,
  Idle: 3,
  Broken: 4,
};

const STATES: BatteryState[] = ["Charging", "Next Up", "In Robot", "Idle", "Broken"];

const STATE_BTN: Record<BatteryState, string> = {
  "In Robot": "bg-red-700 hover:bg-red-600 text-white",
  "Next Up": "bg-emerald-700 hover:bg-emerald-600 text-white",
  Charging: "bg-blue-700 hover:bg-blue-600 text-white",
  Idle: "bg-gray-700 hover:bg-gray-600 text-white",
  Broken: "bg-yellow-700 hover:bg-yellow-600 text-white",
};

function voltageColor(v: number): string {
  if (v >= 12.5) return "text-green-400";
  if (v >= 12.0) return "text-yellow-400";
  return "text-red-400";
}

function ElapsedTime({ sinceMs }: { sinceMs: number }) {
  const [text, setText] = useState(() => formatElapsed(sinceMs));
  useEffect(() => {
    const interval = setInterval(() => setText(formatElapsed(sinceMs)), 250);
    return () => clearInterval(interval);
  }, [sinceMs]);
  return <>{text}</>;
}

function formatElapsed(sinceMs: number): string {
  const ms = Date.now() - sinceMs;
  const totalSeconds = Math.floor(ms / 1000);
  const totalMinutes = Math.floor(totalSeconds / 60);
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  const seconds = totalSeconds % 60;
  if (hours > 0) return `${hours}h ${minutes}m`;
  if (minutes > 0) return `${minutes}m ${seconds}s`;
  return `${seconds}s`;
}

function sortBatteries(batteries: Battery[]): Battery[] {
  return [...batteries].sort((a, b) => {
    const orderDiff = STATE_ORDER[a.state] - STATE_ORDER[b.state];
    if (orderDiff !== 0) return orderDiff;
    return a.stateSince - b.stateSince;
  });
}

export function BatteriesPage() {
  const [batteries, setBatteries] = useState<Battery[]>([]);
  const [loading, setLoading] = useState(true);
  const [banner, setBanner] = useState<string | null>(null);

  const [adding, setAdding] = useState(false);
  const [newName, setNewName] = useState("");
  const [addError, setAddError] = useState("");

  const [updatingIds, setUpdatingIds] = useState<Set<number>>(new Set());
  const [confirmDeleteId, setConfirmDeleteId] = useState<number | null>(null);
  const [editingVoltageId, setEditingVoltageId] = useState<number | null>(null);
  const [voltageInput, setVoltageInput] = useState("");

  const [showLabelsModal, setShowLabelsModal] = useState(false);
  const [selectedForLabels, setSelectedForLabels] = useState<Set<number>>(new Set());
  const [selectedStates, setSelectedStates] = useState<Set<string>>(new Set());
  const [generatingLabels, setGeneratingLabels] = useState(false);

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
    // Switching to a state without voltage closes the editor
    const nextHasVoltage = state === "In Robot" || state === "Next Up";
    if (editingVoltageId === battery.id && !nextHasVoltage) {
      setEditingVoltageId(null);
      setVoltageInput("");
    }
    const tracksVoltage = state === "In Robot" || state === "Next Up";
    const enteringRobot = state === "In Robot" && battery.state !== "In Robot";
    setUpdatingIds((prev) => new Set(prev).add(battery.id));
    setBatteries((prev) =>
      prev.map((b) =>
        b.id === battery.id
          ? {
              ...b,
              state,
              stateSince: Date.now(),
              ...(!tracksVoltage ? { voltage: null } : {}),
              ...(enteringRobot ? { useCount: b.useCount + 1 } : {}),
            }
          : b,
      ),
    );
    const res = await api.batteries[":id"].state.$patch({
      param: { id: String(battery.id) },
      json: { state },
    });
    setUpdatingIds((prev) => {
      const next = new Set(prev);
      next.delete(battery.id);
      return next;
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
    if (voltage !== null && (voltage < 12.8 || voltage > 14)) {
      setBanner(
        "Warning: voltage should be between 12.8V and 14V for a battery going in the robot.",
      );
    } else {
      setBanner(null);
    }
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

  async function handleResetUses(battery: Battery) {
    setBatteries((prev) => prev.map((b) => (b.id === battery.id ? { ...b, useCount: 0 } : b)));
    const res = await api.batteries[":id"]["reset-uses"].$post({
      param: { id: String(battery.id) },
    });
    if (!res.ok) {
      setBanner(await getErrorMessage(res as unknown as Response));
      fetchBatteries()
        .then(setBatteries)
        .catch(() => {});
    }
  }

  async function handleGenerateLabels() {
    const batteriesToPrint = batteries.filter((b) => selectedForLabels.has(b.id));
    const statesToPrint = Array.from(selectedStates);
    setGeneratingLabels(true);
    try {
      await generateBatteryAndStatesPDF(batteriesToPrint, statesToPrint);
      setShowLabelsModal(false);
      setSelectedForLabels(new Set());
      setSelectedStates(new Set());
    } catch (err) {
      setBanner(err instanceof Error ? err.message : "Failed to generate labels");
    } finally {
      setGeneratingLabels(false);
    }
  }

  function toggleBatterySelection(batteryId: number) {
    const updated = new Set(selectedForLabels);
    if (updated.has(batteryId)) {
      updated.delete(batteryId);
    } else {
      updated.add(batteryId);
    }
    setSelectedForLabels(updated);
  }

  function toggleStateSelection(state: string) {
    const updated = new Set(selectedStates);
    if (updated.has(state)) {
      updated.delete(state);
    } else {
      updated.add(state);
    }
    setSelectedStates(updated);
  }

  if (loading) {
    return (
      <main className="min-h-screen bg-gray-950 flex items-center justify-center">
        <p className="text-gray-400">Loading…</p>
      </main>
    );
  }

  const sorted = sortBatteries(batteries);
  const inRobot = batteries.find((b) => b.state === "In Robot");
  const nextUp = batteries.find((b) => b.state === "Next Up");
  const longestCharging = batteries
    .filter((b) => b.state === "Charging")
    .sort((a, b) => a.stateSince - b.stateSince)[0];

  return (
    <main className="min-h-screen bg-gray-950 text-white">
      <div className="max-w-2xl mx-auto px-4 py-8 space-y-6">
        <div className="flex items-center justify-between gap-3">
          <h1 className="text-3xl font-bold tracking-tight">Batteries</h1>
          <div className="flex gap-2">
            {!adding && (
              <>
                <button
                  type="button"
                  onClick={() => setShowLabelsModal(true)}
                  className="px-3 py-1.5 bg-blue-600 hover:bg-blue-500 text-white text-sm font-semibold rounded-lg transition-colors"
                >
                  📄 Print Labels
                </button>
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
              </>
            )}
          </div>
        </div>

        {banner && (
          <p className="text-amber-400 text-sm bg-amber-950 border border-amber-800 rounded-lg px-4 py-2">
            {banner}
          </p>
        )}

        {/* Summary strip */}
        {(inRobot || nextUp || longestCharging) && (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            {inRobot && (
              <div className="bg-red-900/30 border border-red-700 rounded-xl px-4 py-3">
                <p className="text-xs font-bold uppercase tracking-widest text-red-400 mb-1">
                  In Robot
                </p>
                <p className="text-base font-bold text-white">{inRobot.name}</p>
                <p className="text-xs text-gray-400">
                  <ElapsedTime sinceMs={inRobot.stateSince} />
                </p>
                {inRobot.voltage != null && (
                  <p className={`text-xs font-mono mt-0.5 ${voltageColor(inRobot.voltage)}`}>
                    {inRobot.voltage.toFixed(2)}V
                  </p>
                )}
              </div>
            )}
            {nextUp && (
              <div className="bg-emerald-900/30 border border-emerald-600 rounded-xl px-4 py-3">
                <p className="text-xs font-bold uppercase tracking-widest text-emerald-400 mb-1">
                  Next Up
                </p>
                <p className="text-base font-bold text-white">{nextUp.name}</p>
                <p className="text-xs text-gray-400">
                  <ElapsedTime sinceMs={nextUp.stateSince} />
                </p>
                {nextUp.voltage != null && (
                  <p className={`text-xs font-mono mt-0.5 ${voltageColor(nextUp.voltage)}`}>
                    {nextUp.voltage.toFixed(2)}V
                  </p>
                )}
              </div>
            )}
            {longestCharging && (
              <div className="bg-blue-900/30 border border-blue-700 rounded-xl px-4 py-3">
                <p className="text-xs font-bold uppercase tracking-widest text-blue-400 mb-1">
                  Longest Charging
                </p>
                <p className="text-base font-bold text-white">{longestCharging.name}</p>
                <p className="text-xs text-gray-400">
                  <ElapsedTime sinceMs={longestCharging.stateSince} />
                </p>
              </div>
            )}
          </div>
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
          {sorted.map((battery) => {
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
                        for <ElapsedTime sinceMs={battery.stateSince} />
                      </span>
                    </p>
                    <div className="flex items-center gap-2 mt-1">
                      <span className="text-xs text-gray-500">
                        Used in robot{" "}
                        <span className="font-semibold text-gray-300">{battery.useCount}×</span>
                      </span>
                      {battery.useCount > 0 && (
                        <button
                          type="button"
                          onClick={() => handleResetUses(battery)}
                          className="text-xs text-gray-600 hover:text-red-400 transition-colors underline"
                        >
                          reset
                        </button>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-3 shrink-0">
                    {/* Voltage — shown for In Robot and Next Up */}
                    {(battery.state === "In Robot" || battery.state === "Next Up") &&
                      (editingVoltageId === battery.id ? (
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
                            <span className="text-gray-500 text-xs">Set V</span>
                          )}
                        </button>
                      ))}

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
                  {STATES.map((s) => {
                    const isUpdating = updatingIds.has(battery.id);
                    return (
                      <button
                        key={s}
                        type="button"
                        onClick={() => handleSetState(battery, s)}
                        disabled={isUpdating}
                        className={`px-3 py-1.5 text-sm font-semibold rounded-lg transition-colors ${
                          isUpdating
                            ? "opacity-40 cursor-not-allowed bg-gray-800 text-gray-500"
                            : battery.state === s
                              ? STATE_BTN[s]
                              : "bg-gray-800 hover:bg-gray-700 text-gray-400 hover:text-white"
                        }`}
                      >
                        {s}
                      </button>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>

        {/* Labels Modal (Batteries + States) */}
        {showLabelsModal && (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
            <div className="bg-gray-900 rounded-lg shadow-xl max-w-md w-full p-6 space-y-4">
              <h2 className="text-xl font-bold">Print Labels</h2>
              <p className="text-sm text-gray-400">
                Select batteries and/or states to print on a single PDF.
              </p>

              {/* Batteries Section */}
              <div>
                <h3 className="text-sm font-semibold mb-2">Batteries</h3>
                <div className="space-y-2 max-h-48 overflow-y-auto">
                  {batteries.length === 0 ? (
                    <p className="text-sm text-gray-500">No batteries available</p>
                  ) : (
                    batteries.map((battery) => (
                      <label key={battery.id} className="flex items-center gap-3 cursor-pointer p-2 hover:bg-gray-800 rounded">
                        <input
                          type="checkbox"
                          checked={selectedForLabels.has(battery.id)}
                          onChange={() => toggleBatterySelection(battery.id)}
                          className="w-4 h-4"
                        />
                        <div className="flex-1">
                          <p className="text-sm font-medium">{battery.name}</p>
                          <p className="text-xs text-gray-500">BAT-{String(battery.id).padStart(4, "0")}</p>
                        </div>
                      </label>
                    ))
                  )}
                </div>
              </div>

              {/* States Section */}
              <div>
                <h3 className="text-sm font-semibold mb-2">States</h3>
                <div className="space-y-2">
                  {[
                    { code: "ST-IDLE", label: "Idle" },
                    { code: "ST-CHAR", label: "Charging" },
                    { code: "ST-NXUP", label: "Next Up" },
                    { code: "ST-BRKN", label: "Broken" },
                    { code: "ST-ROBT", label: "In Robot" },
                  ].map((state) => (
                    <label key={state.code} className="flex items-center gap-3 cursor-pointer p-2 hover:bg-gray-800 rounded">
                      <input
                        type="checkbox"
                        checked={selectedStates.has(state.code)}
                        onChange={() => toggleStateSelection(state.code)}
                        className="w-4 h-4"
                      />
                      <div>
                        <p className="text-sm font-medium">{state.label}</p>
                        <p className="text-xs text-gray-500">{state.code}</p>
                      </div>
                    </label>
                  ))}
                </div>
              </div>

              {(selectedForLabels.size > 0 || selectedStates.size > 0) && (
                <p className="text-xs text-gray-400">
                  {selectedForLabels.size} batteries, {selectedStates.size} states
                </p>
              )}

              <div className="flex gap-3 justify-end pt-4 border-t border-gray-700">
                <button
                  type="button"
                  onClick={() => {
                    setShowLabelsModal(false);
                    setSelectedForLabels(new Set());
                    setSelectedStates(new Set());
                  }}
                  className="px-4 py-2 bg-gray-700 hover:bg-gray-600 text-white text-sm font-medium rounded-lg transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleGenerateLabels}
                  disabled={(selectedForLabels.size === 0 && selectedStates.size === 0) || generatingLabels}
                  className="px-4 py-2 bg-blue-600 hover:bg-blue-500 disabled:bg-gray-700 disabled:cursor-not-allowed text-white text-sm font-medium rounded-lg transition-colors"
                >
                  {generatingLabels ? "Generating…" : "Generate PDF"}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </main>
  );
}
