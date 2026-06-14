import { Link } from "react-router-dom";

export function PendingPage() {
  return (
    <main className="flex-1 flex items-center justify-center px-4">
      <div className="w-full max-w-sm space-y-6 text-center">
        <div>
          <h1 className="text-3xl font-bold text-white">Account pending</h1>
          <p className="mt-2 text-secondary-200 text-sm">
            Your account is awaiting admin approval. You'll be able to sign in once it's approved.
          </p>
        </div>

        <Link
          to="/login"
          className="block text-sm text-primary-400 hover:text-primary-300 transition-colors"
        >
          ← Back to sign in
        </Link>
      </div>
    </main>
  );
}
