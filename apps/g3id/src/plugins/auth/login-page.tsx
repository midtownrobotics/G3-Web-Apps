import { KeySquare } from "lucide-react";
import { FaGithub, FaGoogle, FaSlack, FaSteam } from "react-icons/fa";
import { Link, useSearchParams } from "react-router-dom";

const apiBase = import.meta.env.VITE_API_BASE_URL ?? "";

export function LoginPage() {
  const [searchParams] = useSearchParams();
  const error = searchParams.get("error");
  const redirect = searchParams.get("redirect") ?? "";

  const rp = redirect ? `?redirect=${encodeURIComponent(redirect)}` : "";
  const emailTo = redirect
    ? `/login/email?redirect=${encodeURIComponent(redirect)}`
    : "/login/email";

  return (
    <main className="flex-1 flex items-center justify-center px-4 bg-secondary-900">
      <div className="w-full max-w-sm space-y-6">
        <div className="text-center">
          <h1 className="text-5xl font-bold text-white">
            Welcome to <span className="text-primary-500">G3</span>ID
          </h1>
          <p className="mt-2 text-secondary-200 text-sm">Sign in with your account</p>
        </div>
        {error && <p className="text-sm text-primary-400 text-center">{error}</p>}

        <div className="space-y-3">
          <a
            href={`${apiBase}/auth/slack/initiate${rp}`}
            className="w-full flex items-center justify-center gap-3 rounded-lg bg-secondary-700 border border-gray-600 hover:border-primary-400 hover:bg-secondary-600 px-4 py-2.5 text-sm text-white transition-colors"
          >
            <FaSlack size={20} />
            Sign in with Slack
          </a>
          <a
            href={`${apiBase}/auth/google${rp}`}
            className="w-full flex items-center justify-center gap-3 rounded-lg bg-secondary-700 border border-gray-600 hover:border-primary-400 hover:bg-secondary-600 px-4 py-2.5 text-sm text-white transition-colors"
          >
            <FaGoogle size={20} />
            Sign in with Google
          </a>
          <a
            href={`${apiBase}/auth/github${rp}`}
            className="w-full flex items-center justify-center gap-3 rounded-lg bg-secondary-700 border border-gray-600 hover:border-primary-400 hover:bg-secondary-600 px-4 py-2.5 text-sm text-white transition-colors"
          >
            <FaGithub size={20} />
            Sign in with GitHub
          </a>
          <a
            href={`${apiBase}/auth/steam${rp}`}
            className="w-full flex items-center justify-center gap-3 rounded-lg bg-secondary-700 border border-gray-600 hover:border-primary-400 hover:bg-secondary-600 px-4 py-2.5 text-sm text-white transition-colors"
          >
            <FaSteam size={20} />
            Sign in with Steam
          </a>
          <Link
            to={emailTo}
            className="w-full flex items-center justify-center gap-3 rounded-lg bg-secondary-700 border border-gray-600 hover:border-primary-400 hover:bg-secondary-600 px-4 py-2.5 text-sm text-white transition-colors"
          >
            <KeySquare size={20} />
            Sign in with Email
          </Link>
        </div>

        <p className="text-center text-sm text-secondary-300">
          Don't have an account?{" "}
          <Link to="/signup" className="text-primary-400 hover:text-primary-300 transition-colors">
            Sign up
          </Link>
        </p>
      </div>
    </main>
  );
}
