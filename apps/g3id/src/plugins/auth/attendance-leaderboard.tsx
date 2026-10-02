import { Loader2, Trophy } from "lucide-react";
import { useEffect, useState } from "react";

const ATTENDANCE_API_URL = import.meta.env.VITE_ATTENDANCE_API_URL ?? "";

type AttendanceLeaderboardData = {
  year: string;
  leaderboard: { rank: number; displayName: string; totalHours: number }[];
};

export function AttendanceLeaderboard() {
  const [data, setData] = useState<AttendanceLeaderboardData | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    fetch(`${ATTENDANCE_API_URL}/leaderboard`, { credentials: "include" })
      .then(async (response) => {
        const body = (await response.json().catch(() => ({}))) as AttendanceLeaderboardData & {
          error?: string;
        };
        if (!response.ok) throw new Error(body.error ?? "Unable to load attendance.");
        setData(body);
      })
      .catch((cause) =>
        setError(cause instanceof Error ? cause.message : "Unable to load attendance."),
      );
  }, []);

  if (error)
    return (
      <div className="rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-200">
        {error}
      </div>
    );

  if (!data)
    return (
      <div className="flex items-center justify-center gap-2 py-16 text-secondary-200">
        <Loader2 size={20} className="animate-spin" /> Loading attendance…
      </div>
    );

  return (
    <section className="overflow-hidden rounded-lg border border-secondary-600 bg-secondary-700">
      <header className="flex items-center justify-between border-b border-secondary-600 px-4 py-3">
        <h2 className="flex items-center gap-2 font-semibold text-white">
          <Trophy size={18} className="text-primary-400" /> Attendance
        </h2>
        <span className="text-xs text-secondary-300">{data.year}</span>
      </header>
      {data.leaderboard.length ? (
        <ol>
          {data.leaderboard.map((member) => (
            <li
              key={`${member.rank}-${member.displayName}`}
              className="grid grid-cols-[44px_minmax(0,1fr)_90px] items-center gap-2 border-b border-secondary-600/60 px-4 py-3 last:border-0"
            >
              <b className="text-secondary-300">#{member.rank}</b>
              <strong className="truncate text-sm text-white">{member.displayName}</strong>
              <span className="text-right font-mono text-sm text-primary-300">
                {member.totalHours.toFixed(1)}h
              </span>
            </li>
          ))}
        </ol>
      ) : (
        <p className="px-4 py-10 text-center text-sm text-secondary-300">
          No attendance has been recorded this school year.
        </p>
      )}
    </section>
  );
}
