import { api } from "./api";
import type {
  Blueprint,
  PartDefinition,
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
