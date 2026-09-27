import { api } from "./api";
import { getErrorMessage } from "./api-error";
import type {
  Action,
  Blueprint,
  KioskPresence,
  PartDefinition,
  PartFile,
  PartInstance,
  PartInstanceProcess,
  Process,
  Subsystem,
} from "./types";

export async function fetchSubsystems(): Promise<Subsystem[]> {
  const res = await api.subsystems.$get();
  if (!res.ok) throw new Error(`Failed to fetch subsystems (${res.status})`);
  return res.json() as Promise<Subsystem[]>;
}

export async function fetchProcesses(): Promise<Process[]> {
  const res = await api.processes.$get();
  if (!res.ok) throw new Error(`Failed to fetch processes (${res.status})`);
  return res.json() as Promise<Process[]>;
}

export async function fetchPartDefinitions(): Promise<PartDefinition[]> {
  const res = await api["part-definitions"].$get();
  if (!res.ok) throw new Error(`Failed to fetch parts (${res.status})`);
  return res.json() as Promise<PartDefinition[]>;
}

export async function fetchBlueprint(partDefinitionId: number | string): Promise<Blueprint[]> {
  const res = await api["part-definitions"][":id"].processes.$get({
    param: { id: String(partDefinitionId) },
  });
  if (!res.ok) throw new Error(`Failed to fetch blueprint (${res.status})`);
  return res.json() as Promise<Blueprint[]>;
}

export async function fetchInstances(partDefinitionId: number | string): Promise<PartInstance[]> {
  const res = await api["part-instances"].$get({
    query: { partDefinitionId: String(partDefinitionId) },
  });
  if (!res.ok) throw new Error(`Failed to fetch instances (${res.status})`);
  return res.json() as Promise<PartInstance[]>;
}

export async function fetchAllInstances(): Promise<PartInstance[]> {
  const res = await api["part-instances"].$get({ query: {} });
  if (!res.ok) throw new Error(`Failed to fetch instances (${res.status})`);
  return res.json() as Promise<PartInstance[]>;
}

export async function fetchInstanceProcesses(
  partInstanceId: number | string,
): Promise<PartInstanceProcess[]> {
  const res = await api["part-instance-processes"].$get({
    query: { partInstanceId: String(partInstanceId) },
  });
  if (!res.ok) throw new Error(`Failed to fetch instance processes (${res.status})`);
  return res.json() as Promise<PartInstanceProcess[]>;
}

export async function fetchProcessQueue(
  processId: number | string,
): Promise<PartInstanceProcess[]> {
  const res = await api["part-instance-processes"].$get({
    query: { processId: String(processId) },
  });
  if (!res.ok) throw new Error(`Failed to fetch process queue (${res.status})`);
  return res.json() as Promise<PartInstanceProcess[]>;
}

/** Newest-first audit log of part status changes. */
export async function fetchActions(): Promise<Action[]> {
  const res = await api.actions.$get();
  if (!res.ok) throw new Error(`Failed to fetch actions (${res.status})`);
  return res.json() as Promise<Action[]>;
}

/** Who is logged in at which kiosk device right now. */
export async function fetchKioskPresence(): Promise<KioskPresence[]> {
  const res = await api["kiosk-presence"].$get();
  if (!res.ok) throw new Error(`Failed to fetch kiosk presence (${res.status})`);
  return res.json() as Promise<KioskPresence[]>;
}

/** Resolve a batch of user IDs to display names. */
export async function fetchUserNames(
  ids: string[],
): Promise<{ id: string; displayName: string }[]> {
  if (ids.length === 0) return [];
  const res = await api.users.$get({ query: { ids: ids.join(",") } });
  if (!res.ok) throw new Error(`Failed to fetch user names (${res.status})`);
  return res.json() as Promise<{ id: string; displayName: string }[]>;
}

/** The API only exposes instance processes per-process or per-instance, so
 * fan out across processes (few) rather than instances (many). */
export async function fetchAllInstanceProcesses(
  processes: Process[],
): Promise<PartInstanceProcess[]> {
  const lists = await Promise.all(processes.map((p) => fetchProcessQueue(p.id)));
  return lists.flat();
}

/** URL of the released drawing PDF for a part revision, served from R2 by the shop worker. */
export function drawingUrl(partNumber: string, revision: string): string {
  const base = import.meta.env.VITE_API_BASE_URL ?? "";
  return `${base}/parts/${encodeURIComponent(partNumber)}/${encodeURIComponent(revision)}/drawing`;
}

/**
 * Fetches the drawing PDF as an object URL, or null when R2 has no drawing for this revision.
 *
 * The PDF is downloaded once and handed to the viewer as a blob rather than pointing an
 * <iframe> straight at the endpoint: a miss returns JSON, which the browser's PDF viewer
 * would render as a broken document instead of letting us fall back cleanly.
 * Callers must revoke the returned URL when done.
 */
export async function fetchDrawingObjectUrl(
  partNumber: string,
  revision: string,
  signal?: AbortSignal,
): Promise<string | null> {
  const res = await fetch(drawingUrl(partNumber, revision), {
    credentials: "include",
    signal,
  });
  if (!res.ok) return null;
  const blob = await res.blob();
  if (!blob.type.includes("pdf")) return null;
  return URL.createObjectURL(blob);
}

/** Files attached to part revisions. Omit both args to list every file. */
export async function fetchPartFiles(partNumber?: string, revision?: string): Promise<PartFile[]> {
  const query: { partNumber?: string; revision?: string } = {};
  if (partNumber !== undefined) query.partNumber = partNumber;
  if (revision !== undefined) query.revision = revision;
  const res = await api["part-files"].$get({ query });
  if (!res.ok) throw new Error(await getErrorMessage(res as unknown as Response));
  return res.json() as Promise<PartFile[]>;
}

/** Multipart upload; the typed client can't build FormData bodies for untyped routes. */
export async function uploadPartFile(
  file: File,
  partNumber: string,
  revision: string,
): Promise<PartFile> {
  const body = new FormData();
  body.append("file", file);
  body.append("partNumber", partNumber);
  body.append("revision", revision);
  const res = await fetch(`${import.meta.env.VITE_API_BASE_URL ?? ""}/part-files`, {
    method: "POST",
    body,
    credentials: "include",
  });
  if (!res.ok) throw new Error(await getErrorMessage(res));
  return res.json() as Promise<PartFile>;
}

/** Deletes the file from every part it's linked to. */
export async function deletePartFile(id: number): Promise<void> {
  const res = await api["part-files"][":id"].$delete({ param: { id: String(id) } });
  if (!res.ok) throw new Error(await getErrorMessage(res as unknown as Response));
}

export async function linkPartFile(
  id: number,
  partNumber: string,
  revision: string,
): Promise<void> {
  const res = await api["part-files"][":id"].links.$post({
    param: { id: String(id) },
    json: { partNumber, revision },
  });
  if (!res.ok) throw new Error(await getErrorMessage(res as unknown as Response));
}

/** Unlinks one part revision. Resolves true if that was the last link and the file was deleted. */
export async function unlinkPartFile(
  id: number,
  partNumber: string,
  revision: string,
): Promise<boolean> {
  const res = await api["part-files"][":id"].links.$delete({
    param: { id: String(id) },
    json: { partNumber, revision },
  });
  if (!res.ok) throw new Error(await getErrorMessage(res as unknown as Response));
  return ((await res.json()) as { deleted: boolean }).deleted;
}

export function partFileDownloadUrl(id: number): string {
  return `${import.meta.env.VITE_API_BASE_URL ?? ""}/part-files/${id}/download`;
}
