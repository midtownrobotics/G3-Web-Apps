import { KeySquare } from "lucide-react";
import { FaGithub, FaGoogle, FaSlack, FaSteam } from "react-icons/fa";
import { Link } from "react-router-dom";

const apiBase = import.meta.env.VITE_API_BASE_URL ?? "";

export function LoginPage() {
  return (
    <main className="flex-1 flex items-center justify-center px-4">
      <div className="w-full max-w-sm space-y-6">
        <div className="text-center">
          <h1 className="text-3xl font-bold text-white">
            Welcome to <span className="text-red-400">G3</span>ID
          </h1>
          <p className="mt-2 text-gray-400 text-sm">Choose a sign-in method</p>
        </div>

        <div className="space-y-3">
          <a
            href={`${apiBase}/auth/slack/initiate`}
            className="w-full flex items-center justify-center gap-3 rounded-lg bg-gray-900 border border-gray-700 hover:border-red-400 px-4 py-2.5 text-sm text-white transition-colors"
          >
            <span className="text-base">
              <FaSlack size={20} />
            </span>
            Sign in with Slack
          </a>
          <a
            href={`${apiBase}/auth/google`}
            className="w-full flex items-center justify-center gap-3 rounded-lg bg-gray-900 border border-gray-700 hover:border-red-400 px-4 py-2.5 text-sm text-white transition-colors"
          >
            <span className="text-base">
              <FaGoogle size={20} />
            </span>
            Sign in with Google
          </a>
          <a
            href={`${apiBase}/auth/github`}
            className="w-full flex items-center justify-center gap-3 rounded-lg bg-gray-900 border border-gray-700 hover:border-red-400 px-4 py-2.5 text-sm text-white transition-colors"
          >
            <span className="text-base">
              <FaGithub size={20} />
            </span>
            Sign in with GitHub
          </a>
          <button
            type="button"
            className="w-full flex items-center justify-center gap-3 rounded-lg bg-gray-900 border border-gray-700 hover:border-red-400 px-4 py-2.5 text-sm text-white transition-colors"
          >
            <span className="text-base">
              <FaSteam size={20} />
            </span>
            Sign in with Steam
          </button>
          <Link
            to="/login/email"
            className="w-full flex items-center justify-center gap-3 rounded-lg bg-gray-900 border border-gray-700 hover:border-red-400 px-4 py-2.5 text-sm text-white transition-colors"
          >
            <span className="text-base">
              <KeySquare />
            </span>
            Continue with Email
          </Link>
        </div>

        <p className="text-center text-sm text-gray-500">
          Don't have an account?{" "}
          <Link to="/signup" className="text-red-400 hover:text-red-300 transition-colors">
            Sign up
          </Link>
        </p>
      </div>
    </main>
  );
}
