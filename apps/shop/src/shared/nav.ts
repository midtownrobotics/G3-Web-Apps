/** Route for a process's shop-floor view. Used everywhere a process is linked. */
export function processPath(processId: number): string {
  return `/board/process/${processId}`;
}
