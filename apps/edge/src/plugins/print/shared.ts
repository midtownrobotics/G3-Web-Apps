import { api, getErrorMessage } from "../../shared/api";

export async function loadPrinters() {
  const res = await api.print.printers.$get();
  if (!res.ok) throw new Error(await getErrorMessage(res));
  return (await res.json()).printers;
}

export type PrinterRow = Awaited<ReturnType<typeof loadPrinters>>[number];

export const button =
  "text-sm font-medium rounded-lg px-3 py-1.5 transition-colors disabled:opacity-50";
export const primaryButton = `${button} bg-primary-500 hover:bg-primary-600 text-white`;
export const plainButton = `${button} text-secondary-600 hover:text-secondary-900 hover:bg-secondary-100`;
export const input = "border border-secondary-300 rounded-lg px-2 py-1 text-sm bg-white";

/** "idle" → green, "processing" → amber, "stopped" → grey, with a short label. */
export function printerStatus(p: PrinterRow) {
  if (p.state === "stopped" || !p.acceptingJobs) {
    return { dot: "bg-secondary-300", label: p.acceptingJobs ? "Stopped" : "Not accepting jobs" };
  }
  if (p.state === "processing") return { dot: "bg-amber-400", label: "Printing" };
  return { dot: "bg-emerald-500", label: "Ready" };
}

/** CUPS state reasons worth showing ("media-empty-error" → "media empty"). */
export function readableReasons(reasons: string[]) {
  return reasons
    .filter((r) => !["none", "cups-waiting-for-job-completed"].includes(r))
    .map((r) => r.replace(/-(report|warning|error)$/, "").replace(/-/g, " "));
}
