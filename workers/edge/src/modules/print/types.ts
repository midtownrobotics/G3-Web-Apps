/**
 * Wire types between the edge worker and the agent's print module. Plain
 * types only (no runtime imports), so the agent can import them too
 * (package export "@g3/worker-edge/print-types").
 */

export interface Printer {
  /** CUPS queue name. */
  name: string;
  description: string | null;
  location: string | null;
  makeAndModel: string | null;
  deviceUri: string | null;
  isDefault: boolean;
  state: "idle" | "processing" | "stopped";
  acceptingJobs: boolean;
  /** e.g. "media-empty", "toner-low" (CUPS printer-state-reasons, "none" removed). */
  stateReasons: string[];
  stateMessage: string | null;
  /** Toner/ink levels, when the printer reports them (level -1 = unknown). */
  markers: { name: string; color: string | null; level: number }[];
}

export interface DiscoveredPrinter {
  uri: string;
  info: string | null;
  makeAndModel: string | null;
  location: string | null;
  /** A printer already set up in CUPS with this device URI. */
  addedAs: string | null;
}

export type JobState =
  | "pending"
  | "held"
  | "processing"
  | "stopped"
  | "canceled"
  | "aborted"
  | "completed";

export interface PrintJob {
  id: number;
  printer: string;
  title: string | null;
  /** The G3ID user id it was printed as, when known. */
  user: string | null;
  state: JobState;
  stateReasons: string[];
  createdAt: number | null;
  completedAt: number | null;
  pages: number | null;
}

export const SIDES = ["one-sided", "two-sided-long-edge", "two-sided-short-edge"] as const;
export const COLOR_MODES = ["monochrome", "color"] as const;
export const MEDIA = [
  "na_letter_8.5x11in",
  "na_legal_8.5x14in",
  "iso_a4_210x297mm",
  "na_ledger_11x17in",
] as const;

export interface PrintOptions {
  /** Printer name; the default printer when omitted. */
  printer?: string;
  title: string;
  /** G3ID user id recorded on the job. */
  user?: string;
  copies?: number;
  sides?: (typeof SIDES)[number];
  color?: (typeof COLOR_MODES)[number];
  media?: (typeof MEDIA)[number];
  /** e.g. "1-3,5". */
  pageRanges?: string;
}

export const MAX_PRINT_BYTES = 50 * 1024 * 1024;
export const PRINT_CONTENT_TYPES = [
  "application/pdf",
  "text/plain",
  "image/jpeg",
  "image/png",
] as const;

const NAME = /^[A-Za-z0-9_-]{1,64}$/;
const PAGE_RANGES = /^\d+(-\d+)?(,\d+(-\d+)?)*$/;

/** Parses and validates print options from query parameters. Returns an error message or options. */
export function parsePrintOptions(q: Record<string, string | undefined>): PrintOptions | string {
  const title = (q.title ?? "").trim().slice(0, 200) || "Untitled";
  const out: PrintOptions = { title };
  if (q.printer) {
    if (!NAME.test(q.printer)) return "Invalid printer name.";
    out.printer = q.printer;
  }
  if (q.user) {
    if (!/^[A-Za-z0-9_-]{1,64}$/.test(q.user)) return "Invalid user.";
    out.user = q.user;
  }
  if (q.copies) {
    const n = Number(q.copies);
    if (!Number.isInteger(n) || n < 1 || n > 50) return "Copies must be 1-50.";
    out.copies = n;
  }
  if (q.sides) {
    if (!SIDES.includes(q.sides as never)) return "Invalid sides.";
    out.sides = q.sides as PrintOptions["sides"];
  }
  if (q.color) {
    if (!COLOR_MODES.includes(q.color as never)) return "Invalid color mode.";
    out.color = q.color as PrintOptions["color"];
  }
  if (q.media) {
    if (!MEDIA.includes(q.media as never)) return "Invalid paper size.";
    out.media = q.media as PrintOptions["media"];
  }
  if (q.pageRanges) {
    const r = q.pageRanges.replace(/\s/g, "");
    if (!PAGE_RANGES.test(r) || r.length > 100) return "Invalid page ranges (e.g. 1-3,5).";
    out.pageRanges = r;
  }
  return out;
}

export function isValidPrinterName(name: string) {
  return NAME.test(name);
}

/** Device URIs the UI may add: network printers only. */
export function isValidDeviceUri(uri: string) {
  return /^(ipp|ipps|dnssd|socket|lpd):\/\/[^\s'"\\]{1,500}$/.test(uri);
}
