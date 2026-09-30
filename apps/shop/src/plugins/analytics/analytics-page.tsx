import {
  type AnalyticsReport,
  CSS_THEME,
  type Insight,
  ageChart,
  cycleChart,
  heatmapChart,
  queueChart,
  throughputChart,
} from "@g3/worker-shop/analytics-charts";
import { AlertTriangle, Info, TrendingUp } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { api } from "../../shared/api";
import { getErrorMessage } from "../../shared/api-error";
import { ErrorBanner, PageLoading } from "../../shared/ui";
import { useUserNames } from "../../shared/use-user-names";
import { ChartFrame, DataTable } from "./chart-frame";

type WindowKey = "14" | "30" | "90" | "all";
const WINDOWS: { key: WindowKey; label: string }[] = [
  { key: "14", label: "14 days" },
  { key: "30", label: "30 days" },
  { key: "90", label: "90 days" },
  { key: "all", label: "All time" },
];

const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone;
const theme = CSS_THEME;

function fmtMinutes(min: number | null): string {
  if (min === null) return "—";
  const m = Math.round(min);
  if (m < 60) return `${m} min`;
  const h = Math.floor(m / 60);
  return m % 60 ? `${h} h ${m % 60} min` : `${h} h`;
}

const fmtDay = (ms: number) =>
  new Date(ms).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });
const round1 = (n: number) => Math.round(n * 10) / 10;

/** Flow analytics: where work waits, how fast it moves, and how that is changing. */
export function AnalyticsPage() {
  const [days, setDays] = useState<WindowKey>("30");
  const [report, setReport] = useState<AnalyticsReport | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [cycleProcess, setCycleProcess] = useState<string>("all");

  useEffect(() => {
    let cancelled = false;
    setError(null);
    api.analytics
      .$get({ query: { days, tz: timeZone } })
      .then(async (res) => {
        if (!res.ok) throw new Error(await getErrorMessage(res as unknown as Response));
        const body = (await res.json()) as unknown as AnalyticsReport;
        if (!cancelled) setReport(body);
      })
      .catch((e) => {
        if (!cancelled) setError(e instanceof Error ? e.message : "Failed to load analytics.");
      });
    return () => {
      cancelled = true;
    };
  }, [days]);

  const processName = useMemo(() => {
    const names = new Map((report?.processes ?? []).map((p) => [p.id, p.name]));
    return (id: number) => names.get(id) ?? `Process #${id}`;
  }, [report]);

  const cycles = useMemo(
    () =>
      (report?.cycles ?? []).filter(
        (c) => cycleProcess === "all" || String(c.processId) === cycleProcess,
      ),
    [report, cycleProcess],
  );

  const renderAge = useCallback(
    (width: number) => (report ? ageChart(report.open, report.processes, { theme, width }) : ""),
    [report],
  );
  const renderQueue = useCallback(
    (width: number) => (report ? queueChart(report.processes, { theme, width }) : ""),
    [report],
  );
  const renderThroughput = useCallback(
    (width: number) => (report ? throughputChart(report.sessions, { theme, width }) : ""),
    [report],
  );
  const renderCycle = useCallback(
    (width: number) =>
      report
        ? cycleChart(cycles, {
            theme,
            width,
            from: report.window.from,
            to: report.window.to,
            timeZone: report.timeZone,
            processName,
          })
        : "",
    [report, cycles, processName],
  );
  const renderHeat = useCallback(
    (width: number) => (report ? heatmapChart(report.heatmap, { theme, width }) : ""),
    [report],
  );

  const resolveName = useUserNames(report?.people?.map((p) => p.userId) ?? []);

  if (error && !report) {
    return (
      <main className="min-h-screen bg-mist">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 py-8">
          <ErrorBanner message={error} />
        </div>
      </main>
    );
  }
  if (!report) return <PageLoading />;

  const { kpis } = report;
  const windowLabel = WINDOWS.find((w) => w.key === days)?.label.toLowerCase() ?? "";
  const timed = report.processes.filter((p) => p.cycle);

  return (
    <main className="min-h-screen bg-mist">
      <div className="max-w-5xl mx-auto px-4 sm:px-6 py-8 space-y-5">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h1 className="font-display text-4xl text-ink">Analytics</h1>
            <p className="text-steel-dark mt-1 text-sm">
              Time is measured in shop sessions and shop time, not calendar days.
            </p>
          </div>
          <div className="flex rounded-lg border border-steel/30 bg-paper overflow-hidden text-sm font-semibold">
            {WINDOWS.map((w) => (
              <button
                key={w.key}
                type="button"
                onClick={() => setDays(w.key)}
                className={`px-3 py-1.5 ${
                  days === w.key ? "bg-steel-tint text-ink" : "text-steel-dark hover:bg-mist"
                }`}
              >
                {w.label}
              </button>
            ))}
          </div>
        </div>

        {error && <ErrorBanner message={error} />}

        <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
          <Tile
            label="Steps finished"
            value={kpis.stepsCompleted}
            sub={`in ${kpis.sessions} session${kpis.sessions === 1 ? "" : "s"}`}
            delta={
              days !== "all" && kpis.prev.sessions > 0
                ? kpis.stepsCompleted - kpis.prev.stepsCompleted
                : null
            }
            deltaLabel="vs the period before"
          />
          <Tile label="Parts completed" value={kpis.partsCompleted} sub={windowLabel} />
          <Tile
            label="Steps per session"
            value={kpis.stepsPerSession === null ? "—" : round1(kpis.stepsPerSession)}
            sub="median"
          />
          <Tile
            label="Open parts"
            value={kpis.openParts}
            sub={`${kpis.ready} ready · ${kpis.inProgress} in progress`}
          />
          <Tile
            label="Cycle time"
            value={fmtMinutes(kpis.cycleP50Min)}
            sub="median shop time, start → done"
          />
        </div>

        <InsightsCard insights={report.insights} notes={report.notes} />

        <ChartFrame
          title="Open parts: how long they've waited"
          description="Each dot is a part at its current machine; height is shop sessions since it became ready. The dashed line is that machine's usual wait (85% of its steps are done within it)."
          render={renderAge}
          table={
            <DataTable
              head={["Part", "Machine", "State", "Sessions waited", "Flag"]}
              rows={report.open.map((o) => [
                `${o.label}${o.priority ? " ★" : ""}`,
                o.processName,
                o.state === "doing" ? "In progress" : "Ready",
                o.ageSessions,
                o.flag === "ok" ? "" : o.flag === "stuck" ? "Stuck" : "At risk",
              ])}
              empty="No open parts."
            />
          }
        />

        <div className="grid lg:grid-cols-2 gap-5">
          <ChartFrame
            title="Queue by machine"
            description="Parts ready, in progress, and coming up from earlier steps."
            render={renderQueue}
            table={
              <DataTable
                head={["Machine", "Ready", "In progress", "Coming up"]}
                rows={report.processes.map((p) => [p.name, p.ready, p.inProgress, p.upcoming])}
              />
            }
          />
          <ChartFrame
            title="Steps finished per session"
            description="Each bar is one shop session; the dashed line is the median."
            render={renderThroughput}
            table={
              <DataTable
                head={["Session", "Finished", "Started", "People"]}
                rows={report.sessions.map((s) => [
                  `${fmtDay(s.start)}${s.live ? " (now)" : ""}`,
                  s.completed,
                  s.started,
                  s.people,
                ])}
                empty="No sessions in this period."
              />
            }
          />
          <ChartFrame
            title="Cycle time"
            description="Shop time from In Progress to done for each step. Steps marked both within 2 minutes aren't timed."
            render={renderCycle}
            controls={
              <select
                value={cycleProcess}
                onChange={(e) => setCycleProcess(e.target.value)}
                className="text-xs border border-steel/30 rounded-lg px-2 py-1 bg-paper text-ink"
                aria-label="Machine"
              >
                <option value="all">All machines</option>
                {report.processes
                  .filter((p) => report.cycles.some((c) => c.processId === p.id))
                  .map((p) => (
                    <option key={p.id} value={String(p.id)}>
                      {p.name}
                    </option>
                  ))}
              </select>
            }
            table={
              <DataTable
                head={["Part", "Machine", "Done", "Shop time"]}
                rows={[...cycles]
                  .sort((a, b) => b.completedAt - a.completedAt)
                  .map((c) => [
                    c.label,
                    processName(c.processId),
                    fmtDay(c.completedAt),
                    fmtMinutes(c.minutes),
                  ])}
                empty="No timed steps in this period."
              />
            }
          />
          <ChartFrame
            title="When steps get finished"
            description="Steps finished by weekday and hour."
            render={renderHeat}
            table={
              <DataTable
                head={["Weekday", "Hour", "Steps"]}
                rows={[...report.heatmap]
                  .sort((a, b) => ((a.weekday + 6) % 7) - ((b.weekday + 6) % 7) || a.hour - b.hour)
                  .map((c) => [
                    ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"][c.weekday],
                    `${c.hour}:00`,
                    c.n,
                  ])}
              />
            }
          />
        </div>

        <section className="bg-paper border border-steel/25 rounded-xl p-4 space-y-3">
          <div>
            <h2 className="font-semibold text-ink">Machines</h2>
            <p className="text-xs text-steel-dark mt-0.5">
              Usual wait and cycle times use all history; "—" means too few steps to say yet.
            </p>
          </div>
          <div className="overflow-x-auto">
            <DataTable
              head={[
                "Machine",
                `Done (${windowLabel})`,
                "Ready",
                "In progress",
                "Oldest wait",
                "Usual wait",
                "Median cycle",
                "85% cycle",
              ]}
              rows={report.processes.map((p) => [
                p.name,
                p.completed,
                p.ready,
                p.inProgress,
                p.oldestAgeSessions === null ? "—" : `${p.oldestAgeSessions} sess.`,
                p.waitNormSource === "process" ? `${p.waitNorm} sess.` : "—",
                p.cycle ? fmtMinutes(p.cycle.p50) : "—",
                p.cycle ? fmtMinutes(p.cycle.p85) : "—",
              ])}
            />
          </div>
          {timed.length === 0 && (
            <p className="text-xs text-steel">
              No machine has enough timed steps for cycle-time norms yet.
            </p>
          )}
        </section>

        {report.people && (
          <section className="bg-paper border border-steel/25 rounded-xl p-4 space-y-3">
            <div>
              <h2 className="font-semibold text-ink">People</h2>
              <p className="text-xs text-steel-dark mt-0.5">Admins only.</p>
            </div>
            <DataTable
              head={["Name", "Steps finished", "Steps started", "Sessions"]}
              rows={report.people.map((p) => [
                resolveName(p.userId),
                p.completed,
                p.started,
                p.sessions,
              ])}
              empty="Nobody logged work in this period."
            />
          </section>
        )}
      </div>
    </main>
  );
}

function Tile({
  label,
  value,
  sub,
  delta = null,
  deltaLabel,
}: {
  label: string;
  value: string | number;
  sub?: string;
  delta?: number | null;
  deltaLabel?: string;
}) {
  return (
    <div className="bg-paper border border-steel/25 rounded-xl px-4 py-3">
      <p className="text-xs font-semibold text-steel-dark">{label}</p>
      <p className="text-3xl font-semibold text-ink mt-1">{value}</p>
      {sub && <p className="text-xs text-steel mt-0.5">{sub}</p>}
      {delta !== null && (
        <p className="text-xs text-steel-dark mt-0.5">
          {delta > 0 ? "▲" : delta < 0 ? "▼" : "="} {Math.abs(delta)} {deltaLabel}
        </p>
      )}
    </div>
  );
}

const TONES: Record<Insight["tone"], { label: string; icon: typeof Info; className: string }> = {
  bad: { label: "Needs attention", icon: AlertTriangle, className: "text-crimson" },
  good: { label: "Going well", icon: TrendingUp, className: "text-emerald-700" },
  info: { label: "Note", icon: Info, className: "text-steel-dark" },
};

function InsightsCard({ insights, notes }: { insights: Insight[]; notes: string[] }) {
  return (
    <section className="bg-paper border border-steel/25 rounded-xl p-4 space-y-3">
      <div>
        <h2 className="font-semibold text-ink">What stands out</h2>
        <p className="text-xs text-steel-dark mt-0.5">
          Compared with the shop's own history. The daily Slack messages use the top few.
        </p>
      </div>
      {insights.length === 0 ? (
        <p className="text-sm text-steel">Nothing unusual right now.</p>
      ) : (
        <ul className="space-y-2.5">
          {insights.map((i) => {
            const tone = TONES[i.tone];
            const Icon = tone.icon;
            return (
              <li key={i.id} className="flex gap-3">
                <Icon className={`w-4 h-4 mt-0.5 shrink-0 ${tone.className}`} aria-hidden />
                <div className="min-w-0">
                  <p className="text-sm text-ink">
                    <span className={`text-xs font-semibold mr-2 ${tone.className}`}>
                      {tone.label}
                    </span>
                    <span className="font-semibold">{i.title}</span>
                  </p>
                  <p className="text-sm text-steel-dark">{i.detail}</p>
                </div>
              </li>
            );
          })}
        </ul>
      )}
      {notes.length > 0 && (
        <div className="border-t border-steel/15 pt-2.5">
          <p className="text-xs font-semibold text-steel-dark">About this data</p>
          <ul className="mt-1 space-y-0.5">
            {notes.map((n) => (
              <li key={n} className="text-xs text-steel">
                {n}
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}
