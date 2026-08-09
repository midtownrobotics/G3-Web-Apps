import { useState, useEffect } from "react";
import { api } from "./api";
import { fetchBatteries } from "./getters/batteries";
import { useBarcodeScan } from "./barcode-scanner";
import { useBatteryCache } from "./battery-cache-context";
import type { BatteryState } from "./getters/types";

const STATE_CODE_MAP: Record<string, BatteryState> = {
  "ST-IDLE": "Idle",
  "ST-CHAR": "Charging",
  "ST-NXUP": "Next Up",
  "ST-BRKN": "Broken",
  "ST-ROBT": "In Robot",
};

export function BarcodeScanDisplay() {
  const { batteries, setBatteries } = useBatteryCache();
  const [feedback, setFeedback] = useState<{ type: "success" | "error"; message: string } | null>(null);

  // Fetch batteries once if not cached
  useEffect(() => {
    if (batteries.length === 0) {
      fetchBatteries()
        .then(setBatteries)
        .catch(() => {});
    }
  }, []);

  const getBatteryName = (id: number): string => {
    const battery = batteries.find((b) => b.id === id);
    return battery?.name || `BAT-${String(id).padStart(4, "0")}`;
  };

  const handleComplete = async (stateCode: string, batteryCode: string) => {
    console.log(`[BarcodeScan] Complete: ${stateCode} -> ${batteryCode}`);

    // Extract battery ID from BAT-0000 format
    const batteryId = parseInt(batteryCode.slice(4), 10);
    const state = STATE_CODE_MAP[stateCode];

    if (!state) {
      console.error(`Invalid state code: ${stateCode}`);
      setFeedback({ type: "error", message: "Invalid state" });
      return;
    }

    try {
      console.log(`[BarcodeScan] Updating battery ${batteryId} to state: ${state}`);
      const res = await api.batteries[":id"].state.$patch({
        param: { id: String(batteryId) },
        json: { state },
      });

      if (!res.ok) {
        const error = await res.text();
        console.error(`[BarcodeScan] API error:`, error);
        setFeedback({ type: "error", message: "Failed to update battery" });
      } else {
        console.log(`[BarcodeScan] ✓ Battery updated successfully`);
        const batteryName = getBatteryName(batteryId);
        setFeedback({ type: "success", message: `${batteryName} → ${state}` });
        setTimeout(() => setFeedback(null), 2000);
      }
    } catch (err) {
      console.error(`[BarcodeScan] Exception:`, err);
      setFeedback({ type: "error", message: err instanceof Error ? err.message : "Error updating battery" });
    }
  };

  const scan = useBarcodeScan(handleComplete);

  if (!scan.scanInProgress && !feedback) {
    return null;
  }

  const getStateLabel = (code: string) => {
    return STATE_CODE_MAP[code] || code;
  };

  // Show feedback bar after scan completes
  if (feedback && !scan.scanInProgress) {
    return (
      <div
        className={`border-b px-4 py-3 ${
          feedback.type === "success"
            ? "bg-green-100 border-green-300"
            : "bg-red-100 border-red-300"
        }`}
      >
        <div className="max-w-2xl mx-auto flex items-center gap-3">
          <div className={`text-xl ${feedback.type === "success" ? "text-green-600" : "text-red-600"}`}>
            {feedback.type === "success" ? "✓" : "✗"}
          </div>
          <p
            className={`text-sm font-semibold ${
              feedback.type === "success" ? "text-green-700" : "text-red-700"
            }`}
          >
            {feedback.message}
          </p>
        </div>
      </div>
    );
  }

  // Show scanning bar
  const stateScanned = !!scan.stateCode;
  const batteryScanned = !!scan.batteryCode;
  const waitingForState = batteryScanned && !stateScanned;
  const waitingForBattery = stateScanned && !batteryScanned;

  return (
    <div className="bg-blue-100 border-b border-blue-300 px-4 py-3">
      <div className="max-w-2xl mx-auto flex items-center gap-4">
        <div className="flex-1">
          <p className="text-sm text-blue-700 uppercase tracking-widest font-semibold mb-1">
            Scanning
          </p>
          <div className="flex items-center gap-8">
            {/* State */}
            <div className="flex items-center gap-3">
              <div
                className={`w-3 h-3 rounded-full ${
                  stateScanned ? "bg-green-500" : "bg-blue-500"
                } ${waitingForState && "animate-pulse"}`}
              />
              <div>
                <p className="text-xs text-blue-700 uppercase tracking-wide">State</p>
                <p className="text-lg font-bold text-gray-900">
                  {scan.stateCode ? getStateLabel(scan.stateCode) : waitingForState ? "Waiting…" : "—"}
                </p>
              </div>
            </div>

            {/* Arrow */}
            <div className="text-blue-600 text-xl">↔</div>

            {/* Battery */}
            <div className="flex items-center gap-3">
              <div
                className={`w-3 h-3 rounded-full ${
                  batteryScanned ? "bg-green-500" : "bg-blue-500"
                } ${waitingForBattery && "animate-pulse"}`}
              />
              <div>
                <p className="text-xs text-blue-700 uppercase tracking-wide">Battery</p>
                <p className="text-lg font-bold text-gray-900">
                  {scan.batteryCode
                    ? getBatteryName(parseInt(scan.batteryCode.slice(4), 10))
                    : waitingForBattery
                      ? "Waiting…"
                      : "—"}
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
