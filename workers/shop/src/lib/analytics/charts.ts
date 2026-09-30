import type { CyclePoint, HeatCell, OpenItem, ProcessStats, SessionPoint } from "./metrics";

export type {
  AnalyticsReport,
  CyclePoint,
  HeatCell,
  Kpis,
  OpenItem,
  PersonStats,
  ProcessStats,
  SessionPoint,
} from "./metrics";
export type { Insight } from "./insights";

// Chart builders shared by the analytics page (inline SVG with hover tooltips) and the Slack
// messages (the same SVG rendered to PNG). Pure functions: data + theme in, SVG string out.
// Every mark carries `data-tip` text; the page shows it on hover, the PNG ignores it.
// Colors follow the dataviz reference palette: categorical blue/orange/aqua (safe as a set of
// three for colorblind readers), a single-hue blue ramp for magnitude, recessive grid and axes.

export type ChartTheme = {
  font: string;
  surface: string;
  ink: string;
  inkSecondary: string;
  muted: string;
  grid: string;
  baseline: string;
  /** Categorical slots in fixed order: blue, orange, aqua. */
  series: [string, string, string];
  /** Lighter step of series 1, for de-emphasized bars. */
  seriesSoft: string;
  /** Sequential blue ramp, light to dark (100 → 700). */
  ramp: string[];
};

/** Hex values, for PNG rendering where CSS variables don't exist. Mirrors the shop theme tokens. */
export const HEX_THEME: ChartTheme = {
  font: "Inter",
  surface: "#fcfcfb",
  ink: "#0b0b0b",
  inkSecondary: "#52514e",
  muted: "#898781",
  grid: "#e1e0d9",
  baseline: "#c3c2b7",
  series: ["#2a78d6", "#eb6834", "#1baf7a"],
  seriesSoft: "#86b6ef",
  ramp: [
    "#cde2fb",
    "#b7d3f6",
    "#9ec5f4",
    "#86b6ef",
    "#6da7ec",
    "#5598e7",
    "#3987e5",
    "#2a78d6",
    "#256abf",
    "#1c5cab",
    "#184f95",
    "#104281",
    "#0d366b",
  ],
};

/** CSS-variable values for the page; the tokens live in the shop app's theme. */
export const CSS_THEME: ChartTheme = {
  font: "system-ui, -apple-system, 'Segoe UI', sans-serif",
  surface: "var(--color-chart-surface)",
  ink: "var(--color-chart-ink)",
  inkSecondary: "var(--color-chart-ink-secondary)",
  muted: "var(--color-chart-muted)",
  grid: "var(--color-chart-grid)",
  baseline: "var(--color-chart-baseline)",
  series: ["var(--color-chart-1)", "var(--color-chart-2)", "var(--color-chart-3)"],
  seriesSoft: "var(--color-chart-1-soft)",
  ramp: HEX_THEME.ramp.map((_, i) => `var(--color-chart-ramp-${i})`),
};

type Opts = { theme: ChartTheme; width?: number; title?: string };

const esc = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const r1 = (n: number) => Math.round(n * 10) / 10;
const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`;

function svg(width: number, height: number, t: ChartTheme, label: string, body: string): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" width="${width}" height="${height}" role="img" aria-label="${esc(label)}" style="font-family:${t.font};font-size:12px">
<rect width="${width}" height="${height}" style="fill:${t.surface}"/>
${body}
</svg>`;
}

function text(
  x: number,
  y: number,
  s: string,
  fill: string,
  opts: {
    anchor?: "start" | "middle" | "end";
    size?: number;
    weight?: number;
    baseline?: string;
  } = {},
): string {
  return `<text x="${r1(x)}" y="${r1(y)}" text-anchor="${opts.anchor ?? "start"}"${
    opts.baseline ? ` dominant-baseline="${opts.baseline}"` : ""
  } style="fill:${fill};font-size:${opts.size ?? 12}px${opts.weight ? `;font-weight:${opts.weight}` : ""}">${esc(s)}</text>`;
}

/** A bar with a 4px rounded data end, anchored square to the baseline. */
function vBar(x: number, y: number, w: number, h: number, fill: string): string {
  const r = Math.min(4, w / 2, h);
  if (h <= 0) return "";
  return `<path d="M${r1(x)},${r1(y + h)}V${r1(y + r)}Q${r1(x)},${r1(y)} ${r1(x + r)},${r1(y)}H${r1(x + w - r)}Q${r1(x + w)},${r1(y)} ${r1(x + w)},${r1(y + r)}V${r1(y + h)}Z" style="fill:${fill}"/>`;
}

function hBar(x: number, y: number, w: number, h: number, fill: string, roundEnd: boolean): string {
  if (w <= 0) return "";
  if (!roundEnd)
    return `<rect x="${r1(x)}" y="${r1(y)}" width="${r1(w)}" height="${r1(h)}" style="fill:${fill}"/>`;
  const r = Math.min(4, h / 2, w);
  return `<path d="M${r1(x)},${r1(y)}H${r1(x + w - r)}Q${r1(x + w)},${r1(y)} ${r1(x + w)},${r1(y + r)}V${r1(y + h - r)}Q${r1(x + w)},${r1(y + h)} ${r1(x + w - r)},${r1(y + h)}H${r1(x)}Z" style="fill:${fill}"/>`;
}

/** A round axis maximum and its ticks (about four). `steps` overrides the 1-2-5 step sequence. */
function niceTicks(max: number, count = 4, steps?: number[]): number[] {
  if (max <= 0) return [0, 1];
  const raw = max / count;
  const pow = 10 ** Math.floor(Math.log10(raw));
  const step =
    steps?.find((s) => s >= raw) ??
    [1, 2, 5, 10].map((m) => m * pow).find((s) => s >= raw) ??
    10 * pow;
  const ticks: number[] = [];
  for (let v = 0; v <= max + step * 0.999; v += step) ticks.push(Math.round(v * 1e6) / 1e6);
  if (ticks[ticks.length - 1] < max) ticks.push(ticks[ticks.length - 1] + step);
  return ticks;
}

function yAxis(
  t: ChartTheme,
  ticks: number[],
  y: (v: number) => number,
  left: number,
  right: number,
  fmt: (v: number) => string = String,
): string {
  return ticks
    .map((v) => {
      const yy = r1(y(v));
      const line =
        v === 0
          ? `<line x1="${left}" x2="${right}" y1="${yy}" y2="${yy}" style="stroke:${t.baseline};stroke-width:1"/>`
          : `<line x1="${left}" x2="${right}" y1="${yy}" y2="${yy}" style="stroke:${t.grid};stroke-width:1"/>`;
      return (
        line + text(left - 6, yy, fmt(v), t.muted, { anchor: "end", baseline: "middle", size: 11 })
      );
    })
    .join("");
}

type LegendItem = { label: string; color: string; shape: "dot" | "square" | "line" };

function legend(t: ChartTheme, items: LegendItem[], x: number, y: number): string {
  let cx = x;
  return items
    .map((it) => {
      const mark =
        it.shape === "dot"
          ? `<circle cx="${cx + 5}" cy="${y}" r="5" style="fill:${it.color}"/>`
          : it.shape === "square"
            ? `<rect x="${cx}" y="${y - 5}" width="10" height="10" rx="2" style="fill:${it.color}"/>`
            : `<line x1="${cx}" x2="${cx + 14}" y1="${y}" y2="${y}" style="stroke:${it.color};stroke-width:2;stroke-dasharray:4 3"/>`;
      const w = (it.shape === "line" ? 20 : 16) + it.label.length * 6.2 + 20;
      const out =
        mark +
        text(cx + (it.shape === "line" ? 20 : 16), y, it.label, t.inkSecondary, {
          baseline: "middle",
        });
      cx += w;
      return out;
    })
    .join("");
}

function title(t: ChartTheme, s: string | undefined): { svg: string; h: number } {
  if (!s) return { svg: "", h: 0 };
  return { svg: text(16, 24, s, t.ink, { size: 15, weight: 600 }), h: 32 };
}

/**
 * Steps finished per shop session, with the median as a reference line. `highlightLast` fades
 * the other sessions so the latest one stands out (the Reflection's chart).
 */
export function throughputChart(
  sessions: SessionPoint[],
  opts: Opts & { highlightLast?: boolean; height?: number },
): string {
  const t = opts.theme;
  const width = opts.width ?? 640;
  const height = opts.height ?? 260;
  const head = title(t, opts.title);
  const top = head.h + 16;
  const left = 44;
  const right = width - 16;
  const bottom = height - 32;
  const label = `Steps finished per shop session, ${sessions.length} sessions`;
  if (sessions.length === 0) {
    return svg(
      width,
      height,
      t,
      label,
      head.svg +
        text(width / 2, height / 2, "No shop sessions in this period", t.muted, {
          anchor: "middle",
        }),
    );
  }

  const counts = sessions.map((s) => s.completed);
  const ticks = niceTicks(Math.max(...counts, 1));
  const max = ticks[ticks.length - 1];
  const y = (v: number) => bottom - ((bottom - top) * v) / max;
  const slot = (right - left) / sessions.length;
  const barW = Math.min(24, Math.max(4, slot - 2));
  const sorted = [...counts].sort((a, b) => a - b);
  const med =
    sorted.length % 2
      ? sorted[(sorted.length - 1) / 2]
      : (sorted[sorted.length / 2 - 1] + sorted[sorted.length / 2]) / 2;

  const labelEvery = Math.ceil(sessions.length / Math.floor((right - left) / 64));
  const bars = sessions
    .map((s, i) => {
      const cx = left + slot * (i + 0.5);
      const last = i === sessions.length - 1;
      const fill = opts.highlightLast && !last ? t.seriesSoft : t.series[0];
      const tip = `${s.label}${s.live ? " (in progress)" : ""}: ${plural(s.completed, "step")} finished, ${s.started} started, ${plural(s.people, "person")}`;
      const showLabel = i % labelEvery === 0 || last;
      return `<g data-tip="${esc(tip)}"><rect x="${r1(left + slot * i)}" y="${top}" width="${r1(slot)}" height="${bottom - top}" style="fill:transparent"/>${vBar(cx - barW / 2, y(s.completed), barW, bottom - y(s.completed), fill)}</g>${
        showLabel
          ? text(cx, bottom + 18, s.label.replace(/^\w+ /, ""), t.muted, {
              anchor: "middle",
              size: 11,
            })
          : ""
      }${opts.highlightLast && last ? text(cx, y(s.completed) - 6, String(s.completed), t.ink, { anchor: "middle", weight: 600 }) : ""}`;
    })
    .join("");

  const my = r1(y(med));
  const medianLine = `<line x1="${left}" x2="${right}" y1="${my}" y2="${my}" style="stroke:${t.inkSecondary};stroke-width:1.5;stroke-dasharray:4 3"/>${text(right, my - 6, `median ${r1(med)}`, t.inkSecondary, { anchor: "end", size: 11 })}`;

  return svg(
    width,
    height,
    t,
    label,
    head.svg + yAxis(t, ticks, y, left, right) + bars + medianLine,
  );
}

/**
 * Work-item age: each open part as a dot at its current machine, height = shop sessions it has
 * waited, with that machine's 85th-percentile wait as a reference tick.
 */
export function ageChart(
  open: OpenItem[],
  processes: ProcessStats[],
  opts: Opts & { height?: number; maxColumns?: number },
): string {
  const t = opts.theme;
  const width = opts.width ?? 640;
  const height = opts.height ?? 300;
  const head = title(t, opts.title);
  const columns = processes
    .filter((p) => p.ready + p.inProgress > 0)
    .slice(0, opts.maxColumns ?? 10);
  const label = `Open parts by machine and shop sessions waited, ${open.length} parts`;
  if (columns.length === 0) {
    return svg(
      width,
      height,
      t,
      label,
      head.svg + text(width / 2, height / 2, "No open parts", t.muted, { anchor: "middle" }),
    );
  }

  const legendY = head.h + 16;
  const top = legendY + 24;
  const left = 44;
  const right = width - 16;
  const bottom = height - 32;
  const shown = open.filter((o) => columns.some((c) => c.id === o.processId));
  const ticks = niceTicks(
    Math.max(4, ...shown.map((o) => o.ageSessions), ...columns.map((c) => c.waitNorm)),
  );
  const max = ticks[ticks.length - 1];
  const y = (v: number) => bottom - ((bottom - top) * v) / max;
  const colW = (right - left) / columns.length;

  const oldest = shown.reduce<OpenItem | null>(
    (a, o) => (!a || o.ageSessions > a.ageSessions ? o : a),
    null,
  );
  const body = columns
    .map((c, ci) => {
      const cx = left + colW * (ci + 0.5);
      const norm = r1(y(c.waitNorm));
      const normLine = `<g data-tip="${esc(`${c.name}: ${c.waitNormSource === "default" ? "flagged after" : "85% of steps done within"} ${plural(c.waitNorm, "session")}`)}"><line x1="${r1(cx - colW * 0.4)}" x2="${r1(cx + colW * 0.4)}" y1="${norm}" y2="${norm}" style="stroke:${t.inkSecondary};stroke-width:2;stroke-dasharray:4 3"/></g>`;
      // Dots at the same age spread sideways so each stays visible and hoverable.
      const byAge = new Map<number, OpenItem[]>();
      for (const o of shown.filter((o) => o.processId === c.id)) {
        const list = byAge.get(o.ageSessions) ?? [];
        list.push(o);
        byAge.set(o.ageSessions, list);
      }
      // Pack each group into a small grid of 12px cells centered on its age; what doesn't fit
      // in the band between ticks becomes a "+N" label (the table view lists every part).
      const perRow = Math.max(1, Math.floor((colW * 0.8) / 12));
      const band = Math.max(12, (bottom - top) / max);
      const maxRows = Math.max(1, Math.floor((band - 2) / 12));
      const dots = [...byAge.entries()]
        .map(([age, items]) => {
          const fits = perRow * maxRows;
          const shownItems = items.length > fits ? items.slice(0, fits - 1) : items;
          const rows = Math.ceil(shownItems.length / perRow);
          const marks = shownItems.map((o, i) => {
            const row = Math.floor(i / perRow);
            const inRow = row < rows - 1 ? perRow : shownItems.length - row * perRow;
            const dx = ((i % perRow) - (inRow - 1) / 2) * 12;
            // Age 0 sits on the baseline, so its group grows upward instead of centering.
            const dy = age === 0 ? -row * 12 : (row - (rows - 1) / 2) * 12;
            const px = r1(cx + dx);
            const py = r1(y(age) + dy);
            const fill = o.state === "doing" ? t.series[1] : t.series[0];
            const tip = `${o.label}${o.priority ? " (priority)" : ""} — ${o.state === "doing" ? "in progress" : "ready"} at ${o.processName}, waited ${plural(age, "session")}${o.flag !== "ok" ? ` (${o.flag === "stuck" ? "stuck" : "at risk"})` : ""}`;
            return `<g data-tip="${esc(tip)}"><circle cx="${px}" cy="${py}" r="7" style="fill:transparent"/><circle cx="${px}" cy="${py}" r="5" style="fill:${fill};stroke:${t.surface};stroke-width:2"/></g>`;
          });
          const extra = items.length - shownItems.length;
          if (extra > 0) {
            const tip = items
              .slice(shownItems.length)
              .map((o) => o.label)
              .join(", ");
            marks.push(
              `<g data-tip="${esc(`${plural(extra, "more part")}: ${tip}`)}">${text(cx + (perRow / 2) * 12 + 2, y(age), `+${extra}`, t.inkSecondary, { baseline: "middle", size: 11, weight: 600 })}</g>`,
            );
          }
          return marks.join("");
        })
        .join("");
      const name = c.name.length > 12 ? `${c.name.slice(0, 11)}…` : c.name;
      return (
        normLine +
        dots +
        text(cx, bottom + 18, name, t.inkSecondary, { anchor: "middle", size: 11 })
      );
    })
    .join("");

  let callout = "";
  if (oldest && oldest.ageSessions > 0) {
    const ci = columns.findIndex((c) => c.id === oldest.processId);
    const cx = left + colW * (ci + 0.5);
    const anchor = ci > columns.length / 2 ? "end" : "start";
    const tx = anchor === "end" ? cx - 10 : cx + 10;
    callout = text(tx, y(oldest.ageSessions) - 10, oldest.label, t.ink, {
      anchor,
      size: 11,
      weight: 600,
    });
  }

  const key = legend(
    t,
    [
      { label: "Ready", color: t.series[0], shape: "dot" },
      { label: "In progress", color: t.series[1], shape: "dot" },
      { label: "Usual wait (85%)", color: t.inkSecondary, shape: "line" },
    ],
    left,
    legendY,
  );
  return svg(
    width,
    height,
    t,
    label,
    head.svg + key + yAxis(t, ticks, y, left, right) + body + callout,
  );
}

/** Queue by machine: ready, in progress and coming up, as horizontal stacked bars. */
export function queueChart(processes: ProcessStats[], opts: Opts & { maxRows?: number }): string {
  const t = opts.theme;
  const width = opts.width ?? 640;
  const rows = processes
    .filter((p) => p.ready + p.inProgress + p.upcoming > 0)
    .slice(0, opts.maxRows ?? 12);
  const head = title(t, opts.title);
  const legendY = head.h + 16;
  const top = legendY + 22;
  const rowH = 30;
  const barH = 20;
  const height = top + Math.max(1, rows.length) * rowH + 12;
  const label = "Parts per machine: ready, in progress, coming up";
  if (rows.length === 0) {
    return svg(
      width,
      120,
      t,
      label,
      head.svg + text(width / 2, 60, "No open work", t.muted, { anchor: "middle" }),
    );
  }
  const nameW = 100;
  const left = 16 + nameW;
  const right = width - 48;
  const max = Math.max(...rows.map((p) => p.ready + p.inProgress + p.upcoming));
  const scale = (right - left) / max;
  const gap = 2;

  const body = rows
    .map((p, i) => {
      const y = top + i * rowH;
      const segs = [
        { n: p.ready, color: t.series[0], label: "ready" },
        { n: p.inProgress, color: t.series[1], label: "in progress" },
        { n: p.upcoming, color: t.series[2], label: "coming up" },
      ].filter((s) => s.n > 0);
      let x = left;
      const bars = segs
        .map((s, si) => {
          const w = s.n * scale - (si < segs.length - 1 ? gap : 0);
          const out = `<g data-tip="${esc(`${p.name}: ${s.n} ${s.label}`)}">${hBar(x, y, Math.max(1, w), barH, s.color, si === segs.length - 1)}</g>`;
          x += s.n * scale;
          return out;
        })
        .join("");
      const total = p.ready + p.inProgress + p.upcoming;
      const name = p.name.length > 14 ? `${p.name.slice(0, 13)}…` : p.name;
      return (
        text(left - 10, y + barH / 2, name, t.inkSecondary, { anchor: "end", baseline: "middle" }) +
        bars +
        text(x + 6, y + barH / 2, String(total), t.inkSecondary, { baseline: "middle", size: 11 })
      );
    })
    .join("");

  const key = legend(
    t,
    [
      { label: "Ready", color: t.series[0], shape: "square" },
      { label: "In progress", color: t.series[1], shape: "square" },
      { label: "Coming up", color: t.series[2], shape: "square" },
    ],
    left,
    legendY,
  );
  return svg(width, height, t, label, head.svg + key + body);
}

/** Cycle time (shop minutes from start to done) of each finished step, with median and 85th lines. */
export function cycleChart(
  cycles: CyclePoint[],
  opts: Opts & {
    height?: number;
    from: number;
    to: number;
    timeZone: string;
    processName?: (id: number) => string;
  },
): string {
  const t = opts.theme;
  const width = opts.width ?? 640;
  const height = opts.height ?? 260;
  const head = title(t, opts.title);
  const legendY = head.h + 16;
  const top = legendY + 24;
  const left = 52;
  const right = width - 16;
  const bottom = height - 32;
  const label = `Cycle time of ${cycles.length} finished steps`;
  if (cycles.length === 0) {
    return svg(
      width,
      height,
      t,
      label,
      head.svg +
        text(width / 2, height / 2, "No timed steps in this period", t.muted, { anchor: "middle" }),
    );
  }
  const sorted = cycles.map((c) => c.minutes).sort((a, b) => a - b);
  const q = (p: number) => {
    const i = (sorted.length - 1) * p;
    return (
      sorted[Math.floor(i)] + (sorted[Math.ceil(i)] - sorted[Math.floor(i)]) * (i - Math.floor(i))
    );
  };
  const ticks = niceTicks(
    Math.max(...sorted, 10),
    4,
    [5, 10, 15, 30, 60, 90, 120, 180, 240, 360, 480, 720],
  );
  const max = ticks[ticks.length - 1];
  const y = (v: number) => bottom - ((bottom - top) * v) / max;
  const x = (ms: number) =>
    left + ((right - left) * (ms - opts.from)) / Math.max(1, opts.to - opts.from);
  const fmtMin = (m: number) =>
    m === 0 ? "0" : m >= 60 ? `${r1(m / 60)} h` : `${Math.round(m)} min`;
  const day = (ms: number) =>
    new Date(ms).toLocaleDateString("en-US", {
      timeZone: opts.timeZone,
      month: "short",
      day: "numeric",
    });

  const dots = cycles
    .map((c) => {
      const tip = `${c.label}${opts.processName ? ` at ${opts.processName(c.processId)}` : ""}: ${fmtMin(c.minutes)} of shop time, done ${day(c.completedAt)}`;
      return `<g data-tip="${esc(tip)}"><circle cx="${r1(x(c.completedAt))}" cy="${r1(y(c.minutes))}" r="10" style="fill:transparent"/><circle cx="${r1(x(c.completedAt))}" cy="${r1(y(c.minutes))}" r="4" style="fill:${t.series[0]};stroke:${t.surface};stroke-width:2"/></g>`;
    })
    .join("");
  const ref = (v: number, name: string) => {
    const yy = r1(y(v));
    return `<line x1="${left}" x2="${right}" y1="${yy}" y2="${yy}" style="stroke:${t.inkSecondary};stroke-width:1.5;stroke-dasharray:4 3"/>${text(right, yy - 5, `${name} ${fmtMin(v)}`, t.inkSecondary, { anchor: "end", size: 11 })}`;
  };
  const refs = sorted.length >= 5 ? ref(q(0.5), "median") + ref(q(0.85), "85%") : "";

  const xTicks = [opts.from, (opts.from + opts.to) / 2, opts.to]
    .map((ms, i) =>
      text(x(ms), bottom + 18, day(ms), t.muted, {
        anchor: i === 0 ? "start" : i === 2 ? "end" : "middle",
        size: 11,
      }),
    )
    .join("");
  const key = legend(
    t,
    [{ label: "Finished step", color: t.series[0], shape: "dot" }],
    left,
    legendY,
  );
  return svg(
    width,
    height,
    t,
    label,
    head.svg + key + yAxis(t, ticks, y, left, right, fmtMin) + dots + refs + xTicks,
  );
}

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

/** Steps finished by weekday and hour: when the shop actually works. */
export function heatmapChart(cells: HeatCell[], opts: Opts): string {
  const t = opts.theme;
  const width = opts.width ?? 640;
  const head = title(t, opts.title);
  const label = "Steps finished by weekday and hour";
  if (cells.length === 0) {
    return svg(
      width,
      120,
      t,
      label,
      head.svg +
        text(width / 2, 60, "No finished steps in this period", t.muted, { anchor: "middle" }),
    );
  }
  const hours = cells.map((c) => c.hour);
  const h0 = Math.max(0, Math.min(...hours) - 1);
  const h1 = Math.min(23, Math.max(...hours) + 1);
  const days = [1, 2, 3, 4, 5, 6, 0];
  const top = head.h + 16;
  const left = 48;
  const cols = h1 - h0 + 1;
  const cell = Math.min(40, (width - left - 16) / cols);
  const rowH = Math.min(30, cell);
  const height = top + days.length * rowH + 30;
  const max = Math.max(...cells.map((c) => c.n));
  const byKey = new Map(cells.map((c) => [`${c.weekday}:${c.hour}`, c.n]));
  const hourLabel = (h: number) => `${h % 12 === 0 ? 12 : h % 12}${h < 12 ? "a" : "p"}`;

  let body = "";
  days.forEach((d, ri) => {
    const y = top + ri * rowH;
    body += text(left - 8, y + rowH / 2, WEEKDAYS[d], t.muted, {
      anchor: "end",
      baseline: "middle",
      size: 11,
    });
    for (let h = h0; h <= h1; h++) {
      const n = byKey.get(`${d}:${h}`) ?? 0;
      const x = left + (h - h0) * cell;
      // Zero stays near the surface; the ramp's lightest steps are reserved for small counts.
      const fill =
        n === 0
          ? t.grid
          : t.ramp[Math.min(t.ramp.length - 1, 2 + Math.round(((t.ramp.length - 3) * n) / max))];
      body += `<g data-tip="${esc(`${WEEKDAYS[d]} ${hourLabel(h)}–${hourLabel((h + 1) % 24)}: ${plural(n, "step")} finished`)}"><rect x="${r1(x + 1)}" y="${r1(y + 1)}" width="${r1(cell - 2)}" height="${r1(rowH - 2)}" rx="3" style="fill:${fill}"/></g>`;
    }
  });
  for (let h = h0; h <= h1; h += cols > 12 ? 2 : 1) {
    body += text(
      left + (h - h0) * cell + cell / 2,
      top + days.length * rowH + 16,
      hourLabel(h),
      t.muted,
      { anchor: "middle", size: 11 },
    );
  }
  return svg(width, height, t, label, head.svg + body);
}
