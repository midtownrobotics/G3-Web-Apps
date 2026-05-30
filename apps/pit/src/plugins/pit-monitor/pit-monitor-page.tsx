import { useEffect, useState } from "react";
import { api } from "../../shared/api";
import { fetchBatteries } from "../../shared/getters/batteries";
import { fetchAllIssues } from "../../shared/getters/issues";
import { fetchLists } from "../../shared/getters/lists";
import type { Battery, ChecklistIssueSummary, ChecklistList } from "../../shared/getters/types";

const REFRESH_MS = 5000;

// ── External data types ────────────────────────────────────────────────────

type RankingRow = {
  rank: number | null;
  wins: number;
  losses: number;
  ties: number;
  rp: number;
  epa: number;
};

type NexusMatchTime = {
  estimatedQueueTime?: number | null;
  estimatedOnFieldTime?: number | null;
  estimatedStartTime?: number | null;
  actualQueueTime?: number | null;
  actualOnFieldTime?: number | null;
};

type NexusMatch = {
  label: string;
  status: "Queuing soon" | "Now queuing" | "On deck" | "On field";
  redTeams?: (string | null | undefined)[] | null;
  blueTeams?: (string | null | undefined)[] | null;
  times: NexusMatchTime;
};

type NexusData = {
  nowQueuing?: string | null;
  matches: NexusMatch[];
};

type MonitorData = {
  teamNumber: string;
  nexus: NexusData | null;
  ranking: RankingRow | null;
};

// ── Helpers ────────────────────────────────────────────────────────────────

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

function formatCountdown(targetMs: number): string {
  const remaining = targetMs - Date.now();
  if (remaining <= 0) return "Now";
  const totalSeconds = Math.floor(remaining / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  if (minutes >= 60) return `${Math.floor(minutes / 60)}h ${minutes % 60}m`;
  if (minutes > 0) return `${minutes}m ${seconds}s`;
  return `${seconds}s`;
}

function formatTime(ms?: number | null): string {
  if (!ms) return "—";
  const d = new Date(ms);
  const h = d.getHours() % 12 || 12;
  const m = d.getMinutes().toString().padStart(2, "0");
  return `${h}:${m} ${d.getHours() >= 12 ? "PM" : "AM"}`;
}

function voltageColor(v: number): string {
  if (v >= 12.5) return "text-green-400";
  if (v >= 12.0) return "text-yellow-400";
  return "text-red-400";
}

function teamInMatch(m: NexusMatch, team: string): boolean {
  return (
    m.blueTeams?.some((t) => t === team) === true || m.redTeams?.some((t) => t === team) === true
  );
}

// ── Isolated timer components ──────────────────────────────────────────────

function ElapsedTime({ sinceMs }: { sinceMs: number }) {
  const [text, setText] = useState(() => formatElapsed(sinceMs));
  useEffect(() => {
    const interval = setInterval(() => setText(formatElapsed(sinceMs)), 250);
    return () => clearInterval(interval);
  }, [sinceMs]);
  return <>{text}</>;
}

function Countdown({ targetMs }: { targetMs: number }) {
  const [text, setText] = useState(() => formatCountdown(targetMs));
  useEffect(() => {
    const interval = setInterval(() => setText(formatCountdown(targetMs)), 250);
    return () => clearInterval(interval);
  }, [targetMs]);
  return <>{text}</>;
}

// ── Sections ───────────────────────────────────────────────────────────────

function NexusSection({ nexus, teamNumber }: { nexus: NexusData; teamNumber: string }) {
  const onDeck = nexus.matches.find((m) => m.status === "On deck");
  const nowQueuing = nexus.matches.find((m) => m.status === "Now queuing");
  const queuingSoon = nexus.matches.find((m) => m.status === "Queuing soon");

  if (!onDeck && !nowQueuing && !queuingSoon) return null;

  return (
    <div className="space-y-2">
      {onDeck && (
        <div
          className={`rounded-2xl p-4 border ${teamInMatch(onDeck, teamNumber) ? "bg-red-600/40 border-red-400 ring-2 ring-red-400" : "bg-red-900/30 border-red-700"}`}
        >
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-xs font-bold uppercase tracking-widest text-red-300 mb-0.5">
                On Deck {teamInMatch(onDeck, teamNumber) && "— US!"}
              </p>
              <p className="text-2xl font-black text-white">{onDeck.label}</p>
            </div>
            {onDeck.times.estimatedOnFieldTime && (
              <div className="text-right shrink-0">
                <p className="text-xs text-gray-400">On field in</p>
                <p className="text-xl font-bold text-red-300 tabular-nums">
                  <Countdown targetMs={onDeck.times.estimatedOnFieldTime} />
                </p>
              </div>
            )}
          </div>
        </div>
      )}

      {nowQueuing && (
        <div
          className={`rounded-2xl p-4 border ${teamInMatch(nowQueuing, teamNumber) ? "bg-yellow-600/30 border-yellow-400 ring-2 ring-yellow-400" : "bg-yellow-900/20 border-yellow-700"}`}
        >
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-xs font-bold uppercase tracking-widest text-yellow-300 mb-0.5">
                Now Queuing {teamInMatch(nowQueuing, teamNumber) && "— US!"}
              </p>
              <p className="text-2xl font-black text-white">{nowQueuing.label}</p>
            </div>
            {nowQueuing.times.estimatedOnFieldTime && (
              <div className="text-right shrink-0">
                <p className="text-xs text-gray-400">On field in</p>
                <p className="text-xl font-bold text-yellow-300 tabular-nums">
                  <Countdown targetMs={nowQueuing.times.estimatedOnFieldTime} />
                </p>
              </div>
            )}
          </div>
        </div>
      )}

      {queuingSoon && (
        <div
          className={`rounded-2xl p-4 border ${teamInMatch(queuingSoon, teamNumber) ? "bg-emerald-700/30 border-emerald-400 ring-2 ring-emerald-400" : "bg-emerald-900/20 border-emerald-800"}`}
        >
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-xs font-bold uppercase tracking-widest text-emerald-300 mb-0.5">
                Queuing Soon {teamInMatch(queuingSoon, teamNumber) && "— US!"}
              </p>
              <p className="text-2xl font-black text-white">{queuingSoon.label}</p>
            </div>
            {queuingSoon.times.estimatedQueueTime && (
              <div className="text-right shrink-0">
                <p className="text-xs text-gray-400">Queue in</p>
                <p className="text-xl font-bold text-emerald-300 tabular-nums">
                  <Countdown targetMs={queuingSoon.times.estimatedQueueTime} />
                </p>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function UpcomingMatchesSection({
  nexus,
  teamNumber,
}: {
  nexus: NexusData;
  teamNumber: string;
}) {
  const upcoming = nexus.matches
    .filter((m) => teamInMatch(m, teamNumber) && m.status !== "On field")
    .slice(0, 5);

  if (upcoming.length === 0) return null;

  return (
    <div className="space-y-2">
      <h2 className="text-xs font-bold uppercase tracking-widest text-gray-500">
        Upcoming Matches
      </h2>
      <div className="bg-gray-900 border border-gray-800 rounded-2xl overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-800 text-gray-500 text-xs uppercase tracking-wide">
              <th className="text-left px-4 py-2 font-semibold">Match</th>
              <th className="text-left px-4 py-2 font-semibold">Queue</th>
              <th className="text-left px-4 py-2 font-semibold">Start</th>
              <th className="text-left px-4 py-2 font-semibold">Blue</th>
              <th className="text-left px-4 py-2 font-semibold">Red</th>
            </tr>
          </thead>
          <tbody>
            {upcoming.map((m) => (
              <tr key={m.label} className="border-b border-gray-800/50 last:border-0">
                <td className="px-4 py-2.5 font-semibold text-white">{m.label}</td>
                <td className="px-4 py-2.5 text-gray-400 tabular-nums">
                  {m.times.actualQueueTime
                    ? formatTime(m.times.actualQueueTime)
                    : m.times.estimatedQueueTime
                      ? formatTime(m.times.estimatedQueueTime)
                      : "—"}
                </td>
                <td className="px-4 py-2.5 text-gray-400 tabular-nums">
                  {formatTime(m.times.estimatedStartTime)}
                </td>
                <td className="px-4 py-2.5">
                  <span
                    className={
                      m.blueTeams?.includes(teamNumber)
                        ? "text-blue-300 font-bold"
                        : "text-gray-500"
                    }
                  >
                    {m.blueTeams?.filter(Boolean).join(", ")}
                  </span>
                </td>
                <td className="px-4 py-2.5">
                  <span
                    className={
                      m.redTeams?.includes(teamNumber) ? "text-red-300 font-bold" : "text-gray-500"
                    }
                  >
                    {m.redTeams?.filter(Boolean).join(", ")}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function RankingSection({ ranking }: { ranking: RankingRow }) {
  return (
    <div className="bg-gray-900 border border-gray-800 rounded-2xl p-5">
      <h2 className="text-xs font-bold uppercase tracking-widest text-gray-500 mb-3">Ranking</h2>
      <div className="flex items-center gap-6">
        {ranking.rank !== null && (
          <p className="text-6xl font-black text-white leading-none">
            <span className="text-2xl text-gray-500 font-normal">#</span>
            {ranking.rank}
          </p>
        )}
        <div className="space-y-1 text-sm">
          <p className="text-gray-300">
            <span className="text-green-400 font-bold">{ranking.wins}W</span>
            {" — "}
            <span className="text-red-400 font-bold">{ranking.losses}L</span>
            {ranking.ties > 0 && (
              <>
                {" — "}
                <span className="text-gray-400 font-bold">{ranking.ties}T</span>
              </>
            )}
          </p>
          <p className="text-gray-400">
            <span className="text-white font-semibold">{ranking.rp}</span> RP
            {ranking.epa > 0 && (
              <>
                {" · "}
                <span className="text-white font-semibold">{ranking.epa.toFixed(1)}</span> EPA
              </>
            )}
          </p>
        </div>
      </div>
    </div>
  );
}

function BatteriesSection({ batteries }: { batteries: Battery[] }) {
  const inRobot = batteries.find((b) => b.state === "In Robot");
  const nextUp = batteries.find((b) => b.state === "Next Up");
  const charging = batteries
    .filter((b) => b.state === "Charging")
    .sort((a, b) => a.stateSince - b.stateSince);
  const idle = batteries.filter((b) => b.state === "Idle");
  const broken = batteries.filter((b) => b.state === "Broken");

  return (
    <div className="space-y-3">
      <h2 className="text-xs font-bold uppercase tracking-widest text-gray-500">Batteries</h2>

      <div className="bg-red-900/30 border border-red-700 rounded-2xl p-5">
        <p className="text-xs font-bold uppercase tracking-widest text-red-400 mb-2">In Robot</p>
        {inRobot ? (
          <div className="flex items-end justify-between gap-4">
            <div>
              <p className="text-4xl font-black text-white">{inRobot.name}</p>
              <p className="text-sm text-gray-400 mt-1">
                <ElapsedTime sinceMs={inRobot.stateSince} />
              </p>
            </div>
            {inRobot.voltage != null && (
              <p
                className={`text-3xl font-bold font-mono tabular-nums ${voltageColor(inRobot.voltage)}`}
              >
                {inRobot.voltage.toFixed(2)}V
              </p>
            )}
          </div>
        ) : (
          <p className="text-gray-600 text-sm">No battery in robot</p>
        )}
      </div>

      <div className="bg-emerald-900/30 border border-emerald-600 rounded-2xl p-5">
        <p className="text-xs font-bold uppercase tracking-widest text-emerald-400 mb-2">Next Up</p>
        {nextUp ? (
          <div className="flex items-end justify-between gap-4">
            <div>
              <p className="text-4xl font-black text-white">{nextUp.name}</p>
              <p className="text-sm text-gray-400 mt-1">
                <ElapsedTime sinceMs={nextUp.stateSince} />
              </p>
            </div>
            {nextUp.voltage != null && (
              <p
                className={`text-3xl font-bold font-mono tabular-nums ${voltageColor(nextUp.voltage)}`}
              >
                {nextUp.voltage.toFixed(2)}V
              </p>
            )}
          </div>
        ) : (
          <p className="text-gray-600 text-sm">None designated</p>
        )}
      </div>

      {charging.length > 0 && (
        <div className="bg-blue-900/20 border border-blue-800 rounded-2xl p-4 space-y-2">
          <p className="text-xs font-bold uppercase tracking-widest text-blue-400">Charging</p>
          {charging.map((b) => (
            <div key={b.id} className="flex items-center justify-between">
              <p className="text-base font-semibold text-white">{b.name}</p>
              <p className="text-sm text-gray-400 tabular-nums">
                <ElapsedTime sinceMs={b.stateSince} />
              </p>
            </div>
          ))}
        </div>
      )}

      {(idle.length > 0 || broken.length > 0) && (
        <div className="flex flex-wrap gap-2">
          {idle.map((b) => (
            <span
              key={b.id}
              className="px-3 py-1 bg-gray-800 border border-gray-700 rounded-full text-sm text-gray-400"
            >
              {b.name}
            </span>
          ))}
          {broken.map((b) => (
            <span
              key={b.id}
              className="px-3 py-1 bg-yellow-900/30 border border-yellow-800 rounded-full text-sm text-yellow-500 line-through"
            >
              {b.name}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

function ChecklistSection({
  lists,
  issues,
}: {
  lists: ChecklistList[];
  issues: ChecklistIssueSummary[];
}) {
  const totalItems = lists.reduce((s, l) => s + l.itemCount, 0);
  const totalChecked = lists.reduce((s, l) => s + l.checkedCount, 0);
  const globalPct = totalItems > 0 ? Math.round((totalChecked / totalItems) * 100) : 0;
  const allDone = totalItems > 0 && totalChecked === totalItems;

  return (
    <div className="space-y-4">
      {/* Progress */}
      <div className="space-y-3">
        <h2 className="text-xs font-bold uppercase tracking-widest text-gray-500">
          Checklist Progress
        </h2>
        <div className="space-y-1.5">
          <div className="flex items-center justify-between">
            <span
              className={`text-sm font-semibold ${allDone ? "text-green-400" : "text-gray-300"}`}
            >
              {allDone ? "All done!" : `${totalChecked} / ${totalItems} complete`}
            </span>
            <span
              className={`text-lg font-black tabular-nums ${allDone ? "text-green-400" : "text-white"}`}
            >
              {globalPct}%
            </span>
          </div>
          <div className="h-3 bg-gray-800 rounded-full overflow-hidden">
            <div
              className={`h-full rounded-full transition-all duration-500 ${allDone ? "bg-green-500" : "bg-red-500"}`}
              style={{ width: `${globalPct}%` }}
            />
          </div>
        </div>
        <div className="space-y-2">
          {lists.map((list) => {
            const pct =
              list.itemCount > 0 ? Math.round((list.checkedCount / list.itemCount) * 100) : 0;
            const done = list.itemCount > 0 && list.checkedCount === list.itemCount;
            return (
              <div key={list.id} className="space-y-1">
                <div className="flex items-center justify-between">
                  <span className="text-sm text-gray-400 truncate">{list.name}</span>
                  <span
                    className={`text-sm font-semibold tabular-nums shrink-0 ml-3 ${done ? "text-green-400" : "text-gray-300"}`}
                  >
                    {list.checkedCount}/{list.itemCount}
                  </span>
                </div>
                <div className="h-1.5 bg-gray-800 rounded-full overflow-hidden">
                  <div
                    className={`h-full rounded-full transition-all duration-500 ${done ? "bg-green-500" : "bg-red-500"}`}
                    style={{ width: `${pct}%` }}
                  />
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Issues */}
      <div className="space-y-2 pt-2 border-t border-gray-800">
        <h2 className="text-xs font-bold uppercase tracking-widest text-gray-500">
          Open Issues{" "}
          {issues.length > 0 && (
            <span className="text-yellow-500 normal-case">{issues.length}</span>
          )}
        </h2>
        {issues.length === 0 ? (
          <p className="text-green-400 text-sm font-semibold">No open issues ✓</p>
        ) : (
          <div className="space-y-2">
            {issues.map((issue) => (
              <div
                key={issue.id}
                className="bg-yellow-900/20 border border-yellow-900/50 rounded-xl px-4 py-3"
              >
                <p className="text-sm text-yellow-200/90 leading-snug">{issue.text}</p>
                <p className="text-xs text-gray-600 mt-0.5">
                  {issue.listName} · {issue.itemName}
                </p>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// ── Root ───────────────────────────────────────────────────────────────────

export function PitMonitorPage() {
  const [batteries, setBatteries] = useState<Battery[]>([]);
  const [lists, setLists] = useState<ChecklistList[]>([]);
  const [issues, setIssues] = useState<ChecklistIssueSummary[]>([]);
  const [monitor, setMonitor] = useState<MonitorData | null>(null);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const [loading, setLoading] = useState(true);

  async function loadAll() {
    const [b, l, i, m] = await Promise.all([
      fetchBatteries().catch(() => [] as Battery[]),
      fetchLists().catch(() => [] as ChecklistList[]),
      fetchAllIssues().catch(() => [] as ChecklistIssueSummary[]),
      api.monitor.data
        .$get()
        .then((r) => (r.ok ? (r.json() as Promise<MonitorData>) : null))
        .catch(() => null),
    ]);
    setBatteries(b);
    setLists(l);
    setIssues(i);
    setMonitor(m);
    setLastUpdated(new Date());
    setLoading(false);
  }

  // biome-ignore lint/correctness/useExhaustiveDependencies: loadAll is stable
  useEffect(() => {
    loadAll();
    const interval = setInterval(loadAll, REFRESH_MS);
    return () => clearInterval(interval);
  }, []);

  if (loading) {
    return (
      <main className="min-h-screen bg-gray-950 flex items-center justify-center">
        <p className="text-gray-500 text-lg">Loading…</p>
      </main>
    );
  }

  const teamNumber = monitor?.teamNumber ?? "";
  const hasNexus = !!monitor?.nexus;
  const nexus = monitor?.nexus;

  return (
    <main className="min-h-screen bg-gray-950 text-white">
      <div className="px-6 py-5 space-y-5">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-gray-800 pb-4">
          <h1 className="text-2xl font-black tracking-tight">G3 Pit Monitor</h1>
          {lastUpdated && (
            <p className="text-xs text-gray-600">Updated {lastUpdated.toLocaleTimeString()}</p>
          )}
        </div>

        {/* Nexus status — full width, only if data available */}
        {hasNexus && nexus && <NexusSection nexus={nexus} teamNumber={teamNumber} />}

        {/* Main grid */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Left: matches + ranking */}
          <div className="space-y-5">
            {hasNexus && nexus && <UpcomingMatchesSection nexus={nexus} teamNumber={teamNumber} />}
            {monitor?.ranking && <RankingSection ranking={monitor.ranking} />}
            <BatteriesSection batteries={batteries} />
          </div>

          {/* Right: checklist + issues */}
          <div>
            <ChecklistSection lists={lists} issues={issues} />
          </div>
        </div>
      </div>
    </main>
  );
}
