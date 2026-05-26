import { KeySquare, Loader2, Shield } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { FaGithub, FaGoogle, FaSlack, FaSteam } from "react-icons/fa";
import { Link, useNavigate } from "react-router-dom";
import { getApi, postApi } from "../../shared/api";

const apiBase = import.meta.env.VITE_API_BASE_URL ?? "";

type Identity = { provider: string; createdAt: number };

type Me = {
  id: string;
  email: string;
  displayName: string;
  status: string;
  isAdmin: number;
  createdAt: number;
  identities: Identity[];
};

const PROVIDER_LABELS: Record<string, string> = {
  local: "Password",
  google: "Google",
  slack: "Slack",
  github: "GitHub",
  steam: "Steam",
  onshape: "OnShape",
};

export function DashboardPage() {
  const navigate = useNavigate();
  const [me, setMe] = useState<Me | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [newPassword, setNewPassword] = useState("");
  const [passwordLoading, setPasswordLoading] = useState(false);
  const [passwordError, setPasswordError] = useState<string | null>(null);
  const [passwordDone, setPasswordDone] = useState(false);

  const [slackCode, setSlackCode] = useState<string | null>(null);
  const [slackError, setSlackError] = useState<string | null>(null);
  const slackPollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  async function handleConnectSlack() {
    setSlackError(null);
    const { ok, data } = await getApi<{ code: string; token: string }>("/auth/slack/link");
    if (!ok) {
      setSlackError("Failed to start linking. Try again.");
      return;
    }
    setSlackCode(data.code);

    slackPollRef.current = setInterval(async () => {
      try {
        const res = await fetch(`${apiBase}/auth/slack/status?token=${data.token}`, {
          credentials: "include",
        });
        if (!res.ok) return;
        const status = (await res.json()) as {
          status: string;
          action?: string;
          message?: string;
        };
        if (status.status === "pending") return;
        if (slackPollRef.current) clearInterval(slackPollRef.current);
        if (status.status === "success" && status.action === "linked") {
          setSlackCode(null);
          setMe((prev) =>
            prev
              ? {
                ...prev,
                identities: [
                  ...prev.identities,
                  { provider: "slack", createdAt: Math.floor(Date.now() / 1000) },
                ],
              }
              : prev,
          );
        } else {
          setSlackError(
            status.status === "expired"
              ? "Code expired. Please try again."
              : (status.message ?? "Something went wrong."),
          );
          setSlackCode(null);
        }
      } catch {
        // network error — keep polling
      }
    }, 2000);
  }

  useEffect(
    () => () => {
      if (slackPollRef.current) clearInterval(slackPollRef.current);
    },
    [],
  );

  async function handleSetPassword(e: React.SyntheticEvent) {
    e.preventDefault();
    setPasswordLoading(true);
    setPasswordError(null);
    const { ok, data } = await postApi<{ ok?: boolean; error?: string }>("/auth/password", {
      password: newPassword,
    });
    setPasswordLoading(false);
    if (!ok) {
      setPasswordError((data as { error?: string }).error ?? "Something went wrong.");
      return;
    }
    setPasswordDone(true);
    setMe((prev) =>
      prev
        ? {
          ...prev,
          identities: [
            ...prev.identities,
            { provider: "local", createdAt: Math.floor(Date.now() / 1000) },
          ],
        }
        : prev,
    );
  }

  async function handleLogout() {
    await postApi("/auth/logout", {});
    navigate("/login");
  }

  useEffect(() => {
    getApi<Me>("/auth/me").then(({ data, ok, status }) => {
      if (status === 401) {
        navigate("/login");
        return;
      }
      if (status === 404) {
        navigate("/signup");
        return;
      }
      if (!ok) {
        setError("Failed to load your account.");
        return;
      }
      setMe(data);
    });
  }, [navigate]);

  if (error) {
    return (
      <main className="flex-1 flex items-center justify-center px-4">
        <p className="text-sm text-red-400">{error}</p>
      </main>
    );
  }

  if (!me) {
    return (
      <main className="flex-1 flex items-center justify-center px-4">
        <Loader2 size={24} className="animate-spin text-gray-500" />
      </main>
    );
  }

  return (
    <main className="flex-1 px-6 py-8 max-w-lg mx-auto w-full">
      <h1 className="text-2xl font-bold text-white mb-4">Dashboard</h1>

      <div className="bg-gray-900 border border-gray-800 rounded-lg divide-y divide-gray-800 mt-4">
        <div className="px-5 py-4 flex items-center gap-4">
          <a href="https://web.g3robotics.com/members" className="text-red-400 underline">Click here to visit the G3 members page</a>
        </div>
      </div>

      <div className="bg-gray-900 border border-gray-800 rounded-lg divide-y divide-gray-800 mt-4">
        <div className="px-5 py-4 flex items-center gap-4">
          <div className="w-12 h-12 rounded-full bg-gray-800 flex items-center justify-center text-lg font-semibold text-gray-300 shrink-0">
            {me.displayName.charAt(0).toUpperCase()}
          </div>
          <div className="min-w-0">
            <p className="text-white font-semibold truncate">{me.displayName}</p>
            <p className="text-gray-400 text-sm truncate">{me.email}</p>
          </div>
          <span className="ml-auto text-xs px-2.5 py-0.5 rounded-full border capitalize bg-green-500/20 text-green-300 border-green-500/30 shrink-0">
            {me.status}
          </span>
        </div>

        <div className="px-5 py-4">
          <p className="text-xs text-gray-500 uppercase tracking-wide mb-3">Sign-in methods</p>
          <div className="space-y-2">
            {me.identities.map((identity) => (
              <div key={identity.provider} className="flex items-center justify-between text-sm">
                <span className="text-white">
                  {PROVIDER_LABELS[identity.provider] ?? identity.provider}
                </span>
                <span className="text-gray-500 text-xs">
                  Added {new Date(identity.createdAt * 1000).toLocaleDateString()}
                </span>
              </div>
            ))}
          </div>

          {!me.identities.some((i) => i.provider === "google") && (
            <a
              href={`${apiBase}/auth/google/link`}
              className="mt-3 w-full flex items-center justify-center gap-2 rounded-lg bg-gray-800 border border-gray-700 hover:border-red-400 px-4 py-2 text-sm text-gray-300 transition-colors"
            >
              <FaGoogle size={16} />
              Connect Google
            </a>
          )}
          {!me.identities.some((i) => i.provider === "github") && (
            <a
              href={`${apiBase}/auth/github/link`}
              className="mt-3 w-full flex items-center justify-center gap-2 rounded-lg bg-gray-800 border border-gray-700 hover:border-red-400 px-4 py-2 text-sm text-gray-300 transition-colors"
            >
              <FaGithub size={16} />
              Connect GitHub
            </a>
          )}
          {!me.identities.some((i) => i.provider === "steam") && (
            <a
              href={`${apiBase}/auth/steam/link`}
              className="mt-3 w-full flex items-center justify-center gap-2 rounded-lg bg-gray-800 border border-gray-700 hover:border-red-400 px-4 py-2 text-sm text-gray-300 transition-colors"
            >
              <FaSteam size={16} />
              Connect Steam
            </a>
          )}
          {!me.identities.some((i) => i.provider === "slack") && (
            <div className="mt-3">
              {slackCode ? (
                <div className="rounded-lg bg-gray-800 border border-gray-700 px-4 py-3 space-y-2">
                  <p className="text-xs text-gray-400 text-center">
                    DM this code to the G3 Slack bot, or run{" "}
                    <span className="font-mono text-red-400">/link {slackCode}</span>
                  </p>
                  <p className="font-mono text-3xl font-bold text-white text-center tracking-widest">
                    {slackCode}
                  </p>
                  <div className="flex items-center justify-center gap-1.5 text-xs text-gray-500">
                    <Loader2 size={12} className="animate-spin" />
                    Waiting…
                  </div>
                </div>
              ) : (
                <>
                  <button
                    type="button"
                    onClick={handleConnectSlack}
                    className="w-full flex items-center justify-center gap-2 rounded-lg bg-gray-800 border border-gray-700 hover:border-red-400 px-4 py-2 text-sm text-gray-300 transition-colors"
                  >
                    <FaSlack size={16} />
                    Connect Slack
                  </button>
                  {slackError && (
                    <p className="mt-1 text-xs text-red-400 text-center">{slackError}</p>
                  )}
                </>
              )}
            </div>
          )}
          {!me.identities.some((i) => i.provider === "local") && !passwordDone && (
            <form onSubmit={handleSetPassword} className="mt-3 space-y-2">
              <div className="flex gap-2">
                <input
                  type="password"
                  autoComplete="new-password"
                  placeholder="Set a password…"
                  minLength={8}
                  required
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  disabled={passwordLoading}
                  className="flex-1 rounded-lg bg-gray-800 border border-gray-700 px-3 py-2 text-sm text-white placeholder-gray-500 focus:outline-none focus:border-red-400"
                />
                <button
                  type="submit"
                  disabled={passwordLoading || newPassword.length < 8}
                  className="flex items-center gap-1.5 rounded-lg bg-gray-800 border border-gray-700 hover:border-red-400 px-3 py-2 text-sm text-gray-300 disabled:opacity-50 transition-colors"
                >
                  {passwordLoading ? (
                    <Loader2 size={14} className="animate-spin" />
                  ) : (
                    <KeySquare size={14} />
                  )}
                  Set
                </button>
              </div>
              {passwordError && <p className="text-xs text-red-400">{passwordError}</p>}
            </form>
          )}
        </div>

        <div className="px-5 py-4 flex items-center justify-between">
          <p className="text-xs text-gray-500">
            Member since {new Date(me.createdAt * 1000).toLocaleDateString()}
          </p>
          <div className="flex items-center gap-3">
            {me.isAdmin ? (
              <Link
                to="/admin/users"
                className="text-xs text-purple-400 hover:text-purple-300 transition-colors flex items-center gap-1"
              >
                <Shield size={12} /> Admin
              </Link>
            ) : null}
            <button
              type="button"
              onClick={handleLogout}
              className="text-xs text-gray-500 hover:text-red-400 transition-colors"
            >
              Sign out
            </button>
          </div>
        </div>
      </div>
    </main>
  );
}
