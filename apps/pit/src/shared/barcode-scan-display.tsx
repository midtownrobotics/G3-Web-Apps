import { useCallback, useEffect, useState } from "react";
import { api } from "./api";
import { useBarcodeScan } from "./barcode-scanner";
import { useBatteryCache } from "./battery-cache-context";
import { fetchBatteries } from "./getters/batteries";
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
  const [feedback, setFeedback] = useState<{ type: "success" | "error"; message: string } | null>(
    null,
  );

  // Fetch batteries once if not cached
  // biome-ignore lint/correctness/useExhaustiveDependencies: fetch once on mount only
  useEffect(() => {
    if (batteries.length === 0) {
      fetchBatteries()
        .then(setBatteries)
        .catch(() => {});
    }
  }, []);

  // Auto-close feedback after 2 seconds
  useEffect(() => {
    if (feedback) {
      const timeout = setTimeout(() => {
        console.log("[BarcodeScan] Auto-closing feedback after 2 seconds");
        setFeedback(null);
      }, 2000);
      return () => clearTimeout(timeout);
    }
  }, [feedback]);

  const getBatteryName = (id: number): string => {
    const battery = batteries.find((b) => b.id === id);
    return battery?.name || `BAT-${String(id).padStart(4, "0")}`;
  };

  const handleComplete = useCallback(async (stateCode: string, batteryCode: string) => {
    console.log(`[BarcodeScan] Complete: ${stateCode} -> ${batteryCode}`);

    // Extract battery ID from BAT-0000 format
    const batteryId = Number.parseInt(batteryCode.slice(4), 10);
    const state = STATE_CODE_MAP[stateCode];

    if (!state) {
      console.error(`Invalid state code: ${stateCode}`);
      setFeedback({ type: "error", message: "Invalid state" });
      setTimeout(() => setFeedback(null), 2000);
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
        console.error("[BarcodeScan] API error:", error);
        setFeedback({ type: "error", message: "Failed to update battery" });
        setTimeout(() => setFeedback(null), 2000);
      } else {
        console.log("[BarcodeScan] ✓ Battery updated successfully");
        const batteryName = getBatteryName(batteryId);
        setFeedback({ type: "success", message: `${batteryName} → ${state}` });
        setTimeout(() => setFeedback(null), 2000);

        // If setting to "In Robot", set any other "In Robot" battery to "Idle"
        if (state === "In Robot") {
          const inRobotBattery = batteries.find(
            (b) => b.state === "In Robot" && b.id !== batteryId,
          );
          if (inRobotBattery) {
            console.log(
              `[BarcodeScan] Setting previous In Robot battery ${inRobotBattery.id} to Idle`,
            );
            await api.batteries[":id"].state.$patch({
              param: { id: String(inRobotBattery.id) },
              json: { state: "Idle" },
            });
          }
        }
      }
    } catch (err) {
      console.error("[BarcodeScan] Exception:", err);
      setFeedback({
        type: "error",
        message: err instanceof Error ? err.message : "Error updating battery",
      });
      setTimeout(() => setFeedback(null), 2000);
    }
  }, [batteries]);

  const scan = useBarcodeScan(handleComplete);

  if (!scan.scanInProgress && !feedback) {
    return null;
  }

  const getStateLabel = (code: string) => {
    return STATE_CODE_MAP[code] || code;
  };

  // Show feedback modal after scan completes
  if (feedback && !scan.scanInProgress) {
    return (
      <div className="fixed inset-0 flex items-center justify-center pointer-events-none z-50">
        <div
          className={`rounded-2xl shadow-2xl px-8 py-6 pointer-events-auto ${
            feedback.type === "success"
              ? "bg-green-100 border-2 border-green-300"
              : "bg-red-100 border-2 border-red-300"
          }`}
        >
          <div className="flex items-center gap-4">
            <div
              className={`text-4xl ${
                feedback.type === "success" ? "text-green-600" : "text-red-600"
              }`}
            >
              {feedback.type === "success" ? "✓" : "✗"}
            </div>
            <p
              className={`text-lg font-bold ${
                feedback.type === "success" ? "text-green-700" : "text-red-700"
              }`}
            >
              {feedback.message}
            </p>
          </div>
        </div>
      </div>
    );
  }

  // Show scanning modal
  const stateScanned = !!scan.stateCode;
  const batteryScanned = !!scan.batteryCode;
  const waitingForState = batteryScanned && !stateScanned;
  const waitingForBattery = stateScanned && !batteryScanned;

  return (
    <div className="fixed inset-0 flex items-center justify-center pointer-events-none z-50">
      <div className="bg-blue-100 border-2 border-blue-300 rounded-2xl shadow-2xl px-8 py-6 pointer-events-auto max-w-lg">
        <p className="text-sm text-blue-700 uppercase tracking-widest font-semibold mb-4 text-center">
          Scanning Battery
        </p>
        <div className="flex items-center justify-center gap-8">
          {/* State */}
          <div className="flex flex-col items-center gap-3">
            <div
              className={`w-4 h-4 rounded-full ${
                stateScanned ? "bg-green-500" : "bg-blue-500"
              } ${waitingForState && "animate-pulse"}`}
            />
            <div className="text-center">
              <p className="text-xs text-blue-700 uppercase tracking-wide mb-1">State</p>
              <p className="text-2xl font-bold text-gray-900">
                {scan.stateCode
                  ? getStateLabel(scan.stateCode)
                  : waitingForState
                    ? "Waiting…"
                    : "—"}
              </p>
            </div>
          </div>

          {/* Arrow */}
          <div className="text-blue-600 text-3xl">↔</div>

          {/* Battery */}
          <div className="flex flex-col items-center gap-3">
            <div
              className={`w-4 h-4 rounded-full ${
                batteryScanned ? "bg-green-500" : "bg-blue-500"
              } ${waitingForBattery && "animate-pulse"}`}
            />
            <div className="text-center">
              <p className="text-xs text-blue-700 uppercase tracking-wide mb-1">Battery</p>
              <p className="text-2xl font-bold text-gray-900">
                {scan.batteryCode
                  ? getBatteryName(Number.parseInt(scan.batteryCode.slice(4), 10))
                  : waitingForBattery
                    ? "Waiting…"
                    : "—"}
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
