import { ChessBishop, KeySquare } from "lucide-react";
import { FaGithub, FaGoogle, FaSlack, FaSpotify } from "react-icons/fa";
import { Link } from "react-router-dom";

export function SignupPage() {
  return (
    <main className="flex-1 flex items-center justify-center px-4">
      <div className="w-full max-w-sm space-y-6">
        <div className="text-center">
          <h1 className="text-3xl font-bold text-white">
            Join <span className="text-red-400">G3</span>ID
          </h1>
          <p className="mt-2 text-gray-400 text-sm">Choose how to sign up</p>
        </div>

        <div className="space-y-3">
          <button
            type="button"
            className="w-full flex items-center justify-center gap-3 rounded-lg bg-gray-900 border border-gray-700 hover:border-red-400 px-4 py-2.5 text-sm text-white transition-colors"
          >
            <FaSlack size={20} />
            Sign up with Slack
          </button>
          <a
            href="/api/auth/google"
            className="w-full flex items-center justify-center gap-3 rounded-lg bg-gray-900 border border-gray-700 hover:border-red-400 px-4 py-2.5 text-sm text-white transition-colors"
          >
            <FaGoogle size={20} />
            Sign up with Google
          </a>
          <a
            href="/api/auth/github"
            className="w-full flex items-center justify-center gap-3 rounded-lg bg-gray-900 border border-gray-700 hover:border-red-400 px-4 py-2.5 text-sm text-white transition-colors"
          >
            <FaGithub size={20} />
            Sign up with GitHub
          </a>
          <button
            type="button"
            className="w-full flex items-center justify-center gap-3 rounded-lg bg-gray-900 border border-gray-700 hover:border-red-400 px-4 py-2.5 text-sm text-white transition-colors"
          >
            <FaSpotify size={20} />
            Sign up with Spotify
          </button>
          <Link
            to="/signup/email"
            className="w-full flex items-center justify-center gap-3 rounded-lg bg-gray-900 border border-gray-700 hover:border-red-400 px-4 py-2.5 text-sm text-white transition-colors"
          >
            <KeySquare size={20} />
            Continue with Email
          </Link>
        </div>
        <p className="text-center text-sm text-gray-500">
          Already have an account?{" "}
          <Link to="/login" className="text-red-400 hover:text-red-300 transition-colors">
            Log in
          </Link>
        </p>
      </div>
    </main>
  );
}
