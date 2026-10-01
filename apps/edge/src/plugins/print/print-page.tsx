import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api, getErrorMessage } from "../../shared/api";
import { formatAgo, formatBytes } from "../../shared/format";
import { Card, ErrorBanner, Loading, Page } from "../../shared/ui";
import { useLoad } from "../../shared/use-load";
import { input, loadPrinters, plainButton, primaryButton, printerStatus } from "./shared";

const MAX_BYTES = 50 * 1024 * 1024;
const ACCEPT = ".pdf,.txt,.jpg,.jpeg,.png,application/pdf,text/plain,image/jpeg,image/png";

async function loadJobs() {
  const res = await api.print.jobs.$get();
  if (!res.ok) throw new Error(await getErrorMessage(res));
  return (await res.json()).jobs;
}

export function PrintPage() {
  const printers = useLoad(loadPrinters, []);
  const jobs = useLoad(loadJobs, []);

  // While something is printing, refresh the queue every few seconds (for up to 2 minutes).
  const active =
    jobs.data?.some((j) => ["pending", "held", "processing"].includes(j.state)) ?? false;
  const [watchUntil, setWatchUntil] = useState(0);
  useEffect(() => {
    if (!active && Date.now() > watchUntil) return;
    if (Date.now() > watchUntil + 120_000) return;
    const t = setTimeout(jobs.reload, 5000);
    return () => clearTimeout(t);
  });

  return (
    <Page title="Print">
      {printers.error ? (
        <ErrorBanner message={printers.error} />
      ) : !printers.data ? (
        <Loading />
      ) : (
        <PrintForm
          printers={printers.data}
          onPrinted={() => {
            setWatchUntil(Date.now());
            jobs.reload();
          }}
        />
      )}
      <Card title="Queue">
        {jobs.error && <ErrorBanner message={jobs.error} />}
        {!jobs.data && !jobs.error && <Loading />}
        {jobs.data && <JobList jobs={jobs.data} onChanged={jobs.reload} />}
      </Card>
    </Page>
  );
}

function PrintForm({
  printers,
  onPrinted,
}: {
  printers: Awaited<ReturnType<typeof loadPrinters>>;
  onPrinted: () => void;
}) {
  const defaultPrinter = printers.find((p) => p.isDefault) ?? printers[0];
  const [file, setFile] = useState<File | null>(null);
  const [printer, setPrinter] = useState(defaultPrinter?.name ?? "");
  const [copies, setCopies] = useState("1");
  const [sides, setSides] = useState("one-sided");
  const [color, setColor] = useState("monochrome");
  const [media, setMedia] = useState("na_letter_8.5x11in");
  const [pageRanges, setPageRanges] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ error: boolean; text: string } | null>(null);

  if (printers.length === 0) {
    return (
      <Card>
        <p className="text-sm text-secondary-500">
          No printers are set up on the edge box yet.{" "}
          <Link to="/print/printers" className="text-primary-500 hover:text-primary-700">
            Add one on the Printers page
          </Link>
          .
        </p>
      </Card>
    );
  }

  async function print() {
    if (!file) return;
    if (file.size > MAX_BYTES) {
      setMessage({ error: true, text: "The file is too large (50 MB max)." });
      return;
    }
    setBusy(true);
    setMessage(null);
    const query = new URLSearchParams({ title: file.name, printer, copies, sides, color, media });
    if (pageRanges.trim()) query.set("pageRanges", pageRanges.trim());
    try {
      const res = await fetch(`${import.meta.env.VITE_API_BASE_URL ?? ""}/print/jobs?${query}`, {
        method: "POST",
        headers: { "Content-Type": file.type || "application/pdf" },
        body: file,
        credentials: "include",
      });
      const data = (await res.json()) as { ok?: boolean; jobId?: number; error?: string };
      if (!res.ok || !data.ok) {
        setMessage({ error: true, text: data.error ?? (await getErrorMessage(res)) });
      } else {
        setMessage({
          error: false,
          text: `Sent "${file.name}" to ${printer} (job ${data.jobId}).`,
        });
        onPrinted();
      }
    } catch (err) {
      setMessage({ error: true, text: err instanceof Error ? err.message : "Print failed." });
    } finally {
      setBusy(false);
    }
  }

  const selected = printers.find((p) => p.name === printer);
  const status = selected ? printerStatus(selected) : null;
  const field =
    "flex flex-col gap-1 text-xs font-bold uppercase tracking-widest text-secondary-400";
  return (
    <Card title="Print a file">
      <form
        className="space-y-4"
        onSubmit={(e) => {
          e.preventDefault();
          void print();
        }}
      >
        <input
          type="file"
          accept={ACCEPT}
          onChange={(e) => setFile(e.target.files?.[0] ?? null)}
          className="block text-sm text-secondary-700 file:mr-3 file:rounded-lg file:border-0 file:bg-secondary-100 file:px-3 file:py-1.5 file:text-sm file:font-medium hover:file:bg-secondary-200"
        />
        {file && <p className="text-xs text-secondary-500">{formatBytes(file.size)}</p>}
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
          <label className={field}>
            Printer
            <select className={input} value={printer} onChange={(e) => setPrinter(e.target.value)}>
              {printers.map((p) => (
                <option key={p.name} value={p.name}>
                  {p.description ?? p.name}
                  {p.isDefault ? " (default)" : ""}
                </option>
              ))}
            </select>
          </label>
          <label className={field}>
            Copies
            <input
              className={input}
              type="number"
              min="1"
              max="50"
              value={copies}
              onChange={(e) => setCopies(e.target.value)}
            />
          </label>
          <label className={field}>
            Sides
            <select className={input} value={sides} onChange={(e) => setSides(e.target.value)}>
              <option value="one-sided">One-sided</option>
              <option value="two-sided-long-edge">Two-sided (long edge)</option>
              <option value="two-sided-short-edge">Two-sided (short edge)</option>
            </select>
          </label>
          <label className={field}>
            Color
            <select className={input} value={color} onChange={(e) => setColor(e.target.value)}>
              <option value="monochrome">Black and white</option>
              <option value="color">Color</option>
            </select>
          </label>
          <label className={field}>
            Paper
            <select className={input} value={media} onChange={(e) => setMedia(e.target.value)}>
              <option value="na_letter_8.5x11in">Letter</option>
              <option value="na_legal_8.5x14in">Legal</option>
              <option value="na_ledger_11x17in">Tabloid (11×17)</option>
              <option value="iso_a4_210x297mm">A4</option>
            </select>
          </label>
          <label className={field}>
            Pages
            <input
              className={input}
              value={pageRanges}
              placeholder="All (or e.g. 1-3,5)"
              onChange={(e) => setPageRanges(e.target.value)}
            />
          </label>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <button type="submit" className={primaryButton} disabled={!file || busy}>
            {busy ? "Sending…" : "Print"}
          </button>
          {status && (
            <span className="flex items-center gap-1.5 text-sm text-secondary-500">
              <span className={`w-2 h-2 rounded-full ${status.dot}`} aria-hidden />
              {status.label}
            </span>
          )}
          {message && (
            <span className={`text-sm ${message.error ? "text-primary-600" : "text-emerald-700"}`}>
              {message.text}
            </span>
          )}
        </div>
      </form>
    </Card>
  );
}

const JOB_STATE_LABELS: Record<string, string> = {
  pending: "Waiting",
  held: "Held",
  processing: "Printing",
  stopped: "Stopped",
  canceled: "Canceled",
  aborted: "Failed",
  completed: "Done",
};

function JobList({
  jobs,
  onChanged,
}: { jobs: Awaited<ReturnType<typeof loadJobs>>; onChanged: () => void }) {
  const [error, setError] = useState<string | null>(null);
  if (jobs.length === 0) return <p className="text-sm text-secondary-400">No recent print jobs.</p>;
  const now = Date.now() / 1000;
  return (
    <>
      {error && <ErrorBanner message={error} />}
      <ul className="divide-y divide-secondary-100">
        {jobs.map((j) => {
          const open = ["pending", "held", "processing", "stopped"].includes(j.state);
          return (
            <li key={j.id} className="py-2 flex flex-wrap items-center gap-x-3 gap-y-1">
              <span className="font-medium text-secondary-900 truncate max-w-xs">
                {j.title ?? `Job ${j.id}`}
              </span>
              <span
                className={`text-sm ${j.state === "aborted" ? "text-primary-600" : "text-secondary-600"}`}
              >
                {JOB_STATE_LABELS[j.state] ?? j.state}
              </span>
              <span className="text-xs text-secondary-400 flex-1 truncate">
                {j.printer}
                {j.userName ? ` · ${j.userName}` : ""}
                {j.createdAt ? ` · ${formatAgo(j.createdAt, now)}` : ""}
                {j.pages ? ` · ${j.pages} page${j.pages === 1 ? "" : "s"}` : ""}
              </span>
              {open && j.canCancel && (
                <button
                  type="button"
                  className={plainButton}
                  onClick={async () => {
                    const res = await api.print.jobs[":id"].$delete({
                      param: { id: String(j.id) },
                    });
                    setError(res.ok ? null : await getErrorMessage(res));
                    onChanged();
                  }}
                >
                  Cancel
                </button>
              )}
            </li>
          );
        })}
      </ul>
    </>
  );
}
