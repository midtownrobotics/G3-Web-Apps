// Shared by the shop worker and the shop app (imported as "@g3/worker-shop/process-rules"),
// so keep this dependency-free.

type Step = { name: string; type: string };

/**
 * A File Producer step makes files that a File Consumer step then uses, so a part's processes
 * can't include a producer without a consumer. Order isn't checked. Returns the error, or null.
 */
export function fileStepError(steps: Step[]): string | null {
  const producers = steps.filter((s) => s.type === "file_producer");
  if (producers.length === 0 || steps.some((s) => s.type === "file_consumer")) return null;
  const names = [...new Set(producers.map((s) => s.name))];
  return `${names.join(" and ")} ${names.length > 1 ? "make" : "makes"} files, so the part also needs a File Consumer process to use them — e.g. CAM + Router, or Slice + Print.`;
}
