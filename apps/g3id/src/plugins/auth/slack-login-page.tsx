import { Loader2 } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { api } from "../../lib/api";

type PollStatus =
  | { status: "pending" }
  | { status: "success"; action?: string }
  | { status: "failed"; message: string }
  | { status: "expired" }
  | { status: "signup_pending" };

export function SlackLoginPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const token = searchParams.get("token") ?? "";
  const code = searchParams.get("code") ?? "";
  const redirect = searchParams.get("redirect");
  const [pollStatus, setPollStatus] = useState<PollStatus>({ status: "pending" });
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const formattedCode = code;

  useEffect(() => {
    if (!token) {
      navigate("/login");
      return;
    }

    const poll = async () => {
      try {
        const res = await api.auth.slack.status.$get({ query: { token } });
        if (!res.ok) return;
        const data = (await res.json()) as PollStatus;
        if (data.status === "pending") return;

        if (intervalRef.current) clearInterval(intervalRef.current);

        if (data.status === "success") {
          if (redirect) {
            window.location.href = redirect;
          } else {
            navigate("/dashboard");
          }
          return;
        }
        if (data.status === "signup_pending") {
          navigate("/signup/pending");
          return;
        }
        setPollStatus(data);
      } catch {
        // network error — keep polling
      }
    };

    poll();
    intervalRef.current = setInterval(poll, 2000);

    const onVisible = () => {
      if (document.visibilityState === "visible") poll();
    };
    document.addEventListener("visibilitychange", onVisible);

    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [token, navigate, redirect]);

  async function handleCancel() {
    if (intervalRef.current) clearInterval(intervalRef.current);
    if (token) {
      await api.auth.slack.cancel.$delete({ query: { token } });
    }
    navigate("/login");
  }

  const isTerminal = pollStatus.status === "failed" || pollStatus.status === "expired";

  return (
    <main className="flex-1 flex items-center justify-center px-4">
      <div className="w-full max-w-sm space-y-6 text-center">
        <div>
          <h1 className="text-5xl font-bold text-white">
            <span className="text-primary-500">G3</span>ID
          </h1>
          <p className="mt-2 text-secondary-200 text-sm">Sign in with Slack</p>
        </div>

        {!isTerminal && (
          <>
            <div className="bg-secondary-700 border border-secondary-600 rounded-xl px-8 py-6">
              <p className="text-xs text-secondary-300 uppercase tracking-wide mb-3">Your code</p>
              <p className="text-5xl font-mono font-bold text-white tracking-widest">
                {formattedCode}
              </p>
            </div>

            <div className="space-y-1">
              <p className="text-sm text-gray-200">
                DM this code to the{" "}
                <span className="text-primary-500 font-medium">G3 Slack bot</span>, or run:
              </p>
              <p className="font-mono text-sm text-primary-400">/signin {formattedCode}</p>
            </div>

            <div className="flex items-center justify-center gap-2 text-sm text-secondary-300 mb-2">
              <Loader2 size={16} className="animate-spin" />
              Waiting for Slack confirmation…
            </div>

            <div className="flex justify-center text-sm text-secondary-300 mt-0">
              Be patient: this can take up to a minute after the code is sent on slower networks.
            </div>
          </>
        )}

        {isTerminal && (
          <div className="space-y-4">
            <p className="text-sm text-primary-400">
              {pollStatus.status === "expired" ? "This code has expired." : pollStatus.message}
            </p>
            <button
              type="button"
              onClick={() => navigate("/login")}
              className="w-full rounded-lg bg-primary-500 hover:bg-primary-600 text-white font-semibold py-2.5 text-sm transition-colors"
            >
              Try again
            </button>
          </div>
        )}

        {!isTerminal && (
          <button
            type="button"
            onClick={handleCancel}
            className="text-sm text-secondary-300 hover:text-primary-400 transition-colors"
          >
            ← Go back
          </button>
        )}
      </div>
    </main>
  );
}
