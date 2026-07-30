import { type InstanceRow } from "../../shared/derive";
import type { ShopData } from "../../shared/use-shop-data";

export function PartWorkView({
  row,
  data,
  onClose,
  onMarkComplete,
}: {
  row: InstanceRow;
  data: ShopData;
  onClose: () => void;
  onMarkComplete: () => Promise<void>;
}) {
  const subsystem = data.subsystems.find((s) => s.id === row.definition.subsystemId);

  return (
    <div className="fixed inset-0 bg-paper z-50 flex flex-col">
      {/* Header */}
        <div className="flex items-center justify-between px-6 py-5 border-b border-steel/30">
          <h1 className="font-display text-3xl text-ink">
            {row.definition.name}
            <span className="text-steel font-normal ml-2">#{row.instance.instanceNumber}</span>
          </h1>
          <button
            type="button"
            onClick={onClose}
            className="text-3xl text-steel hover:text-ink transition-colors"
          >
            ✕
          </button>
        </div>

        {/* Main content */}
        <div className="flex-1 flex overflow-hidden">
          {/* Drawing iframe - 3/4 width */}
          <div className="flex-1 border-r border-steel/30">
            {row.definition.partDrawingUrl ? (
              <iframe
                src={row.definition.partDrawingUrl}
                className="w-full h-full border-none"
                title="Part drawing"
              />
            ) : (
              <div className="w-full h-full flex items-center justify-center bg-mist">
                <p className="text-steel text-center">No drawing available</p>
              </div>
            )}
          </div>

          {/* Part info - 1/4 width */}
          <div className="w-1/4 flex flex-col p-6 overflow-y-auto">
            <div className="space-y-5 flex-1">
              <div>
                <p className="text-sm font-semibold text-steel mb-2">Name</p>
                <p className="text-base text-ink">{row.definition.name || "—"}</p>
              </div>

              <div>
                <p className="text-sm font-semibold text-steel mb-2">Part Number</p>
                <p className="text-base font-mono text-ink">{row.definition.onshapePartNumber}</p>
              </div>

              <div>
                <p className="text-sm font-semibold text-steel mb-2">Revision</p>
                <p className="text-base text-ink">{row.definition.revision || "—"}</p>
              </div>

              <div>
                <p className="text-sm font-semibold text-steel mb-2">Instance</p>
                <p className="text-base text-ink">#{row.instance.instanceNumber}</p>
              </div>

              <div>
                <p className="text-sm font-semibold text-steel mb-2">Subsystem</p>
                <p className="text-base text-ink">{subsystem?.name || "—"}</p>
              </div>

              {row.definition.notes && (
                <div>
                  <p className="text-sm font-semibold text-steel mb-2">Notes</p>
                  <p className="text-base text-ink whitespace-pre-wrap">{row.definition.notes}</p>
                </div>
              )}

              {row.instance.isPriority ? (
                <div className="pt-2">
                  <span className="inline-block text-xs font-semibold px-2.5 py-1 bg-amber-50 text-amber-700 border border-amber-200 rounded">
                    Priority
                  </span>
                </div>
              ) : null}
            </div>

            {/* Buttons */}
            <div className="space-y-3 pt-6 border-t border-steel/30 mt-6">
              <button
                type="button"
                onClick={onClose}
                className="w-full px-6 py-4 text-lg font-semibold text-steel bg-steel-tint border border-steel/30 hover:border-steel/50 hover:text-ink rounded-lg transition-colors"
              >
                Exit
              </button>
              <button
                type="button"
                onClick={onMarkComplete}
                className="w-full px-6 py-4 text-lg font-semibold text-paper bg-emerald-600 hover:bg-emerald-700 rounded-lg transition-colors"
              >
                Mark Complete
              </button>
            </div>
          </div>
        </div>
    </div>
  );
}
