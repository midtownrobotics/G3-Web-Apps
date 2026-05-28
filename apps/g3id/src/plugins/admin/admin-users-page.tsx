import { Loader2, Shield, ShieldOff } from "lucide-react";
import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "../../lib/api";

type Identity = { provider: string; createdAt: number };

type User = {
  id: string;
  email: string;
  displayName: string;
  status: string;
  isAdmin: number;
  createdAt: number;
  identities: Identity[];
};

const STATUS_STYLES: Record<string, string> = {
  pending: "bg-yellow-500/20 text-yellow-300 border-yellow-500/30",
  active: "bg-green-500/20 text-green-300 border-green-500/30",
  rejected: "bg-red-500/20 text-red-300 border-red-500/30",
};

const PROVIDER_LABELS: Record<string, string> = {
  local: "Password",
  google: "Google",
  slack: "Slack",
  github: "GitHub",
  steam: "Steam",
  onshape: "OnShape",
};

const FILTERS = ["pending", "active", "rejected", "all"] as const;
type Filter = (typeof FILTERS)[number];

export function AdminUsersPage() {
  const navigate = useNavigate();
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [users, setUsers] = useState<User[]>([]);
  const [filter, setFilter] = useState<Filter>("pending");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [approving, setApproving] = useState<Set<string>>(new Set());
  const [rejecting, setRejecting] = useState<Set<string>>(new Set());
  const [deleting, setDeleting] = useState<Set<string>>(new Set());
  const [promoting, setPromoting] = useState<Set<string>>(new Set());
  const [mergingUserId, setMergingUserId] = useState<string | null>(null);
  const [mergeTargetId, setMergeTargetId] = useState("");
  const [mergeLoading, setMergeLoading] = useState(false);

  useEffect(() => {
    api.auth.me.$get().then(async (res) => {
      if (res.status === 401) {
        navigate("/login");
        return;
      }
      const data = (await res.json()) as { id: string; isAdmin: number };
      if (!res.ok || !data.isAdmin) {
        navigate("/dashboard");
        return;
      }
      setCurrentUserId(data.id);
    });
  }, [navigate]);

  useEffect(() => {
    if (!currentUserId) return;
    api.admin.users
      .$get()
      .then(async (res) => {
        if (!res.ok) throw new Error("Failed to load users.");
        const data = (await res.json()) as User[];
        setUsers(data);
      })
      .catch((err) => setError(err instanceof Error ? err.message : "Something went wrong."))
      .finally(() => setLoading(false));
  }, [currentUserId]);

  function updateUser(userId: string, patch: Partial<User>) {
    setUsers((prev) => prev.map((u) => (u.id === userId ? { ...u, ...patch } : u)));
  }

  async function handleApprove(userId: string) {
    setApproving((prev) => new Set(prev).add(userId));
    try {
      const res = await api.admin.users[":id"].approve.$post({ param: { id: userId } });
      if (res.ok) updateUser(userId, { status: "active" });
    } finally {
      setApproving((prev) => {
        const n = new Set(prev);
        n.delete(userId);
        return n;
      });
    }
  }

  async function handleReject(userId: string) {
    setRejecting((prev) => new Set(prev).add(userId));
    try {
      const res = await api.admin.users[":id"].reject.$post({ param: { id: userId } });
      if (res.ok) updateUser(userId, { status: "rejected" });
    } finally {
      setRejecting((prev) => {
        const n = new Set(prev);
        n.delete(userId);
        return n;
      });
    }
  }

  async function handleDelete(userId: string) {
    if (!window.confirm("Permanently delete this user and all their data?")) return;
    setDeleting((prev) => new Set(prev).add(userId));
    try {
      const res = await api.admin.users[":id"].$delete({ param: { id: userId } });
      if (res.ok) setUsers((prev) => prev.filter((u) => u.id !== userId));
    } finally {
      setDeleting((prev) => {
        const n = new Set(prev);
        n.delete(userId);
        return n;
      });
    }
  }

  async function handlePromote(userId: string) {
    setPromoting((prev) => new Set(prev).add(userId));
    try {
      const res = await api.admin.users[":id"].promote.$post({ param: { id: userId } });
      if (res.ok) updateUser(userId, { isAdmin: 1 });
    } finally {
      setPromoting((prev) => {
        const n = new Set(prev);
        n.delete(userId);
        return n;
      });
    }
  }

  async function handleDemote(userId: string) {
    setPromoting((prev) => new Set(prev).add(userId));
    try {
      const res = await api.admin.users[":id"].demote.$post({ param: { id: userId } });
      if (res.ok) updateUser(userId, { isAdmin: 0 });
    } finally {
      setPromoting((prev) => {
        const n = new Set(prev);
        n.delete(userId);
        return n;
      });
    }
  }

  async function handleMerge(userId: string) {
    if (!mergeTargetId) return;
    setMergeLoading(true);
    try {
      // biome-ignore lint/suspicious/noExplicitAny: merge route has no body validator
      const res = await (api.admin.users[":id"].merge.$post as any)({
        param: { id: userId },
        json: { targetUserId: mergeTargetId },
      });
      if (res.ok) {
        setUsers((prev) => prev.filter((u) => u.id !== userId));
        setMergingUserId(null);
        setMergeTargetId("");
      }
    } finally {
      setMergeLoading(false);
    }
  }

  const filtered = filter === "all" ? users : users.filter((u) => u.status === filter);
  const countFor = (f: Filter) =>
    f === "all" ? users.length : users.filter((u) => u.status === f).length;

  return (
    <main className="flex-1 px-6 py-8 max-w-4xl mx-auto w-full">
      <h1 className="text-2xl font-bold text-white mb-6">Users</h1>

      <div className="flex gap-2 mb-6">
        {FILTERS.map((f) => (
          <button
            key={f}
            type="button"
            onClick={() => setFilter(f)}
            className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors capitalize ${
              filter === f
                ? "bg-red-500 text-white"
                : "bg-gray-900 text-gray-400 hover:text-white border border-gray-700"
            }`}
          >
            {f} <span className="opacity-60">({countFor(f)})</span>
          </button>
        ))}
      </div>

      {loading && (
        <div className="flex justify-center py-16 text-gray-500">
          <Loader2 size={24} className="animate-spin" />
        </div>
      )}

      {error && <p className="text-sm text-red-400">{error}</p>}

      {!loading && !error && filtered.length === 0 && (
        <p className="text-sm text-gray-500 text-center py-16">
          No {filter === "all" ? "" : filter} users.
        </p>
      )}

      {!loading && !error && (
        <div className="space-y-3">
          {filtered.map((user) => (
            <div
              key={user.id}
              className="bg-gray-900 border border-gray-800 rounded-lg overflow-hidden"
            >
              <div className="px-5 py-4 flex items-center gap-4">
                <div className="w-10 h-10 rounded-full bg-gray-800 flex items-center justify-center text-sm font-semibold text-gray-300 shrink-0">
                  {user.displayName.charAt(0).toUpperCase()}
                </div>

                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <p className="text-white font-medium truncate">{user.displayName}</p>
                    {user.isAdmin ? (
                      <span className="text-xs px-1.5 py-0.5 rounded bg-purple-500/20 text-purple-300 border border-purple-500/30 shrink-0">
                        Admin
                      </span>
                    ) : null}
                  </div>
                  <p className="text-gray-500 text-sm truncate">{user.email}</p>
                </div>

                <div className="flex items-center gap-2 shrink-0">
                  {user.identities.map((identity) => (
                    <span
                      key={identity.provider}
                      className="px-2 py-0.5 rounded text-xs bg-gray-800 text-gray-400 border border-gray-700"
                    >
                      {PROVIDER_LABELS[identity.provider] ?? identity.provider}
                    </span>
                  ))}
                </div>

                <div className="flex items-center gap-2 shrink-0">
                  {user.status === "pending" && (
                    <>
                      <button
                        type="button"
                        disabled={approving.has(user.id) || rejecting.has(user.id)}
                        onClick={() => handleApprove(user.id)}
                        className="px-3 py-1 rounded-lg text-xs font-medium bg-green-600 hover:bg-green-500 disabled:opacity-50 disabled:cursor-not-allowed text-white transition-colors flex items-center gap-1.5"
                      >
                        {approving.has(user.id) && <Loader2 size={12} className="animate-spin" />}
                        Approve
                      </button>
                      <button
                        type="button"
                        disabled={approving.has(user.id) || rejecting.has(user.id)}
                        onClick={() => handleReject(user.id)}
                        className="px-3 py-1 rounded-lg text-xs font-medium bg-red-700 hover:bg-red-600 disabled:opacity-50 disabled:cursor-not-allowed text-white transition-colors flex items-center gap-1.5"
                      >
                        {rejecting.has(user.id) && <Loader2 size={12} className="animate-spin" />}
                        Reject
                      </button>
                    </>
                  )}

                  {user.status === "active" && user.id !== currentUserId && (
                    <button
                      type="button"
                      disabled={promoting.has(user.id)}
                      onClick={() =>
                        user.isAdmin ? handleDemote(user.id) : handlePromote(user.id)
                      }
                      className="px-3 py-1 rounded-lg text-xs font-medium bg-gray-800 hover:bg-purple-900 hover:text-purple-300 disabled:opacity-50 disabled:cursor-not-allowed text-gray-400 transition-colors flex items-center gap-1.5"
                    >
                      {promoting.has(user.id) ? (
                        <Loader2 size={12} className="animate-spin" />
                      ) : user.isAdmin ? (
                        <ShieldOff size={12} />
                      ) : (
                        <Shield size={12} />
                      )}
                      {user.isAdmin ? "Demote" : "Promote"}
                    </button>
                  )}

                  {(user.status === "active" || user.status === "rejected") &&
                    user.id !== currentUserId && (
                      <button
                        type="button"
                        disabled={deleting.has(user.id)}
                        onClick={() => handleDelete(user.id)}
                        className="px-3 py-1 rounded-lg text-xs font-medium bg-gray-800 hover:bg-red-900 hover:text-red-300 disabled:opacity-50 disabled:cursor-not-allowed text-gray-400 transition-colors flex items-center gap-1.5"
                      >
                        {deleting.has(user.id) && <Loader2 size={12} className="animate-spin" />}
                        Delete
                      </button>
                    )}

                  {user.status !== "active" && (
                    <button
                      type="button"
                      onClick={() => {
                        if (mergingUserId === user.id) setMergingUserId(null);
                        else {
                          setMergingUserId(user.id);
                          setMergeTargetId("");
                        }
                      }}
                      className="px-3 py-1 rounded-lg text-xs font-medium bg-gray-700 hover:bg-gray-600 text-gray-300 transition-colors"
                    >
                      {mergingUserId === user.id ? "Cancel" : "Merge"}
                    </button>
                  )}
                </div>

                <span
                  className={`px-2.5 py-0.5 rounded-full text-xs font-medium border capitalize shrink-0 ${STATUS_STYLES[user.status] ?? "bg-gray-800 text-gray-400"}`}
                >
                  {user.status}
                </span>

                <p className="text-xs text-gray-600 shrink-0 w-24 text-right">
                  {new Date(user.createdAt * 1000).toLocaleDateString()}
                </p>
              </div>

              {mergingUserId === user.id && (
                <div className="px-5 py-3 border-t border-gray-800 flex items-center gap-3">
                  <p className="text-xs text-gray-400 shrink-0">Merge into:</p>
                  <select
                    value={mergeTargetId}
                    onChange={(e) => setMergeTargetId(e.target.value)}
                    className="flex-1 rounded-lg bg-gray-800 border border-gray-700 px-3 py-1.5 text-sm text-white focus:outline-none focus:border-red-400"
                  >
                    <option value="">Select a user…</option>
                    {users
                      .filter((u) => {
                        if (u.id === user.id) return false;
                        const sourceProviders = new Set(user.identities.map((i) => i.provider));
                        return !u.identities.some((i) => sourceProviders.has(i.provider));
                      })
                      .map((u) => (
                        <option key={u.id} value={u.id}>
                          {u.displayName} — {u.email} ({u.status})
                        </option>
                      ))}
                  </select>
                  <button
                    type="button"
                    disabled={!mergeTargetId || mergeLoading}
                    onClick={() => handleMerge(user.id)}
                    className="px-3 py-1.5 rounded-lg text-xs font-medium bg-red-500 hover:bg-red-400 disabled:opacity-50 disabled:cursor-not-allowed text-white transition-colors flex items-center gap-1.5 shrink-0"
                  >
                    {mergeLoading && <Loader2 size={12} className="animate-spin" />}
                    Confirm merge
                  </button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </main>
  );
}
