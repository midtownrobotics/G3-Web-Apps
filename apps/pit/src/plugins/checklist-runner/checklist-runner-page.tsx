import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { api } from "../../shared/api";

type ChecklistList = {
  id: number;
  name: string;
  description: string | null;
  itemCount: number;
};

type ChecklistItem = {
  id: number;
  index: number;
  name: string;
  description: string | null;
};

export function ChecklistRunnerPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();

  const [list, setList] = useState<ChecklistList | null>(null);
  const [items, setItems] = useState<ChecklistItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [checked, setChecked] = useState<Set<number>>(new Set());

  useEffect(() => {
    if (!id) return;
    Promise.all([
      api.lists[":id"].$get({ param: { id } }),
      api.lists[":id"].items.$get({ param: { id } }),
    ]).then(async ([listRes, itemsRes]) => {
      if (!listRes.ok) { setNotFound(true); setLoading(false); return; }
      setList((await listRes.json()) as ChecklistList);
      if (itemsRes.ok) {
        const data = (await itemsRes.json()) as ChecklistItem[];
        setItems(data.sort((a, b) => a.index - b.index));
      }
      setLoading(false);
    });
  }, [id]);

  function toggle(itemId: number) {
    setChecked((prev) => {
      const next = new Set(prev);
      if (next.has(itemId)) next.delete(itemId);
      else next.add(itemId);
      return next;
    });
  }

  if (loading) {
    return (
      <main className="min-h-screen bg-gray-950 flex items-center justify-center">
        <p className="text-gray-400">Loading…</p>
      </main>
    );
  }

  if (notFound || !list) {
    return (
      <main className="min-h-screen bg-gray-950 flex flex-col items-center justify-center gap-4">
        <p className="text-gray-400">Checklist not found.</p>
        <button type="button" onClick={() => navigate("/checklists")} className="text-red-400 hover:text-red-300 text-sm underline">
          Back
        </button>
      </main>
    );
  }

  const doneCount = checked.size;
  const totalCount = items.length;
  const progress = totalCount > 0 ? doneCount / totalCount : 0;
  const allDone = doneCount === totalCount && totalCount > 0;

  return (
    <main className="min-h-screen bg-gray-950 text-white">
      <div className="max-w-2xl mx-auto px-4 py-8 space-y-6">

        {/* Header */}
        <div className="flex items-center justify-between">
          <button type="button" onClick={() => navigate("/checklists")} className="text-sm text-gray-500 hover:text-gray-300 transition-colors">
            ← Back
          </button>
          {checked.size > 0 && (
            <button
              type="button"
              onClick={() => setChecked(new Set())}
              className="text-sm text-gray-500 hover:text-red-400 transition-colors"
            >
              Reset
            </button>
          )}
        </div>

        <div>
          <h1 className="text-3xl font-bold tracking-tight">{list.name}</h1>
          {list.description && <p className="text-sm text-gray-500 mt-1">{list.description}</p>}
        </div>

        {/* Progress */}
        {totalCount > 0 && (
          <div className="space-y-2">
            <div className="flex items-center justify-between text-sm">
              <span className={allDone ? "text-green-400 font-semibold" : "text-gray-400"}>
                {allDone ? "All done!" : `${doneCount} of ${totalCount} complete`}
              </span>
              <span className="text-gray-600 text-xs">{Math.round(progress * 100)}%</span>
            </div>
            <div className="h-2 bg-gray-800 rounded-full overflow-hidden">
              <div
                className={`h-full rounded-full transition-all duration-300 ${allDone ? "bg-green-500" : "bg-red-500"}`}
                style={{ width: `${progress * 100}%` }}
              />
            </div>
          </div>
        )}

        {/* Items */}
        {items.length === 0 ? (
          <p className="text-gray-600 text-sm text-center py-8">
            No items.{" "}
            <button type="button" onClick={() => navigate(`/editor/${list.id}`)} className="text-red-400 hover:text-red-300 underline">
              Add some in the Editor.
            </button>
          </p>
        ) : (
          <div className="space-y-2">
            {items.map((item) => {
              const isChecked = checked.has(item.id);
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => toggle(item.id)}
                  className={`w-full flex items-start gap-4 p-4 rounded-xl border text-left transition-all ${
                    isChecked
                      ? "bg-gray-900 border-gray-800 opacity-60"
                      : "bg-gray-900 border-gray-700 hover:border-gray-500"
                  }`}
                >
                  {/* Checkbox */}
                  <div className={`mt-0.5 w-6 h-6 rounded-md border-2 shrink-0 flex items-center justify-center transition-colors ${
                    isChecked
                      ? "bg-red-600 border-red-600"
                      : "border-gray-600"
                  }`}>
                    {isChecked && (
                      <svg viewBox="0 0 12 10" className="w-3.5 h-3 fill-none stroke-white stroke-2" strokeLinecap="round" strokeLinejoin="round">
                        <polyline points="1,5 4,8 11,1" />
                      </svg>
                    )}
                  </div>

                  {/* Text */}
                  <div className="min-w-0">
                    <p className={`text-base font-medium transition-colors ${isChecked ? "line-through text-gray-500" : "text-white"}`}>
                      {item.name}
                    </p>
                    {item.description && (
                      <p className={`text-sm mt-0.5 ${isChecked ? "text-gray-600" : "text-gray-500"}`}>
                        {item.description}
                      </p>
                    )}
                  </div>
                </button>
              );
            })}
          </div>
        )}
      </div>
    </main>
  );
}
