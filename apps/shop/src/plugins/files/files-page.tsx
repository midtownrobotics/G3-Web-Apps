import { useEffect, useState } from "react";
import { api } from "../../shared/api";
import { getErrorMessage } from "../../shared/api-error";
import { ErrorBanner, PageLoading } from "../../shared/ui";
import { useAuthUser } from "../../shared/use-auth";

type Drawing = {
  id: number;
  partNumber: string;
  revision: string;
  filename: string;
  r2Key: string;
  fileSize: number | null;
  uploadedBy: string | null;
  createdAt: number;
};

type Stats = {
  totalDrawings: number;
  totalSize: number;
  uniqueParts: number;
};

export function FilesPage() {
  const user = useAuthUser();
  const [drawings, setDrawings] = useState<Drawing[]>([]);
  const [stats, setStats] = useState<Stats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [printingId, setPrintingId] = useState<number | null>(null);
  const [testPrinting, setTestPrinting] = useState(false);

  useEffect(() => {
    loadDrawings();
  }, []);

  async function loadDrawings() {
    try {
      setLoading(true);
      setError(null);
      const res = await api.drawings.$get();
      if (!res.ok) {
        setError(await getErrorMessage(res as unknown as Response));
        return;
      }
      const data = (await res.json()) as { drawings: Drawing[]; stats: Stats };
      setDrawings(data.drawings);
      setStats(data.stats);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load drawings");
    } finally {
      setLoading(false);
    }
  }

  async function handlePrint(drawing: Drawing) {
    setPrintingId(drawing.id);
    try {
      // Fetch the PDF from the drawing endpoint
      const apiBase = import.meta.env.VITE_API_BASE_URL ?? "";
      const downloadRes = await fetch(
        `${apiBase}/parts/${drawing.partNumber}/${drawing.revision}/drawing`,
      );

      if (!downloadRes.ok) {
        setError("Failed to download drawing for printing");
        return;
      }

      const pdfBuffer = await downloadRes.arrayBuffer();

      // Send to print API through backend proxy with PDF bytes
      const printRes = await fetch(`${apiBase}/print?title=${drawing.filename}`, {
        method: "POST",
        headers: {
          "content-type": "application/pdf",
        },
        body: pdfBuffer,
        credentials: "include",
      });

      const printData = (await printRes.json()) as { ok: boolean; jobId?: string; error?: string };
      if (!printData.ok) {
        setError(`Print failed: ${printData.error}`);
        return;
      }

      // Success - no need to show a popup, just silently succeed
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to print drawing");
    } finally {
      setPrintingId(null);
    }
  }

  async function handleTestPrint() {
    setTestPrinting(true);
    try {
      const testContent =
        "G3 Robotics Shop - Test Print\n\nIf you're seeing this, the printer is working!";
      const encoder = new TextEncoder();
      const testBuffer = encoder.encode(testContent);

      const printRes = await fetch(
        `${import.meta.env.VITE_API_BASE_URL ?? ""}/print?title=test-print`,
        {
          method: "POST",
          headers: {
            "content-type": "text/plain",
          },
          body: testBuffer,
          credentials: "include",
        },
      );

      const printData = (await printRes.json()) as { ok: boolean; jobId?: string; error?: string };
      if (!printData.ok) {
        setError(`Test print failed: ${printData.error}`);
        return;
      }

      // Success - show brief feedback
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to send test print");
    } finally {
      setTestPrinting(false);
    }
  }

  if (loading) return <PageLoading />;

  const groupedByPart = new Map<string, Drawing[]>();
  for (const drawing of drawings) {
    if (!groupedByPart.has(drawing.partNumber)) {
      groupedByPart.set(drawing.partNumber, []);
    }
    groupedByPart.get(drawing.partNumber)?.push(drawing);
  }

  const sortedParts = Array.from(groupedByPart.entries()).sort((a, b) => a[0].localeCompare(b[0]));

  const formatBytes = (bytes: number) => {
    if (bytes === 0) return "0 B";
    const k = 1024;
    const sizes = ["B", "KB", "MB", "GB"];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return `${Math.round((bytes / k ** i) * 100) / 100} ${sizes[i]}`;
  };

  const formatDate = (timestamp: number) => {
    return new Date(timestamp * 1000).toLocaleDateString();
  };

  return (
    <main className="min-h-screen bg-mist">
      <div className="max-w-full mx-auto px-6 py-8 space-y-5">
        <div className="flex items-center justify-between">
          <h1 className="font-display text-4xl text-ink">Files</h1>
          {user?.isAdmin && (
            <button
              type="button"
              onClick={handleTestPrint}
              disabled={testPrinting}
              className="px-4 py-2 text-sm font-medium border border-steel/40 text-steel hover:text-ink disabled:opacity-50 disabled:cursor-not-allowed rounded-lg transition-colors"
            >
              {testPrinting ? "Testing…" : "Test Print"}
            </button>
          )}
        </div>

        {error && <ErrorBanner message={error} />}

        {stats && (
          <div className="grid grid-cols-3 gap-4">
            <div className="bg-paper border border-steel/30 rounded-lg p-6">
              <div className="text-sm text-steel-dark mb-2">Total Drawings</div>
              <div className="text-3xl font-semibold text-ink">{stats.totalDrawings}</div>
            </div>
            <div className="bg-paper border border-steel/30 rounded-lg p-6">
              <div className="text-sm text-steel-dark mb-2">Total Storage</div>
              <div className="text-3xl font-semibold text-ink">{formatBytes(stats.totalSize)}</div>
            </div>
            <div className="bg-paper border border-steel/30 rounded-lg p-6">
              <div className="text-sm text-steel-dark mb-2">Unique Parts</div>
              <div className="text-3xl font-semibold text-ink">{stats.uniqueParts}</div>
            </div>
          </div>
        )}

        <div className="space-y-4">
          {sortedParts.map(([partNumber, partDrawings]) => (
            <div
              key={partNumber}
              className="bg-paper border border-steel/30 rounded-lg overflow-hidden"
            >
              <div className="bg-mist border-b border-steel/25 px-6 py-4">
                <h2 className="font-semibold text-ink">{partNumber}</h2>
                <p className="text-xs text-steel mt-1">
                  {partDrawings.length} file{partDrawings.length !== 1 ? "s" : ""} •{" "}
                  {formatBytes(partDrawings.reduce((sum, d) => sum + (d.fileSize || 0), 0))}
                </p>
              </div>

              <div className="divide-y divide-steel/25">
                {partDrawings.map((drawing) => (
                  <div
                    key={drawing.id}
                    className="px-6 py-4 flex items-center justify-between hover:bg-mist transition-colors"
                  >
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-ink truncate">{drawing.filename}</p>
                      <p className="text-xs text-steel mt-1">
                        {formatBytes(drawing.fileSize || 0)} • {formatDate(drawing.createdAt)} •{" "}
                        {drawing.uploadedBy || "unknown"}
                      </p>
                    </div>

                    <div className="ml-4 flex gap-2">
                      <button
                        type="button"
                        onClick={() => handlePrint(drawing)}
                        disabled={printingId === drawing.id}
                        className="px-3 py-1.5 text-xs font-medium bg-crimson text-paper hover:bg-crimson-dark disabled:bg-steel/30 disabled:cursor-not-allowed rounded transition-colors"
                      >
                        {printingId === drawing.id ? "Printing…" : "Print"}
                      </button>
                      <a
                        href={`${import.meta.env.VITE_API_BASE_URL ?? ""}/parts/${drawing.partNumber}/${drawing.revision}/drawing`}
                        download={drawing.filename}
                        className="px-3 py-1.5 text-xs font-medium border border-steel/40 text-steel hover:text-ink rounded transition-colors"
                      >
                        Download
                      </a>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>

        {drawings.length === 0 && (
          <div className="bg-paper border border-steel/30 rounded-lg p-8 text-center">
            <p className="text-steel">No drawings stored yet.</p>
          </div>
        )}
      </div>
    </main>
  );
}
