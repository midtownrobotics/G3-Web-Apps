import { FaGithub, FaGoogle, FaSlack, FaSteam } from "react-icons/fa";
import { Link, useSearchParams } from "react-router-dom";

const apiBase = import.meta.env.VITE_API_BASE_URL ?? "";

export function LoginPage() {
  const [searchParams] = useSearchParams();
  const error = searchParams.get("error");
  const redirect = searchParams.get("redirect") ?? "";

  const rp = redirect ? `?redirect=${encodeURIComponent(redirect)}` : "";

  return (
    <main className="flex-1 flex items-center justify-center px-4 bg-secondary-50">
      <div className="w-full max-w-sm space-y-6">
        <div className="text-center">
          <h1 className="text-5xl font-bold text-secondary-900">
            Welcome to <span className="text-primary-500">G3</span>ID
          </h1>
          <p className="mt-2 text-secondary-600 text-sm">Sign in with your account</p>
        </div>
        {error && <p className="text-sm text-primary-500 text-center">{error}</p>}

        <div className="space-y-3">
          <a
            href={`${apiBase}/auth/slack/initiate${rp}`}
            className="w-full flex items-center justify-center gap-3 rounded-lg bg-white border border-secondary-300 hover:border-primary-500 hover:bg-secondary-50 px-4 py-2.5 text-sm text-secondary-900 transition-colors"
          >
            <FaSlack size={20} />
            Sign in with Slack
          </a>
          <a
            href={`${apiBase}/auth/google${rp}`}
            className="w-full flex items-center justify-center gap-3 rounded-lg bg-white border border-secondary-300 hover:border-primary-500 hover:bg-secondary-50 px-4 py-2.5 text-sm text-secondary-900 transition-colors"
          >
            <FaGoogle size={20} />
            Sign in with Google
          </a>
          <a
            href={`${apiBase}/auth/github${rp}`}
            className="w-full flex items-center justify-center gap-3 rounded-lg bg-white border border-secondary-300 hover:border-primary-500 hover:bg-secondary-50 px-4 py-2.5 text-sm text-secondary-900 transition-colors"
          >
            <FaGithub size={20} />
            Sign in with GitHub
          </a>
          <a
            href={`${apiBase}/auth/steam${rp}`}
            className="w-full flex items-center justify-center gap-3 rounded-lg bg-white border border-secondary-300 hover:border-primary-500 hover:bg-secondary-50 px-4 py-2.5 text-sm text-secondary-900 transition-colors"
          >
            <FaSteam size={20} />
            Sign in with Steam
          </a>
        </div>

        <p className="text-center text-sm text-secondary-500">
          Don't have an account?{" "}
          <Link to="/signup" className="text-primary-500 hover:text-primary-600 transition-colors">
            Sign up
          </Link>
        </p>
      </div>
    </main>
  );
}
