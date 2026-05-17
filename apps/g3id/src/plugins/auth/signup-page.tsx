import { Link } from "react-router-dom";

export function SignupPage() {
  return (
    <main className="flex-1 flex items-center justify-center px-4">
      <div className="w-full max-w-sm space-y-8">
        <div className="text-center">
          <h1 className="text-3xl font-bold text-white">
            Join <span className="text-red-400">G3</span>ID
          </h1>
          <p className="mt-2 text-gray-400 text-sm">Create your team account</p>
        </div>

        <form className="space-y-4">
          <div className="space-y-1">
            <label className="text-sm text-gray-300" htmlFor="name">
              Full name
            </label>
            <input
              id="name"
              type="text"
              autoComplete="name"
              className="w-full rounded-lg bg-gray-900 border border-gray-700 px-4 py-2.5 text-white text-sm placeholder-gray-500 focus:outline-none focus:border-red-400"
              placeholder="Alex Johnson"
            />
          </div>

          <div className="space-y-1">
            <label className="text-sm text-gray-300" htmlFor="email">
              Email
            </label>
            <input
              id="email"
              type="email"
              autoComplete="email"
              className="w-full rounded-lg bg-gray-900 border border-gray-700 px-4 py-2.5 text-white text-sm placeholder-gray-500 focus:outline-none focus:border-red-400"
              placeholder="you@g3robotics.com"
            />
          </div>

          <div className="space-y-1">
            <label className="text-sm text-gray-300" htmlFor="password">
              Password
            </label>
            <input
              id="password"
              type="password"
              autoComplete="new-password"
              className="w-full rounded-lg bg-gray-900 border border-gray-700 px-4 py-2.5 text-white text-sm placeholder-gray-500 focus:outline-none focus:border-red-400"
              placeholder="••••••••"
            />
          </div>

          <button
            type="submit"
            className="w-full rounded-lg bg-red-500 hover:bg-red-400 text-white font-semibold py-2.5 text-sm transition-colors"
          >
            Create account
          </button>
        </form>

        <p className="text-center text-sm text-gray-500">
          Already have an account?{" "}
          <Link to="/login" className="text-red-400 hover:text-red-300">
            Log in
          </Link>
        </p>
      </div>
    </main>
  );
}
