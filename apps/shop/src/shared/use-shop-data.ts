import { useCallback, useEffect, useState } from "react";
import {
  fetchAllInstanceProcesses,
  fetchAllInstances,
  fetchPartDefinitions,
  fetchProcesses,
  fetchSubsystems,
} from "./getters";
import type {
  PartDefinition,
  PartInstance,
  PartInstanceProcess,
  Process,
  Subsystem,
} from "./types";

export type ShopData = {
  subsystems: Subsystem[];
  processes: Process[];
  definitions: PartDefinition[];
  instances: PartInstance[];
  instanceProcesses: PartInstanceProcess[];
};

export function useShopData() {
  const [data, setData] = useState<ShopData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      const [subsystems, processes, definitions, instances] = await Promise.all([
        fetchSubsystems(),
        fetchProcesses(),
        fetchPartDefinitions(),
        fetchAllInstances(),
      ]);
      const instanceProcesses = await fetchAllInstanceProcesses(processes);
      setData({ subsystems, processes, definitions, instances, instanceProcesses });
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load shop data.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  return { data, loading, error, refresh };
}
