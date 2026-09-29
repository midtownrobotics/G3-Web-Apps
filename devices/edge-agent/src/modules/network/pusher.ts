import type { WorkerClient } from "../../core/worker-client";
import { WAN_KEY } from "./deltas";
import type { UsageStore } from "./store";

const BATCH_SIZE = 500;
const MIN_RETRY_SECONDS = 30;
const MAX_RETRY_SECONDS = 30 * 60;

/**
 * Uploads unsent usage buckets to the worker. On failure it retries with
 * exponential backoff; the next collection also triggers a push.
 */
export class Pusher {
  private inFlight: Promise<void> | null = null;
  private retryTimer: Timer | null = null;
  private failures = 0;
  lastSuccessAt: number | null = null;
  lastError: string | null = null;

  constructor(
    private store: UsageStore,
    private worker: WorkerClient,
  ) {}

  flush(): Promise<void> {
    this.inFlight ??= this.send().finally(() => {
      this.inFlight = null;
    });
    return this.inFlight;
  }

  stop() {
    if (this.retryTimer) clearTimeout(this.retryTimer);
    this.retryTimer = null;
  }

  private async send() {
    this.stop();
    try {
      for (;;) {
        const rows = this.store.unsent(BATCH_SIZE);
        if (rows.length === 0) break;
        const macs = [...new Set(rows.map((r) => r.mac))].filter((m) => m !== WAN_KEY);
        const res = await this.worker.agent.network.usage.$post({
          json: {
            samples: rows.map((r) => [r.ts, r.mac, r.dl, r.ul]),
            clients: this.store.clients(macs),
          },
        });
        if (!res.ok) throw new Error(`worker returned HTTP ${res.status}`);
        this.store.markSent(rows);
        if (rows.length < BATCH_SIZE) break;
      }
      this.failures = 0;
      this.lastError = null;
      this.lastSuccessAt = Math.floor(Date.now() / 1000);
    } catch (err) {
      this.failures += 1;
      this.lastError = err instanceof Error ? err.message : String(err);
      const delay = Math.min(MAX_RETRY_SECONDS, MIN_RETRY_SECONDS * 2 ** (this.failures - 1));
      console.warn(`[network] push failed (${this.lastError}); retrying in ${delay}s`);
      this.retryTimer = setTimeout(() => void this.flush(), delay * 1000);
    }
  }
}
