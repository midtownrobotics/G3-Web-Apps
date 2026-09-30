export interface AgentConfig {
  /** Base URL of workers/edge, e.g. https://api.edge.g3robotics.com */
  workerUrl: string;
  /** Shared key; must match EDGE_AGENT_KEY on the worker. */
  agentKey: string;
  dbPath: string;
  httpPort: number;
  /** Use fake counters/leases instead of nft, sysfs, and dnsmasq (for local dev). */
  mock: boolean;
  wanInterface: string;
  leasesPath: string;
  /** dnsmasq query log (log-queries=extra), used to name the sites clients use. */
  dnsLogPath: string;
  collectIntervalSeconds: number;
}

function required(name: string) {
  const value = process.env[name];
  if (!value) throw new Error(`Missing required environment variable ${name}`);
  return value;
}

function int(name: string, fallback: number) {
  const raw = process.env[name];
  if (!raw) return fallback;
  const value = Number(raw);
  if (!Number.isInteger(value) || value <= 0) throw new Error(`${name} must be a positive integer`);
  return value;
}

/** Reads config from the environment (systemd loads /etc/g3-edge/agent.env). */
export function loadConfig(): AgentConfig {
  return {
    workerUrl: required("EDGE_WORKER_URL").replace(/\/$/, ""),
    agentKey: required("EDGE_AGENT_KEY"),
    dbPath: process.env.EDGE_DB_PATH ?? "/var/lib/g3-edge/agent.db",
    httpPort: int("EDGE_HTTP_PORT", 8700),
    mock: process.env.EDGE_MOCK === "1",
    wanInterface: process.env.EDGE_WAN_IF ?? "wan0",
    leasesPath: process.env.EDGE_LEASES_PATH ?? "/var/lib/misc/dnsmasq.leases",
    dnsLogPath: process.env.EDGE_DNS_LOG ?? "/run/g3-edge-dns/queries.log",
    collectIntervalSeconds: int("EDGE_COLLECT_INTERVAL", 300),
  };
}
