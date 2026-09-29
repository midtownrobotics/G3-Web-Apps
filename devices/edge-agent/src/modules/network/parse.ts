export interface Lease {
  mac: string;
  ip: string;
  hostname: string | null;
}

const IPV4 = /^\d{1,3}(\.\d{1,3}){3}$/;

/**
 * Parses dnsmasq's leases file. IPv4 lines look like:
 *   <expiry> <mac> <ip> <hostname|*> <client-id|*>
 * IPv6 lines and the "duid" line are skipped.
 */
export function parseLeases(text: string): Lease[] {
  const leases: Lease[] = [];
  for (const line of text.split("\n")) {
    const [, mac, ip, hostname] = line.trim().split(/\s+/);
    if (!mac || !ip || !IPV4.test(ip)) continue;
    leases.push({
      mac: mac.toLowerCase(),
      ip,
      hostname: hostname && hostname !== "*" ? hostname : null,
    });
  }
  return leases;
}

type NftElem = string | { elem?: { val?: unknown; counter?: { bytes?: unknown } } };

/**
 * Parses `nft -j list set inet acct <name>` into ip → byte counter. Elements of
 * a dynamic set with `counter` look like {"elem": {"val": ip, "counter": {...}}}.
 */
export function parseNftSet(json: string): Map<string, number> {
  const out = new Map<string, number>();
  const doc = JSON.parse(json) as { nftables?: { set?: { elem?: NftElem[] } }[] };
  for (const entry of doc.nftables ?? []) {
    for (const el of entry.set?.elem ?? []) {
      if (typeof el !== "object") continue;
      const ip = el.elem?.val;
      const bytes = el.elem?.counter?.bytes;
      if (typeof ip === "string" && typeof bytes === "number") out.set(ip, bytes);
    }
  }
  return out;
}
