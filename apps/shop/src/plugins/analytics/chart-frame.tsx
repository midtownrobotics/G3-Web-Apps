import { type ReactNode, useEffect, useMemo, useRef, useState } from "react";

/**
 * A chart card: renders an SVG string at the card's width, shows each mark's `data-tip` on
 * hover (or tap), and switches to a table view of the same data.
 */
export function ChartFrame({
  title,
  description,
  render,
  table,
  controls,
}: {
  title: string;
  description?: string;
  render: (width: number) => string;
  table: ReactNode;
  controls?: ReactNode;
}) {
  const [view, setView] = useState<"chart" | "table">("chart");
  const boxRef = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(640);
  const [tip, setTip] = useState<{ text: string; x: number; y: number } | null>(null);

  useEffect(() => {
    const el = boxRef.current;
    if (!el) return;
    const observer = new ResizeObserver(([entry]) => {
      setWidth(Math.max(320, Math.round(entry.contentRect.width)));
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  const svg = useMemo(() => render(width), [render, width]);

  function showTip(e: React.PointerEvent<HTMLDivElement>) {
    const box = boxRef.current;
    const target = (e.target as Element).closest("[data-tip]");
    if (!box || !target) {
      setTip(null);
      return;
    }
    const rect = box.getBoundingClientRect();
    setTip({
      text: target.getAttribute("data-tip") ?? "",
      x: Math.min(Math.max(e.clientX - rect.left, 90), rect.width - 90),
      y: e.clientY - rect.top,
    });
  }

  return (
    <section className="bg-paper border border-steel/25 rounded-xl p-4 space-y-3">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="font-semibold text-ink">{title}</h2>
          {description && <p className="text-xs text-steel-dark mt-0.5">{description}</p>}
        </div>
        <div className="flex items-center gap-2">
          {controls}
          <div className="flex rounded-lg border border-steel/30 overflow-hidden text-xs font-semibold">
            {(["chart", "table"] as const).map((v) => (
              <button
                key={v}
                type="button"
                onClick={() => setView(v)}
                className={`px-2.5 py-1 capitalize ${
                  view === v ? "bg-steel-tint text-ink" : "text-steel-dark hover:bg-mist"
                }`}
              >
                {v}
              </button>
            ))}
          </div>
        </div>
      </div>
      <div
        ref={boxRef}
        className={`relative ${view === "chart" ? "" : "hidden"}`}
        onPointerMove={showTip}
        onPointerDown={showTip}
        onPointerLeave={() => setTip(null)}
      >
        <div
          className="[&_svg]:block [&_svg]:w-full [&_svg]:h-auto"
          // biome-ignore lint/security/noDangerouslySetInnerHtml: SVG built by our own chart code, all text escaped
          dangerouslySetInnerHTML={{ __html: svg }}
        />
        {tip && (
          <div
            className="pointer-events-none absolute z-10 max-w-64 -translate-x-1/2 -translate-y-full rounded-md bg-ink px-2.5 py-1.5 text-xs text-paper shadow-lg"
            style={{ left: tip.x, top: tip.y - 10 }}
          >
            {tip.text}
          </div>
        )}
      </div>
      {view === "table" && <div className="overflow-x-auto">{table}</div>}
    </section>
  );
}

/** A compact table for chart data views. */
export function DataTable({
  head,
  rows,
  empty = "No data.",
}: {
  head: string[];
  rows: ReactNode[][];
  empty?: string;
}) {
  if (rows.length === 0) return <p className="text-sm text-steel">{empty}</p>;
  return (
    <table className="w-full text-sm tabular-nums">
      <thead>
        <tr className="text-left text-xs text-steel-dark border-b border-steel/25">
          {head.map((h, i) => (
            <th key={h} className={`py-1.5 pr-3 font-semibold ${i > 0 ? "text-right" : ""}`}>
              {h}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {rows.map((row, ri) => (
          // biome-ignore lint/suspicious/noArrayIndexKey: static rows rebuilt with the data
          <tr key={ri} className="border-b border-steel/10 last:border-0">
            {row.map((cell, ci) => (
              // biome-ignore lint/suspicious/noArrayIndexKey: fixed column order
              <td key={ci} className={`py-1.5 pr-3 ${ci > 0 ? "text-right" : "text-ink"}`}>
                {cell}
              </td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  );
}
