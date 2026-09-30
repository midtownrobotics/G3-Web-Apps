import { dirname } from "node:path";
import type { EdgeModule, ModuleContext } from "../../core/module";
import { attribute, bucketFor, counterDeltas } from "./deltas";
import { Enforcer, fileTarget, systemTarget } from "./enforcer";
import { attributeFlows, idleFlows } from "./flows";
import { type Lease, parseDnsLog } from "./parse";
import { Pusher } from "./pusher";
import { SiteStore } from "./site-store";
import { mockSource, systemSource } from "./sources";
import { UsageStore } from "./store";

/** Pushed rows are kept locally this long (the worker is the real store). */
const KEEP_SENT_SECONDS = 7 * 86400;

/**
 * Must stay below the flows sets' `timeout` (1h in nftables.conf). After a
 * longer gap, entries may have expired and been re-created, so previous
 * readings can't be trusted and flows are re-baselined instead.
 */
const MAX_FLOW_GAP_SECONDS = 50 * 60;

/**
 * Network module: every collection interval, reads byte counters, attributes
 * the deltas to clients by MAC (and to sites by DNS name), buffers them
 * locally, and pushes to the worker.
 */
export function createNetworkModule(ctx: ModuleContext): EdgeModule {
  const source = ctx.config.mock ? mockSource() : systemSource(ctx.config, ctx.db);
  const store = new UsageStore(ctx.db);
  const sites = new SiteStore(ctx.db);
  const enforcer = new Enforcer(
    ctx,
    ctx.config.mock
      ? fileTarget(dirname(ctx.config.dbPath), ctx.config.dnsmasqConfPath)
      : systemTarget(ctx.config.dnsmasqConfPath),
    () => source.leases(),
  );
  // Every worker response says which state version is current; fetch it if ours is behind.
  const pusher = new Pusher(store, sites, ctx.worker, (version) => {
    if (version > ctx.sync.applied) void enforcer.sync();
  });
  const dnsPending = new Map<string, string>();
  const interval = ctx.config.collectIntervalSeconds;
  let timer: Timer | null = null;
  let lastCollectAt: number | null = null;
  let lastCollectError: string | null = null;
  let lastSitesError: string | null = null;
  let lastDnsAnswers = 0;
  let trackedFlows = 0;

  async function collectUsage(ts: number, leases: Lease[], bootId: string) {
    const counters = await source.counters();
    const prev = store.lastReading();
    if (!prev) {
      // First run: just record a baseline, since we can't know when existing
      // counter values were accumulated.
      store.record({ ts, bootId, counters, bucket: null, usage: new Map(), leases });
      console.log("[network] recorded baseline counters");
      return;
    }
    const deltas = counterDeltas(prev.counters, counters, prev.bootId !== bootId);
    const usage = attribute(deltas, leases);
    store.record({ ts, bootId, counters, bucket: bucketFor(prev.ts, ts), usage, leases });
    store.prune(ts - KEEP_SENT_SECONDS);
  }

  async function collectSites(ts: number, leases: Lease[], bootId: string) {
    // DNS first, so lookups made just before a flow started are known.
    const answers = parseDnsLog(await source.dnsLines(), dnsPending);
    sites.recordDns(answers, ts);
    lastDnsAnswers = answers.length;

    const flows = await source.flows();
    const prev = sites.lastFlows();
    if (!prev || ts - prev.ts > MAX_FLOW_GAP_SECONDS) {
      sites.record({ ts, bootId, counters: flows, hour: null, usage: new Map() });
      trackedFlows = flows.size;
      return;
    }

    const deltas = counterDeltas(prev.counters, flows, prev.bootId !== bootId);
    // Delete entries idle since the last reading; they restart from zero if
    // traffic resumes, which counterDeltas counts as new.
    const idle = idleFlows(prev.counters, flows);
    if (idle.length > 0) {
      for (const key of await source.deleteFlows(idle)) flows.delete(key);
    }

    const macByIp = new Map(leases.map((l) => [l.ip, l.mac]));
    const usage = attributeFlows(deltas, macByIp, (client, remote) =>
      sites.nameFor(client, remote),
    );
    const hour = Math.floor((prev.ts + ts) / 2 / 3600) * 3600;
    sites.record({ ts, bootId, counters: flows, hour, usage });
    sites.prune(ts - KEEP_SENT_SECONDS);
    trackedFlows = flows.size;
  }

  async function tick() {
    // Keep enforcement applied: recreates the table if nftables was reloaded,
    // and moves grants to devices' current IPs.
    await enforcer.ensure().catch((err) => console.error("[network] enforcement failed:", err));
    try {
      const [leases, bootId] = await Promise.all([source.leases(), source.bootId()]);
      const ts = Math.floor(Date.now() / 1000);
      await collectUsage(ts, leases, bootId);
      lastCollectAt = ts;
      lastCollectError = null;
      // Site tracking is best-effort: a failure here must not stop usage collection.
      try {
        await collectSites(ts, leases, bootId);
        lastSitesError = null;
      } catch (err) {
        lastSitesError = err instanceof Error ? err.message : String(err);
        console.error(`[network] site tracking failed: ${lastSitesError}`);
      }
    } catch (err) {
      lastCollectError = err instanceof Error ? err.message : String(err);
      console.error(`[network] collection failed: ${lastCollectError}`);
    }
    await pusher.flush();
  }

  // Run a few seconds after each interval boundary so readings line up with buckets.
  function scheduleNext() {
    const period = interval * 1000;
    const now = Date.now();
    const next = Math.floor(now / period) * period + period + Math.min(5000, period / 10);
    timer = setTimeout(async () => {
      await tick();
      scheduleNext();
    }, next - now);
  }

  return {
    name: "network",
    async start() {
      // The first tick applies the last-known state (works offline), then the
      // worker's latest is fetched.
      await tick();
      void enforcer.sync();
      scheduleNext();
    },
    stop() {
      if (timer) clearTimeout(timer);
      pusher.stop();
    },
    sync: () => enforcer.sync(),
    status() {
      return {
        mock: ctx.config.mock,
        enforcement: enforcer.status(),
        lastCollectAt,
        lastCollectError,
        lastSitesError,
        lastDnsAnswers,
        trackedFlows,
        lastPushAt: pusher.lastSuccessAt,
        lastPushError: pusher.lastError,
        unsentBuckets: store.unsentCount(),
      };
    },
  };
}
