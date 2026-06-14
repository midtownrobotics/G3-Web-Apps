import { FaSlack } from "react-icons/fa";
import { Link } from "react-router-dom";

const apiBase = import.meta.env.VITE_API_BASE_URL ?? "";

export function SignupPage() {
  return (
    <main className="flex-1 flex items-center justify-center px-4">
      <div className="w-full max-w-sm space-y-6">
        <div className="text-center">
          <h1 className="text-3xl font-bold text-white">
            Join <span className="text-red-400">G3</span>ID
          </h1>
          <p className="mt-2 text-gray-300 text-sm">
            G3ID uses Slack for signup. Once you signup, you can add additional login methods.
          </p>
        </div>

        <a
          href={`${apiBase}/auth/slack/initiate`}
          className="w-full flex items-center justify-center gap-3 rounded-lg bg-red-600 hover:bg-red-500 px-4 py-3 text-sm text-white font-medium transition-colors"
        >
          <FaSlack size={20} />
          Sign up with Slack
        </a>

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
