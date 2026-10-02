import type { Database } from "bun:sqlite";
import type { AgentConfig } from "../../core/config";
import type { Counters } from "./deltas";
import { DnsLogTailer } from "./dns-log";
import { flowKey, parseFlowKey } from "./flows";
import { nft } from "./nft";
import { type Lease, parseLeases, parseNftFlowSet, parseNftSet } from "./parse";

/** Where the collector reads counters and leases from. */
export interface NetworkSource {
  counters(): Promise<Counters>;
  leases(): Promise<Lease[]>;
  /** Changes on every reboot, which resets all counters. */
  bootId(): Promise<string>;
  /** Per (client, remote IP) counters, keyed by flowKey(). */
  flows(): Promise<Counters>;
  /**
   * Removes flow entries (so they restart from zero when traffic resumes).
   * Returns the keys that are now gone.
   */
  deleteFlows(keys: string[]): Promise<string[]>;
  /** New dnsmasq query log lines since the last call. */
  dnsLines(): Promise<string[]>;
}

const listSet = (name: string) => nft(["-j", "list", "set", "inet", "acct", name]);
const nftSet = async (name: string) => parseNftSet(await listSet(name));

const IPV4 = /^\d{1,3}(\.\d{1,3}){3}$/;
const DELETE_CHUNK = 500;

/**
 * Deletes flow elements in batches. nft applies a batch atomically and rejects
 * it if any element is already gone, so a failed batch is retried one by one.
 */
async function deleteFlowElements(keys: string[]): Promise<string[]> {
  const deleted: string[] = [];
  const bySet = new Map<string, { elem: string; key: string }[]>();
  for (const key of keys) {
    const { dir, client, remote } = parseFlowKey(key);
    if (!IPV4.test(client) || !IPV4.test(remote)) continue;
    const set = `flows_${dir}`;
    bySet.set(set, [...(bySet.get(set) ?? []), { elem: `${client} . ${remote}`, key }]);
  }
  const cmd = (set: string, elems: { elem: string }[]) =>
    `delete element inet acct ${set} { ${elems.map((e) => e.elem).join(", ")} }\n`;
  for (const [set, elems] of bySet) {
    for (let i = 0; i < elems.length; i += DELETE_CHUNK) {
      const chunk = elems.slice(i, i + DELETE_CHUNK);
      try {
        await nft(["-f", "-"], cmd(set, chunk));
        deleted.push(...chunk.map((e) => e.key));
      } catch {
        for (const e of chunk) {
          try {
            await nft(["-f", "-"], cmd(set, [e]));
            deleted.push(e.key);
          } catch (err) {
            // Already gone (expired) counts as deleted; anything else stays tracked.
            if (String(err).includes("No such file or directory")) deleted.push(e.key);
          }
        }
      }
    }
  }
  return deleted;
}

async function readInt(path: string) {
  return Number((await Bun.file(path).text()).trim());
}

/** Reads the live system: nftables `inet acct` sets, wan0 stats, dnsmasq leases and query log. */
export function systemSource(config: AgentConfig, db: Database): NetworkSource {
  const dnsLog = new DnsLogTailer(config.dnsLogPath, db);
  const stats = `/sys/class/net/${config.wanInterface}/statistics`;
  return {
    async counters() {
      const [dl, ul, rx, tx] = await Promise.all([
        nftSet("dl"),
        nftSet("ul"),
        readInt(`${stats}/rx_bytes`),
        readInt(`${stats}/tx_bytes`),
      ]);
      const counters: Counters = new Map([
        ["wan:rx", rx],
        ["wan:tx", tx],
      ]);
      for (const [ip, bytes] of dl) counters.set(`dl:${ip}`, bytes);
      for (const [ip, bytes] of ul) counters.set(`ul:${ip}`, bytes);
      return counters;
    },
    async leases() {
      const file = Bun.file(config.leasesPath);
      return (await file.exists()) ? parseLeases(await file.text()) : [];
    },
    async bootId() {
      return (await Bun.file("/proc/sys/kernel/random/boot_id").text()).trim();
    },
    async flows() {
      const [dl, ul] = await Promise.all([listSet("flows_dl"), listSet("flows_ul")]);
      const counters: Counters = new Map();
      for (const [dir, json] of [
        ["dl", dl],
        ["ul", ul],
      ] as const) {
        for (const [pair, bytes] of parseNftFlowSet(json)) {
          const [client, remote] = pair.split("|");
          counters.set(flowKey(dir, client, remote), bytes);
        }
      }
      return counters;
    },
    deleteFlows: deleteFlowElements,
    dnsLines: () => dnsLog.read(),
  };
}

/** Fake devices, sites, and DNS lookups, for running the agent on a dev machine. */
export function mockSource(): NetworkSource {
  const devices = [
    { mac: "02:00:00:00:00:01", ip: "192.168.50.101", hostname: "drive-station", rate: 40_000 },
    { mac: "02:00:00:00:00:02", ip: "192.168.50.102", hostname: "cad-laptop", rate: 400_000 },
    { mac: "02:00:00:00:00:03", ip: "192.168.50.103", hostname: "someones-phone", rate: 2_000_000 },
    { mac: "02:00:00:00:00:04", ip: "192.168.50.104", hostname: null, rate: 10_000 },
  ];
  // Per device: [name looked up (null = no DNS, shows as unknown), share of its traffic].
  const sites: Record<string, [string | null, number][]> = {
    "192.168.50.101": [
      ["www.thebluealliance.com", 0.6],
      ["github.com", 0.4],
    ],
    "192.168.50.102": [
      ["cad.onshape.com", 0.7],
      ["www.chiefdelphi.com", 0.2],
      [null, 0.1],
    ],
    "192.168.50.103": [
      ["rr3---sn-abc.googlevideo.com", 0.8],
      ["www.instagram.com", 0.2],
    ],
    "192.168.50.104": [["time.windows.com", 1]],
  };
  // A distinct documentation-range IP per (device, site).
  const remoteFor = (client: string, i: number) =>
    `203.0.113.${(Number(client.split(".")[3]) - 100) * 10 + i}`;
  const counters: Counters = new Map();
  const flowCounters: Counters = new Map();
  let last = Date.now();
  let serial = 0;
  const bump = (map: Counters, key: string, bytes: number) =>
    map.set(key, (map.get(key) ?? 0) + Math.round(bytes));
  return {
    async counters() {
      const seconds = (Date.now() - last) / 1000;
      last = Date.now();
      let total = 0;
      for (const d of devices) {
        const dl = d.rate * seconds * Math.random();
        bump(counters, `dl:${d.ip}`, dl);
        bump(counters, `ul:${d.ip}`, dl / 10);
        total += dl * 1.1;
        sites[d.ip].forEach(([, share], i) => {
          bump(flowCounters, flowKey("dl", d.ip, remoteFor(d.ip, i)), dl * share);
          bump(flowCounters, flowKey("ul", d.ip, remoteFor(d.ip, i)), (dl / 10) * share);
        });
      }
      // WAN also sees the box's own traffic, so it's a bit more than the clients.
      bump(counters, "wan:rx", total * 1.05);
      bump(counters, "wan:tx", (total / 10) * 1.05);
      return new Map(counters);
    },
    async leases() {
      return devices.map(({ mac, ip, hostname }) => ({ mac, ip, hostname }));
    },
    async bootId() {
      return "mock";
    },
    async flows() {
      return new Map(flowCounters);
    },
    async deleteFlows(keys) {
      for (const k of keys) flowCounters.delete(k);
      return keys;
    },
    async dnsLines() {
      const lines: string[] = [];
      for (const d of devices) {
        sites[d.ip].forEach(([name], i) => {
          if (!name) return;
          serial++;
          const prefix = `Sep 29 19:00:01 dnsmasq[812]: ${serial} ${d.ip}/${50000 + (serial % 10000)}`;
          lines.push(`${prefix} query[A] ${name} from ${d.ip}`);
          lines.push(`${prefix} reply ${name} is ${remoteFor(d.ip, i)}`);
        });
      }
      return lines;
    },
  };
}
