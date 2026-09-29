import type { AgentConfig } from "../../core/config";
import type { Counters } from "./deltas";
import { type Lease, parseLeases, parseNftSet } from "./parse";

/** Where the collector reads counters and leases from. */
export interface NetworkSource {
  counters(): Promise<Counters>;
  leases(): Promise<Lease[]>;
  /** Changes on every reboot, which resets all counters. */
  bootId(): Promise<string>;
}

async function nftSet(name: string) {
  const proc = Bun.spawn(["nft", "-j", "list", "set", "inet", "acct", name], {
    stdout: "pipe",
    stderr: "pipe",
  });
  const [out, err, code] = await Promise.all([
    new Response(proc.stdout).text(),
    new Response(proc.stderr).text(),
    proc.exited,
  ]);
  if (code !== 0) throw new Error(`nft list set ${name} failed: ${err.trim()}`);
  return parseNftSet(out);
}

async function readInt(path: string) {
  return Number((await Bun.file(path).text()).trim());
}

/** Reads the live system: nftables `inet acct` sets, wan0 stats, dnsmasq leases. */
export function systemSource(config: AgentConfig): NetworkSource {
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
  };
}

/** Fake devices with growing counters, for running the agent on a dev machine. */
export function mockSource(): NetworkSource {
  const devices = [
    { mac: "02:00:00:00:00:01", ip: "192.168.50.101", hostname: "drive-station", rate: 40_000 },
    { mac: "02:00:00:00:00:02", ip: "192.168.50.102", hostname: "cad-laptop", rate: 400_000 },
    { mac: "02:00:00:00:00:03", ip: "192.168.50.103", hostname: "someones-phone", rate: 2_000_000 },
    { mac: "02:00:00:00:00:04", ip: "192.168.50.104", hostname: null, rate: 10_000 },
  ];
  const counters: Counters = new Map();
  let last = Date.now();
  const bump = (key: string, bytes: number) =>
    counters.set(key, (counters.get(key) ?? 0) + Math.round(bytes));
  return {
    async counters() {
      const seconds = (Date.now() - last) / 1000;
      last = Date.now();
      let total = 0;
      for (const d of devices) {
        const dl = d.rate * seconds * Math.random();
        bump(`dl:${d.ip}`, dl);
        bump(`ul:${d.ip}`, dl / 10);
        total += dl * 1.1;
      }
      // WAN also sees the box's own traffic, so it's a bit more than the clients.
      bump("wan:rx", total * 1.05);
      bump("wan:tx", (total / 10) * 1.05);
      return new Map(counters);
    },
    async leases() {
      return devices.map(({ mac, ip, hostname }) => ({ mac, ip, hostname }));
    },
    async bootId() {
      return "mock";
    },
  };
}
