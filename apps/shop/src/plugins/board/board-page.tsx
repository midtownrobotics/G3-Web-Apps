import { useMemo, useState } from "react";
import { api } from "../../shared/api";
import { getErrorMessage } from "../../shared/api-error";
import {
  type InstanceRow,
  type ShopMood,
  buildInstanceRows,
  partLabel,
  processLoads,
  shopMood,
} from "../../shared/derive";
import { ErrorBanner, PageLoading } from "../../shared/ui";
import { useShopData } from "../../shared/use-shop-data";

const MOOD_TONES: Record<ShopMood["tone"], string> = {
  calm: "bg-emerald-50 border-emerald-300 text-emerald-800",
  steady: "bg-steel-tint border-steel/40 text-steel-dark",
  warn: "bg-amber-50 border-amber-300 text-amber-800",
  hot: "bg-crimson-tint border-crimson/40 text-crimson-dark",
};

const LOAD_STYLES = {
  none: "bg-paper border-steel/30",
  medium: "bg-amber-50 border-amber-300",
  high: "bg-crimson-tint border-crimson/40",
};

export function BoardPage() {
  const { data, loading, error, refresh } = useShopData();
  // "overview" or a process id
  const [view, setView] = useState<number | "overview">("overview");
  const [banner, setBanner] = useState<string | null>(null);

  const rows = useMemo(() => (data ? buildInstanceRows(data) : []), [data]);
  const loads = useMemo(() => (data ? processLoads(rows, data.processes) : []), [rows, data]);

  async function advance(row: InstanceRow, to: "doing" | "done") {
    if (!row.current) return;
    const res = await api["part-instance-processes"][":partInstanceId"].processes[":processId"][
      to
    ].$post({
      param: {
        partInstanceId: String(row.instance.id),
        processId: String(row.current.processId),
      },
    });
    if (!res.ok) {
      setBanner(await getErrorMessage(res as unknown as Response));
      return;
    }
    setBanner(null);
    await refresh();
  }

  if (loading) return <PageLoading />;

  const processName = (pid: number) =>
    data?.processes.find((p) => p.id === pid)?.name ?? `Process #${pid}`;

  return (
    <main className="min-h-screen bg-mist">
      <div className="max-w-5xl mx-auto px-6 py-8 space-y-5">
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="font-display text-4xl text-ink">
            {view === "overview" ? "Shop Floor" : processName(view)}
          </h1>
          <select
            value={view === "overview" ? "overview" : String(view)}
            onChange={(e) =>
              setView(e.target.value === "overview" ? "overview" : Number(e.target.value))
            }
            className="bg-paper border border-steel/40 rounded-lg px-3 py-2 text-sm font-semibold text-ink focus:outline-none focus:border-crimson"
          >
            <option value="overview">Overview</option>
            {data?.processes.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </div>

        {error && <ErrorBanner message={error} />}
        {banner && <ErrorBanner message={banner} />}

        {view === "overview" ? (
          <OverviewView rows={rows} loads={loads} onSelect={setView} processName={processName} />
        ) : (
          <ProcessView processId={view} rows={rows} processName={processName} onAdvance={advance} />
        )}
      </div>
    </main>
  );
}

// ── Overview ──────────────────────────────────────────────────────────────────

function OverviewView({
  rows,
  loads,
  onSelect,
  processName,
}: {
  rows: InstanceRow[];
  loads: ReturnType<typeof processLoads>;
  onSelect: (processId: number) => void;
  processName: (pid: number) => string;
}) {
  const mood = shopMood(loads);
  const inProgress = rows.filter((r) => r.state === "doing");
  const notStarted = sortPriorityFirst(rows.filter((r) => r.state === "todo"));

  return (
    <div className="space-y-6">
      {/* Shop status */}
      <div className={`rounded-xl border px-5 py-4 ${MOOD_TONES[mood.tone]}`}>
        <p className="font-display text-3xl">{mood.label}</p>
        <p className="text-sm mt-0.5">{mood.blurb}</p>
      </div>

      {/* Process boxes */}
      {loads.length === 0 ? (
        <p className="text-steel text-sm">No processes defined yet — add some on the Admin page.</p>
      ) : (
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
          {loads.map((load) => (
            <button
              key={load.process.id}
              type="button"
              onClick={() => onSelect(load.process.id)}
              title={`${load.doing} in progress, ${load.todo} to do — click to open`}
              className={`rounded-xl border p-4 text-left transition-transform hover:-translate-y-0.5 ${LOAD_STYLES[load.level]}`}
            >
              <div className="flex items-center justify-between gap-2">
                <span className="font-semibold text-ink truncate">{load.process.name}</span>
                <span
                  title={load.doing > 0 ? "Running" : "Idle"}
                  className={`w-2.5 h-2.5 rounded-full shrink-0 ${
                    load.doing > 0 ? "bg-emerald-500 animate-pulse" : "bg-steel/40"
                  }`}
                />
              </div>
              <p className="text-xs text-steel-dark mt-2">
                {load.doing} running · {load.todo} to do
              </p>
            </button>
          ))}
        </div>
      )}

      {/* Parts lists */}
      <BoardList
        title="In Progress"
        rows={inProgress}
        empty="Nothing is being worked on right now."
        processName={processName}
      />
      <BoardList
        title="Not Started"
        rows={notStarted}
        empty="Nothing is waiting to start."
        processName={processName}
      />
    </div>
  );
}

function BoardList({
  title,
  rows,
  empty,
  processName,
}: {
  title: string;
  rows: InstanceRow[];
  empty: string;
  processName: (pid: number) => string;
}) {
  return (
    <section className="space-y-2">
      <h2 className="text-xs font-bold uppercase tracking-widest text-steel">
        {title} <span className="text-crimson">{rows.length}</span>
      </h2>
      {rows.length === 0 ? (
        <p className="text-steel text-sm">{empty}</p>
      ) : (
        <div className="bg-paper border border-steel/30 rounded-xl divide-y divide-steel/15">
          {rows.map((row) => (
            <PartLine key={row.instance.id} row={row}>
              {row.current && (
                <span className="text-xs font-medium text-steel-dark bg-steel-tint border border-steel/30 rounded-full px-2.5 py-0.5 shrink-0">
                  {processName(row.current.processId)}
                </span>
              )}
            </PartLine>
          ))}
        </div>
      )}
    </section>
  );
}

// ── Process view ──────────────────────────────────────────────────────────────

function ProcessView({
  processId,
  rows,
  processName,
  onAdvance,
}: {
  processId: number;
  rows: InstanceRow[];
  processName: (pid: number) => string;
  onAdvance: (row: InstanceRow, to: "doing" | "done") => Promise<void>;
}) {
  // Parts whose pipeline includes this process and haven't finished it yet.
  const here = rows.filter((r) => r.procs.some((p) => p.processId === processId));
  const inProgress = here.filter(
    (r) => r.current?.processId === processId && r.current.status === "doing",
  );
  const todo = sortPriorityFirst(
    here.filter((r) => r.current?.processId === processId && r.current.status === "todo"),
  );
  // Still stuck at an earlier process; the row at this process is "waiting".
  const upcoming = here.filter((r) =>
    r.procs.some((p) => p.processId === processId && p.status === "waiting"),
  );

  return (
    <div className="space-y-6">
      <section className="space-y-2">
        <h2 className="text-xs font-bold uppercase tracking-widest text-steel">
          In Progress <span className="text-crimson">{inProgress.length}</span>
        </h2>
        {inProgress.length === 0 ? (
          <p className="text-steel text-sm">Nothing in progress here.</p>
        ) : (
          <div className="bg-paper border border-steel/30 rounded-xl divide-y divide-steel/15">
            {inProgress.map((row) => (
              <PartLine key={row.instance.id} row={row}>
                {row.definition.partDrawingUrl && (
                  <a
                    href={row.definition.partDrawingUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="text-xs text-crimson hover:text-crimson-dark underline shrink-0"
                  >
                    Drawing ↗
                  </a>
                )}
                <span className="relative group shrink-0">
                  <button
                    type="button"
                    onClick={() => onAdvance(row, "done")}
                    className="text-xs px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-paper rounded-lg font-semibold transition-colors"
                  >
                    Mark as Complete
                  </button>
                  <span className="pointer-events-none absolute bottom-full right-0 mb-1.5 hidden group-hover:block whitespace-nowrap bg-ink text-paper text-xs rounded-md px-2.5 py-1.5 shadow-lg">
                    Do a quality check before marking this complete!
                  </span>
                </span>
              </PartLine>
            ))}
          </div>
        )}
      </section>

      <section className="space-y-2">
        <h2 className="text-xs font-bold uppercase tracking-widest text-steel">
          To Do <span className="text-crimson">{todo.length}</span>
        </h2>
        {todo.length === 0 ? (
          <p className="text-steel text-sm">Nothing ready to start.</p>
        ) : (
          <div className="bg-paper border border-steel/30 rounded-xl divide-y divide-steel/15">
            {todo.map((row) => (
              <PartLine key={row.instance.id} row={row}>
                <button
                  type="button"
                  onClick={() => onAdvance(row, "doing")}
                  className="text-xs px-3 py-1.5 bg-crimson hover:bg-crimson-dark text-paper rounded-lg font-semibold transition-colors shrink-0"
                >
                  Start Part
                </button>
              </PartLine>
            ))}
          </div>
        )}
      </section>

      <section className="space-y-2">
        <h2 className="text-xs font-bold uppercase tracking-widest text-steel">
          Upcoming <span className="text-crimson">{upcoming.length}</span>
        </h2>
        {upcoming.length === 0 ? (
          <p className="text-steel text-sm">Nothing else is headed this way.</p>
        ) : (
          <div className="bg-paper border border-steel/30 rounded-xl divide-y divide-steel/15">
            {upcoming.map((row) => (
              <PartLine key={row.instance.id} row={row} muted>
                {row.current && (
                  <span className="text-xs text-steel shrink-0">
                    Stuck at{" "}
                    <span className="font-semibold text-steel-dark">
                      {processName(row.current.processId)}
                    </span>
                  </span>
                )}
              </PartLine>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

// ── Shared bits ───────────────────────────────────────────────────────────────

function PartLine({
  row,
  muted,
  children,
}: {
  row: InstanceRow;
  muted?: boolean;
  children?: React.ReactNode;
}) {
  return (
    <div className="relative flex items-center gap-3 px-4 py-2.5">
      {row.instance.isPriority ? (
        <span className="absolute left-0 inset-y-0 w-1 bg-amber-400" title="Priority part" />
      ) : null}
      <div className="flex-1 min-w-0">
        <p className={`text-sm font-medium truncate ${muted ? "text-steel-dark" : "text-ink"}`}>
          {row.definition.name}
          <span className="text-steel font-normal ml-1.5">#{row.instance.instanceNumber}</span>
        </p>
        <p className="text-xs font-mono text-steel truncate">{partLabel(row)}</p>
      </div>
      {children}
    </div>
  );
}

function sortPriorityFirst(rows: InstanceRow[]): InstanceRow[] {
  return [...rows].sort(
    (a, b) =>
      b.instance.isPriority - a.instance.isPriority ||
      a.definition.createdAt - b.definition.createdAt,
  );
}
