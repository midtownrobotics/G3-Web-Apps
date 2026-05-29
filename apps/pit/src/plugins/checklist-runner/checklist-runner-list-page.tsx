import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { fetchLists } from "../../shared/getters/lists";
import type { ChecklistList } from "../../shared/getters/types";

export function ChecklistRunnerListPage() {
  const navigate = useNavigate();
  const [lists, setLists] = useState<ChecklistList[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchLists()
      .then(setLists)
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <main className="min-h-screen bg-gray-950 flex items-center justify-center">
        <p className="text-gray-400">Loading…</p>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-gray-950 text-white">
      <div className="max-w-2xl mx-auto px-4 py-8 space-y-6">
        <h1 className="text-3xl font-bold tracking-tight">Checklists</h1>

        {lists.length === 0 ? (
          <p className="text-gray-500 text-center py-12">
            No checklists yet.{" "}
            <button
              type="button"
              onClick={() => navigate("/editor")}
              className="text-red-400 hover:text-red-300 underline"
            >
              Create one in the Editor.
            </button>
          </p>
        ) : (
          <div className="space-y-3">
            {lists.map((list) => (
              <button
                key={list.id}
                type="button"
                onClick={() => navigate(`/checklists/${list.id}`)}
                className="w-full bg-gray-900 hover:bg-gray-800 border border-gray-700 hover:border-gray-600 rounded-xl p-5 text-left transition-colors group"
              >
                <div className="flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-lg font-semibold text-white group-hover:text-red-400 transition-colors truncate">
                      {list.name}
                    </p>
                    {list.description && (
                      <p className="text-sm text-gray-500 mt-0.5 truncate">{list.description}</p>
                    )}
                  </div>
                  <div className="flex items-center gap-3 shrink-0">
                    <span className="text-xs text-gray-500 bg-gray-800 rounded-full px-2 py-0.5">
                      {list.itemCount} {list.itemCount === 1 ? "item" : "items"}
                    </span>
                    <span className="text-gray-500 group-hover:text-red-400 transition-colors">
                      →
                    </span>
                  </div>
                </div>
              </button>
            ))}
          </div>
        )}
      </div>
    </main>
  );
}
