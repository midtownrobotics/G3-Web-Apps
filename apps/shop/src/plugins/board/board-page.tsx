import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { api } from "../../shared/api";
import { getErrorMessage } from "../../shared/api-error";
import {
  type InstanceRow,
  type ShopMood,
  buildInstanceRows,
  matchMachineProcess,
  partLabel,
  processLoads,
  shopMood,
} from "../../shared/derive";
import { fetchKioskPresence } from "../../shared/getters";
import { processPath } from "../../shared/nav";
import type { KioskPresence } from "../../shared/types";
import { ErrorBanner, PageLoading } from "../../shared/ui";
import { useKiosk } from "../../shared/use-auth";
import { useShopData } from "../../shared/use-shop-data";
import { useTouchDevice } from "../../shared/use-touch";
import { useUserNames } from "../../shared/use-user-names";
import { PartCard } from "../parts/part-card";

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

// Auto-open the kiosk's machine only once per app load, so the overview stays reachable.
let kioskAutoOpened = false;

export function BoardPage() {
  const { data, loading, error, refresh } = useShopData();
  const navigate = useNavigate();
  const params = useParams();
  const kiosk = useKiosk();
  // Kiosks are tablets — always use the finger-friendly layout there.
  const touch = useTouchDevice() || kiosk.active;

  // The active view comes from the URL: /board = overview, /board/process/:id.
  const view: number | "overview" = params.processId ? Number(params.processId) : "overview";

  const [banner, setBanner] = useState<string | null>(null);
  const [selectedInstanceId, setSelectedInstanceId] = useState<number | null>(null);
  const [presence, setPresence] = useState<KioskPresence[]>([]);

  const rows = useMemo(() => (data ? buildInstanceRows(data) : []), [data]);
  const loads = useMemo(() => (data ? processLoads(rows, data.processes) : []), [rows, data]);

  // A kiosk named after a machine opens straight to that machine's queue.
  useEffect(() => {
    if (!kiosk.active || kioskAutoOpened || !data || params.processId) return;
    const machine = matchMachineProcess(data.processes, kiosk.machineName);
    kioskAutoOpened = true;
    if (machine) navigate(processPath(machine.id), { replace: true });
  }, [kiosk.active, kiosk.machineName, data, params.processId, navigate]);

  // Who is logged in at each kiosk, refreshed alongside the heartbeat cadence.
  useEffect(() => {
    let cancelled = false;
    const load = () =>
      fetchKioskPresence()
        .then((rows) => {
          if (!cancelled) setPresence(rows);
        })
        .catch(() => {});
    load();
    const id = setInterval(load, 60 * 1000);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, []);

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

  const selectedRow =
    selectedInstanceId !== null
      ? (rows.find((r) => r.instance.id === selectedInstanceId) ?? null)
      : null;

  return (
    <main className="min-h-screen bg-mist">
      <div className="max-w-5xl mx-auto px-6 py-8 space-y-5">
        {view !== "overview" && (
          <Link
            to="/board"
            className={`inline-flex items-center gap-1.5 text-sm text-steel hover:text-ink transition-colors ${
              touch ? "py-2" : ""
            }`}
          >
            ← Back to Shop Floor
          </Link>
        )}

        <div className="flex flex-wrap items-center gap-3">
          {view === "overview" ? (
            <h1 className="font-display text-4xl text-ink">Shop Floor</h1>
          ) : (
            <h1 className="font-display text-4xl text-ink">{processName(view)}</h1>
          )}
          <select
            value={view === "overview" ? "overview" : String(view)}
            onChange={(e) =>
              navigate(
                e.target.value === "overview" ? "/board" : processPath(Number(e.target.value)),
              )
            }
            className={`bg-paper border border-steel/40 rounded-lg px-3 text-sm font-semibold text-ink focus:outline-none focus:border-crimson ${
              touch ? "py-3" : "py-2"
            }`}
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
          <OverviewView
            rows={rows}
            loads={loads}
            processName={processName}
            touch={touch}
            onOpenPart={setSelectedInstanceId}
            presence={presence}
          />
        ) : (
          <ProcessView
            processId={view}
            rows={rows}
            processName={processName}
            onAdvance={advance}
            touch={touch}
            onOpenPart={setSelectedInstanceId}
          />
        )}
      </div>

      {selectedRow && data && (
        <PartCard
          row={selectedRow}
          data={data}
          onClose={() => setSelectedInstanceId(null)}
          onChanged={refresh}
        />
      )}
    </main>
  );
}

// ── Overview ──────────────────────────────────────────────────────────────────

function OverviewView({
  rows,
  loads,
  processName,
  touch,
  onOpenPart,
  presence,
}: {
  rows: InstanceRow[];
  loads: ReturnType<typeof processLoads>;
  processName: (pid: number) => string;
  touch: boolean;
  onOpenPart: (instanceId: number) => void;
  presence: KioskPresence[];
}) {
  const mood = shopMood(loads);
  const inProgress = rows.filter((r) => r.state === "doing");
  const notStarted = sortPriorityFirst(rows.filter((r) => r.state === "todo"));

  const resolveName = useUserNames(presence.map((p) => p.userId));
  // Kiosks are matched to machines by name, same rule as the kiosk auto-open.
  const peopleAt = (processName: string) =>
    presence
      .filter((p) => p.deviceName.trim().toLowerCase() === processName.trim().toLowerCase())
      .map((p) => resolveName(p.userId));

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
            <Link
              key={load.process.id}
              to={processPath(load.process.id)}
              title={`${load.doing} in progress, ${load.todo} to do — click to open`}
              className={`rounded-xl border text-left transition-transform hover:-translate-y-0.5 ${LOAD_STYLES[load.level]} ${
                touch ? "p-5" : "p-4"
              }`}
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
              {peopleAt(load.process.name).length > 0 && (
                <p
                  className="text-xs text-emerald-700 mt-1.5 truncate"
                  title={`At this machine: ${peopleAt(load.process.name).join(", ")}`}
                >
                  👤 {peopleAt(load.process.name).join(", ")}
                </p>
              )}
            </Link>
          ))}
        </div>
      )}

      {/* Parts lists */}
      <BoardList
        title="In Progress"
        rows={inProgress}
        empty="Nothing is being worked on right now."
        processName={processName}
        touch={touch}
        onOpenPart={onOpenPart}
      />
      <BoardList
        title="Not Started"
        rows={notStarted}
        empty="Nothing is waiting to start."
        processName={processName}
        touch={touch}
        onOpenPart={onOpenPart}
      />
    </div>
  );
}

function BoardList({
  title,
  rows,
  empty,
  processName,
  touch,
  onOpenPart,
}: {
  title: string;
  rows: InstanceRow[];
  empty: string;
  processName: (pid: number) => string;
  touch: boolean;
  onOpenPart: (instanceId: number) => void;
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
            <PartLine
              key={row.instance.id}
              row={row}
              touch={touch}
              onOpen={() => onOpenPart(row.instance.id)}
            >
              {row.current && (
                <Link
                  to={processPath(row.current.processId)}
                  onClick={(e) => e.stopPropagation()}
                  className="text-xs font-medium text-steel-dark bg-steel-tint border border-steel/30 hover:border-crimson/50 hover:text-crimson rounded-full px-2.5 py-0.5 shrink-0 transition-colors"
                >
                  {processName(row.current.processId)}
                </Link>
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
  touch,
  onOpenPart,
}: {
  processId: number;
  rows: InstanceRow[];
  processName: (pid: number) => string;
  onAdvance: (row: InstanceRow, to: "doing" | "done") => Promise<void>;
  touch: boolean;
  onOpenPart: (instanceId: number) => void;
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

  const btnSize = touch ? "px-4 py-2.5" : "px-3 py-1.5";

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
              <PartLine
                key={row.instance.id}
                row={row}
                touch={touch}
                onOpen={() => onOpenPart(row.instance.id)}
              >
                {row.definition.partDrawingUrl && (
                  <a
                    href={row.definition.partDrawingUrl}
                    target="_blank"
                    rel="noreferrer"
                    onClick={(e) => e.stopPropagation()}
                    className="text-xs text-crimson hover:text-crimson-dark underline shrink-0"
                  >
                    Drawing ↗
                  </a>
                )}
                <span className="relative group shrink-0">
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      onAdvance(row, "done");
                    }}
                    className={`text-xs bg-emerald-600 hover:bg-emerald-700 text-paper rounded-lg font-semibold transition-colors ${btnSize}`}
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
              <PartLine
                key={row.instance.id}
                row={row}
                touch={touch}
                onOpen={() => onOpenPart(row.instance.id)}
              >
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    onAdvance(row, "doing");
                  }}
                  className={`text-xs bg-crimson hover:bg-crimson-dark text-paper rounded-lg font-semibold transition-colors shrink-0 ${btnSize}`}
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
              <PartLine
                key={row.instance.id}
                row={row}
                touch={touch}
                muted
                onOpen={() => onOpenPart(row.instance.id)}
              >
                {row.current && (
                  <span className="text-xs text-steel shrink-0">
                    Stuck at{" "}
                    <Link
                      to={processPath(row.current.processId)}
                      onClick={(e) => e.stopPropagation()}
                      className="font-semibold text-steel-dark hover:text-crimson underline transition-colors"
                    >
                      {processName(row.current.processId)}
                    </Link>
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
  touch,
  onOpen,
  children,
}: {
  row: InstanceRow;
  muted?: boolean;
  touch?: boolean;
  onOpen: () => void;
  children?: React.ReactNode;
}) {
  return (
    <div
      className={`relative flex items-center gap-3 px-4 cursor-pointer hover:bg-mist/70 transition-colors ${
        touch ? "py-4" : "py-2.5"
      }`}
      onClick={onOpen}
      title="View part details"
    >
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
