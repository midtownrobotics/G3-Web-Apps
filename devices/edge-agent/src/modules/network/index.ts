import type { EdgeModule, ModuleContext } from "../../core/module";
import { attribute, bucketFor, counterDeltas } from "./deltas";
import { Pusher } from "./pusher";
import { mockSource, systemSource } from "./sources";
import { UsageStore } from "./store";

/** Pushed rows are kept locally this long (the worker is the real store). */
const KEEP_SENT_SECONDS = 7 * 86400;

/**
 * Network module: every collection interval, reads byte counters, attributes
 * the deltas to clients by MAC, buffers them locally, and pushes to the worker.
 */
export function createNetworkModule(ctx: ModuleContext): EdgeModule {
  const source = ctx.config.mock ? mockSource() : systemSource(ctx.config);
  const store = new UsageStore(ctx.db);
  const pusher = new Pusher(store, ctx.worker);
  const interval = ctx.config.collectIntervalSeconds;
  let timer: Timer | null = null;
  let lastCollectAt: number | null = null;
  let lastCollectError: string | null = null;

  async function collect() {
    const [counters, leases, bootId] = await Promise.all([
      source.counters(),
      source.leases(),
      source.bootId(),
    ]);
    const ts = Math.floor(Date.now() / 1000);
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

  async function tick() {
    try {
      await collect();
      lastCollectAt = Math.floor(Date.now() / 1000);
      lastCollectError = null;
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
      await tick();
      scheduleNext();
    },
    stop() {
      if (timer) clearTimeout(timer);
      pusher.stop();
    },
    status() {
      return {
        mock: ctx.config.mock,
        lastCollectAt,
        lastCollectError,
        lastPushAt: pusher.lastSuccessAt,
        lastPushError: pusher.lastError,
        unsentBuckets: store.unsentCount(),
      };
    },
  };
}
