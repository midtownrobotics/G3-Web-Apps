import { KeySquare, Loader2, MailIcon } from "lucide-react";
import { useState } from "react";
import { FaSlack } from "react-icons/fa";
import { Link } from "react-router-dom";

type AuthMethod = "email-link" | "slack-link" | "password";
type SentMethod = "email-link" | "slack-link";

const METHOD_CONFIG: Record<AuthMethod, { label: string; icon: React.ReactNode }> = {
  "email-link": { label: "Email magic link", icon: <MailIcon size={18} /> },
  "slack-link": { label: "Slack magic link", icon: <FaSlack size={20} /> },
  password: { label: "Enter password", icon: <KeySquare size={18} /> },
};

async function lookupAuthMethods(identifier: string): Promise<AuthMethod[]> {
  // const apiBase = import.meta.env.VITE_API_BASE_URL ?? "";
  // const response = await fetch(`${apiBase}/auth/lookup`, {
  //   method: "POST",
  //   headers: { "Content-Type": "application/json" },
  //   body: JSON.stringify({ identifier }),
  // });
  // if (response.status === 404) throw new Error("No account found for that email or username.");
  // if (!response.ok) throw new Error("Something went wrong. Try again.");
  // return (await response.json()).methods as AuthMethod[];
  void identifier;
  return ["email-link", "slack-link", "password"]; // stub
}

async function sendMagicLink(identifier: string, method: SentMethod): Promise<void> {
  // const apiBase = import.meta.env.VITE_API_BASE_URL ?? "";
  // await fetch(`${apiBase}/auth/send-link`, {
  //   method: "POST",
  //   headers: { "Content-Type": "application/json" },
  //   body: JSON.stringify({ identifier, method }),
  // });
  void identifier; void method;
}

async function loginWithPassword(identifier: string, password: string): Promise<void> {
  // const apiBase = import.meta.env.VITE_API_BASE_URL ?? "";
  // const response = await fetch(`${apiBase}/auth/login`, {
  //   method: "POST",
  //   headers: { "Content-Type": "application/json" },
  //   body: JSON.stringify({ identifier, password }),
  // });
  // if (!response.ok) throw new Error("Invalid credentials.");
  void identifier; void password;
}

export function EmailLoginPage() {
  const [identifier, setIdentifier] = useState("");
  const [methods, setMethods] = useState<AuthMethod[] | null>(null);
  const [sentMethod, setSentMethod] = useState<SentMethod | null>(null);
  const [showPassword, setShowPassword] = useState(false);
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleLookup(e: React.SyntheticEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const result = await lookupAuthMethods(identifier.trim());
      setMethods(result);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
    } finally {
      setLoading(false);
    }
  }

  async function handleMethodSelect(method: AuthMethod) {
    if (method === "password") {
      setShowPassword(true);
      setError(null);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      await sendMagicLink(identifier.trim(), method);
      setSentMethod(method);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
    } finally {
      setLoading(false);
    }
  }

  async function handlePasswordLogin(e: React.SyntheticEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      await loginWithPassword(identifier.trim(), password);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
    } finally {
      setLoading(false);
    }
  }

  function resetToMethods() {
    setSentMethod(null);
    setShowPassword(false);
    setPassword("");
    setError(null);
  }

  function resetToIdentifier() {
    setMethods(null);
    setSentMethod(null);
    setShowPassword(false);
    setPassword("");
    setError(null);
  }

  function getSubtitle() {
    if (sentMethod === "email-link") return "Check your inbox";
    if (sentMethod === "slack-link") return "Check your Slack DMs";
    if (showPassword) return "Enter your password";
    if (methods !== null) return "Choose how to sign in";
    return "Enter your email or username";
  }

  return (
    <main className="flex-1 flex items-center justify-center px-4">
      <div className="w-full max-w-sm space-y-6">
        <div className="text-center">
          <h1 className="text-3xl font-bold text-white">
            <span className="text-red-400">G3</span>ID
          </h1>
          <p className="mt-2 text-gray-400 text-sm">{getSubtitle()}</p>
        </div>

        {/* Step 1: Identifier input */}
        {methods === null && (
          <form onSubmit={handleLookup} className="space-y-4">
            <div className="space-y-1">
              <label className="text-sm text-gray-300" htmlFor="identifier">
                Email or Username
              </label>
              <input
                id="identifier"
                className="w-full rounded-lg bg-gray-900 border border-gray-700 px-4 py-2.5 text-white text-sm placeholder-gray-500 focus:outline-none focus:border-red-400"
                placeholder="me@grayjn.com or GrayJ"
                value={identifier}
                onChange={(e) => setIdentifier(e.target.value)}
                disabled={loading}
                required
              />
            </div>
            {error && <p className="text-sm text-red-400">{error}</p>}
            <button
              type="submit"
              disabled={loading || identifier.trim().length === 0}
              className="w-full flex items-center justify-center gap-2 rounded-lg bg-red-500 hover:bg-red-400 disabled:opacity-50 disabled:cursor-not-allowed text-white font-semibold py-2.5 text-sm transition-colors"
            >
              {loading && <Loader2 size={16} className="animate-spin" />}
              {loading ? "Looking up…" : "Continue"}
            </button>
          </form>
        )}

        {/* Step 2: Method selection */}
        {methods !== null && !sentMethod && !showPassword && (
          <div className="space-y-3">
            <p className="text-xs text-gray-500 text-center">
              Signing in as <span className="text-gray-300">{identifier}</span>
              {" · "}
              <button
                type="button"
                onClick={resetToIdentifier}
                className="text-red-400 hover:text-red-300 transition-colors"
              >
                Change
              </button>
            </p>
            {error && <p className="text-sm text-red-400 text-center">{error}</p>}
            {methods.map((method) => {
              const config = METHOD_CONFIG[method];
              return (
                <button
                  key={method}
                  type="button"
                  disabled={loading}
                  onClick={() => handleMethodSelect(method)}
                  className="w-full flex items-center justify-center gap-3 rounded-lg bg-gray-900 border border-gray-700 hover:border-red-400 disabled:opacity-50 px-4 py-2.5 text-sm text-white transition-colors"
                >
                  {config.icon}
                  {config.label}
                </button>
              );
            })}
          </div>
        )}

        {/* Step 2b: Password entry */}
        {showPassword && (
          <form onSubmit={handlePasswordLogin} className="space-y-4">
            <div className="space-y-1">
              <label className="text-sm text-gray-300" htmlFor="password">
                Password
              </label>
              <input
                id="password"
                type="password"
                autoComplete="current-password"
                className="w-full rounded-lg bg-gray-900 border border-gray-700 px-4 py-2.5 text-white text-sm placeholder-gray-500 focus:outline-none focus:border-red-400"
                placeholder="••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                disabled={loading}
                autoFocus
                required
              />
            </div>
            {error && <p className="text-sm text-red-400">{error}</p>}
            <button
              type="submit"
              disabled={loading || password.length === 0}
              className="w-full flex items-center justify-center gap-2 rounded-lg bg-red-500 hover:bg-red-400 disabled:opacity-50 disabled:cursor-not-allowed text-white font-semibold py-2.5 text-sm transition-colors"
            >
              {loading && <Loader2 size={16} className="animate-spin" />}
              {loading ? "Signing in…" : "Sign in"}
            </button>
            <div className="text-center">
              <button
                type="button"
                onClick={resetToMethods}
                className="text-sm text-gray-400 hover:text-red-400 transition-colors"
              >
                ← Try another method
              </button>
            </div>
          </form>
        )}

        {/* Step 3: Link sent */}
        {sentMethod && (
          <div className="space-y-4 text-center">
            <div className="flex justify-center text-gray-300">
              {sentMethod === "email-link" ? <MailIcon size={40} /> : <FaSlack size={40} />}
            </div>
            {sentMethod === "email-link" ? (
              <p className="text-sm text-gray-300">We sent a sign-in link to your email address.</p>
            ) : (
              <p className="text-sm text-gray-300">We sent a sign-in link to your Slack DMs.</p>
            )}
            <p className="text-xs text-gray-500">
              {"Didn't get it? "}
              <button
                type="button"
                onClick={() => handleMethodSelect(sentMethod)}
                className="text-red-400 hover:text-red-300 transition-colors"
              >
                Resend
              </button>
            </p>
            <button
              type="button"
              onClick={resetToMethods}
              className="text-sm text-gray-400 hover:text-red-400 transition-colors"
            >
              ← Try another method
            </button>
          </div>
        )}

        <p className="text-center text-sm">
          <Link to="/login" className="text-gray-400 hover:text-red-400 transition-colors">
            ← Other sign-in options
          </Link>
        </p>
      </div>
    </main>
  );
}
