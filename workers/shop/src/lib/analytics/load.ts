import type { createShopDb } from "../../db";
import {
  actions,
  partDefinitions,
  partInstanceProcesses,
  partInstances,
  processes,
} from "../../db/schema";
import type { AnalyticsInput } from "./model";

type Db = ReturnType<typeof createShopDb>;

/** Everything analytics needs, in one read. The shop's history is small enough to load whole. */
export async function loadAnalyticsInput(db: Db): Promise<AnalyticsInput> {
  const [actionRows, steps, instances, definitions, procs] = await Promise.all([
    db.select().from(actions).all(),
    db
      .select({
        partInstanceId: partInstanceProcesses.partInstanceId,
        processId: partInstanceProcesses.processId,
        index: partInstanceProcesses.index,
        status: partInstanceProcesses.status,
        completedAt: partInstanceProcesses.completedAt,
      })
      .from(partInstanceProcesses)
      .all(),
    db
      .select({
        id: partInstances.id,
        partDefinitionId: partInstances.partDefinitionId,
        instanceNumber: partInstances.instanceNumber,
        isPriority: partInstances.isPriority,
        isStale: partInstances.isStale,
        createdAt: partInstances.createdAt,
      })
      .from(partInstances)
      .all(),
    db
      .select({
        id: partDefinitions.id,
        name: partDefinitions.name,
        partNumber: partDefinitions.onshapePartNumber,
      })
      .from(partDefinitions)
      .all(),
    db.select({ id: processes.id, name: processes.name }).from(processes).all(),
  ]);
  return { actions: actionRows, steps, instances, definitions, processes: procs };
}
