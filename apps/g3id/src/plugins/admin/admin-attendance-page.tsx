import { Loader2, Search } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";

// The attendance worker lives on its own subdomain (api.attendance.g3robotics.com)
// but shares the g3id session cookie (set on the root .g3robotics.com domain), so
// a plain fetch with credentials works the same way api.ts's typed client does for
// g3id's own routes.
const ATTENDANCE_API_URL = import.meta.env.VITE_ATTENDANCE_API_URL ?? "";

type MemberSummary = {
  id: string;
  displayName: string;
  email: string;
  signedIn: boolean;
  lastSignIn: string | null;
  totalHours: number;
};

function relativeDate(iso: string | null): string {
  if (!iso) return "Never";
  const diffMs = Date.now() - new Date(iso).getTime();
  const diffDays = Math.floor(diffMs / 86_400_000);
  if (diffDays <= 0) return "Today";
  if (diffDays === 1) return "Yesterday";
  if (diffDays < 30) return `${diffDays}d ago`;
  return new Date(iso).toLocaleDateString();
}

export function AdminAttendancePage() {
  const [members, setMembers] = useState<MemberSummary[]>([]);
  const [year, setYear] = useState<string>(String(new Date().getFullYear()));
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");

  useEffect(() => {
    (async () => {
      setLoading(true);
      setError(null);
      try {
        const res = await fetch(`${ATTENDANCE_API_URL}/admin/summary`, {
          credentials: "include",
        });
        if (!res.ok) {
          setError(res.status === 403 ? "Admin access required." : "Failed to load attendance.");
          return;
        }
        const data = (await res.json()) as { year: string; members: MemberSummary[] };
        setMembers(data.members);
        setYear(data.year);
      } catch {
        setError("Failed to load attendance.");
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return members;
    return members.filter((m) => m.displayName.toLowerCase().includes(q));
  }, [members, search]);

  const signedInCount = members.filter((m) => m.signedIn).length;

  return (
    <main className="flex-1 px-4 py-8 max-w-3xl mx-auto w-full">
      <div className="mb-6 flex gap-4 border-b border-secondary-600">
        <Link
          to="/admin/users"
          className="py-2 px-4 text-secondary-200 hover:text-white transition-colors"
        >
          Users
        </Link>
        <Link
          to="/admin/kiosk"
          className="py-2 px-4 text-secondary-200 hover:text-white transition-colors"
        >
          Kiosk Devices
        </Link>
        <Link
          to="/admin/attendance"
          className="py-2 px-4 text-white font-medium border-b-2 border-primary-400"
        >
          Attendance Summary
        </Link>
      </div>

      <div className="flex items-baseline justify-between mb-8">
        <h1 className="text-3xl font-bold text-white">Attendance Summary</h1>
        <span className="text-sm text-secondary-200">{year} totals</span>
      </div>

      {!loading && !error && (
        <p className="text-sm text-secondary-200 mb-4">
          {signedInCount} of {members.length} members currently signed in
        </p>
      )}

      <div className="relative mb-6">
        <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-secondary-300" />
        <input
          type="text"
          placeholder="Search by name..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-full pl-9 pr-4 py-2 rounded-lg bg-gray-700 border border-gray-600 text-white placeholder-gray-500 focus:outline-none focus:border-primary-400"
        />
      </div>

      {loading && (
        <div className="flex items-center justify-center py-16 gap-2 text-secondary-200">
          <Loader2 size={20} className="animate-spin" />
          <span>Loading attendance...</span>
        </div>
      )}

      {!loading && error && <p className="text-primary-400 text-sm">{error}</p>}

      {!loading && !error && filtered.length === 0 && (
        <p className="text-secondary-200 text-sm">No members found.</p>
      )}

      {!loading && !error && filtered.length > 0 && (
        <div className="bg-secondary-700 border border-secondary-600 rounded-lg overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-secondary-600 text-left text-secondary-200">
                <th className="px-4 py-3 font-medium">Name</th>
                <th className="px-4 py-3 font-medium">Status</th>
                <th className="px-4 py-3 font-medium">Last Sign-In</th>
                <th className="px-4 py-3 font-medium text-right">Total Hours ({year})</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((m) => (
                <tr key={m.id} className="border-b border-secondary-600/60 last:border-0">
                  <td className="px-4 py-3 text-white font-medium">{m.displayName}</td>
                  <td className="px-4 py-3">
                    <span
                      className={
                        m.signedIn
                          ? "inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-xs font-medium bg-green-500/20 text-green-300 border border-green-500/30"
                          : "inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-xs font-medium bg-secondary-600/40 text-secondary-200 border border-secondary-500/30"
                      }
                    >
                      {m.signedIn ? "Signed In" : "Signed Out"}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-secondary-200">{relativeDate(m.lastSignIn)}</td>
                  <td className="px-4 py-3 text-white text-right font-mono">
                    {m.totalHours.toFixed(1)}h
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </main>
  );
}
