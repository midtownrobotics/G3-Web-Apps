// Shared by the shop worker and the shop app (imported as "@g3/worker-shop/process-rules"),
// so keep this dependency-free.

type Step = { name: string; type: string };

const EXAMPLES = "e.g. CAM + Router, or Slice + Print";

function listNames(steps: Step[]): { names: string; plural: boolean } {
  const names = [...new Set(steps.map((s) => s.name))];
  return { names: names.join(" and "), plural: names.length > 1 };
}

/**
 * A File Producer step makes files that a File Consumer step then uses, so a part's processes
 * need both or neither. Order isn't checked. Returns the error, or null.
 */
export function fileStepError(steps: Step[]): string | null {
  const producers = steps.filter((s) => s.type === "file_producer");
  const consumers = steps.filter((s) => s.type === "file_consumer");
  if (producers.length > 0 && consumers.length === 0) {
    const { names, plural } = listNames(producers);
    return `${names} ${plural ? "make" : "makes"} files, so the part also needs a File Consumer process to use them — ${EXAMPLES}.`;
  }
  if (consumers.length > 0 && producers.length === 0) {
    const { names, plural } = listNames(consumers);
    return `${names} ${plural ? "use" : "uses"} files, so the part also needs a File Producer process to make them — ${EXAMPLES}.`;
  }
  return null;
}
