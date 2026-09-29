# Edge box setup

System config and install scripts for the shop's edge box, an Orange Pi 5 running Armbian (hostname `orangepi5`, login user `g3`). See [docs/edge.md](../../docs/edge.md) for the full design.

**Everything here is applied by hand over SSH. The agent never applies any of it.** A bad netplan or nftables change can cut the box off from the internet, and then it can't receive a fix.

From the shop LAN, the box is always at `192.168.50.1`:

```bash
ssh g3@192.168.50.1
```

## What's here

Files under `etc/` mirror where they go on the box.

| Path | Purpose |
|---|---|
| `etc/netplan/10-router.yaml` | Names `wan0` (built-in port, fixed MAC) and `lan0` (USB adapter, `192.168.50.1/24`) |
| `etc/systemd/network/20-wan0.network` | Unused. Netplan's generated `10-netplan-wan0.network` matches `wan0` first, so this file never applies. Safe to delete on the box. |
| `etc/sysctl.d/99-router.conf` | Turns on IPv4 forwarding |
| `etc/nftables.conf` | Firewall, NAT, and the `inet acct` byte-counting table the agent reads |
| `etc/dnsmasq.d/lan.conf` | DHCP and DNS for the LAN |
| `etc/systemd/system/g3-edge-agent.service` | Runs the agent as user `g3-edge` with only `CAP_NET_ADMIN` |
| `etc/g3-edge/agent.env.example` | Template for `/etc/g3-edge/agent.env` (agent config and shared key; root-only, mode 600) |
| `install-agent.sh` | Installs or upgrades the agent binary |
| `check.sh` | Validates nftables, dnsmasq, and netplan configs before you apply them |
| `local/` | **Gitignored.** The real files from the box, in the same layout |

This repo is public. The committed `10-router.yaml` uses placeholder MACs (`02:00:00:00:00:0x`); the real one is in `local/`. `check.sh` uses the `local/` copy of each file when it exists.

> **Before go-live:** `nftables.conf` still has the `# TEMP` rule allowing SSH on `wan0`. Remove it (from both copies) once admin SSH through the tunnel is set up in Phase 2.

## Changing the network config

1. Edit the file in `local/`, and make the same change to the committed copy (keeping placeholder MACs).
2. Copy this folder to the box and validate:
   ```bash
   rsync -a infra/edge/ g3@192.168.50.1:~/edge-infra/
   ssh g3@192.168.50.1 'cd ~/edge-infra && sudo ./check.sh'
   ```
3. Apply one file at a time on the box:
   - **netplan:** `sudo cp local/etc/netplan/10-router.yaml /etc/netplan/ && sudo netplan try`. `netplan try` rolls back automatically unless you confirm within 120 seconds, so a mistake can't lock you out.
   - **nftables:** `sudo cp local/etc/nftables.conf /etc/ && sudo nft -f /etc/nftables.conf`
   - **dnsmasq:** `sudo cp local/etc/dnsmasq.d/lan.conf /etc/dnsmasq.d/ && sudo systemctl restart dnsmasq`

The agent relies on the `inet acct` table (sets `dl` and `ul`) and on the interfaces being named `wan0` and `lan0`. `nftables.conf` begins with `flush ruleset`, so reloading it resets the byte counters. The agent notices this and carries on correctly.

## Cloud setup (once)

From a dev machine, logged in to Cloudflare with `wrangler login`:

```bash
# D1 database: put the id this prints into workers/edge/wrangler.toml (env.production)
pnpm --filter @g3/worker-edge exec wrangler d1 create g3-edge-prod
pnpm --filter @g3/worker-edge db:migrate:remote

# Shared agent key. Save it; the box's agent.env needs it too.
openssl rand -hex 32
pnpm --filter @g3/worker-edge exec wrangler secret put EDGE_AGENT_KEY --env production

pnpm --filter @g3/worker-edge deploy   # serves api.edge.g3robotics.com
```

The UI (`apps/edge`) deploys to Cloudflare Pages as `edge.g3robotics.com`, the same way as the other apps.

## Installing or upgrading the agent

Build on a dev machine (needs [Bun](https://bun.sh)), then copy it to the box **over the shop LAN** so the transfer doesn't use hotspot data. The binary is about 80 MB.

```bash
pnpm --filter @g3/edge-agent build        # -> devices/edge-agent/dist/g3-edge-agent (arm64)
rsync -a infra/edge/ devices/edge-agent/dist/g3-edge-agent g3@192.168.50.1:~/edge-infra/
ssh -t g3@192.168.50.1 'cd ~/edge-infra && sudo ./install-agent.sh ./g3-edge-agent 0.1.0'
```

On the first run, the script creates `/etc/g3-edge/agent.env` and stops. Set `EDGE_AGENT_KEY` in that file (`sudo nano /etc/g3-edge/agent.env`), then run the script again. It then:

- creates the `g3-edge` system user (separate from your `g3` login);
- installs the binary to `/opt/g3-edge/versions/<version>/` and points `/opt/g3-edge/current` at it;
- installs and starts the `g3-edge-agent` service;
- disables the old `g3-usage.timer` if it's enabled.

The old collector isn't needed any more. To remove it:

```bash
sudo rm -f /etc/systemd/system/g3-usage.{service,timer} /usr/local/bin/g3-usage.py
sudo rm -rf /var/lib/g3-router
sudo systemctl daemon-reload
```

To upgrade, run the same commands with a new version number. The previous version stays in `/opt/g3-edge/versions/`, so rolling back is:

```bash
sudo ln -sfn versions/<old> /opt/g3-edge/current && sudo systemctl restart g3-edge-agent
```

## Checking on the agent

```bash
systemctl status g3-edge-agent
journalctl -u g3-edge-agent -f
curl -s http://127.0.0.1:8700/health     # version, last collect/push, unsent buckets
```

The first collection only records starting counter values. Usage shows up in the UI after the next collection, at most 5 minutes later. If the hotspot is down, usage is buffered in `/var/lib/g3-edge/agent.db` and uploaded when the connection returns.

**Data budget check:** after a day, compare the "Edge box & overhead" line on the Overview page with total usage. It's WAN traffic not attributed to any LAN client (the box's own usage) and should stay small.

## Fresh Armbian install (outline)

1. Flash Armbian, create the `g3` user, and set the timezone to `America/New_York`.
2. Disable NetworkManager and use `systemd-networkd`. Install `etc/netplan/10-router.yaml` (real MACs) and `etc/sysctl.d/99-router.conf`, then run `sudo netplan apply && sudo sysctl --system`.
3. Install `nftables` and `dnsmasq`, apply their configs, and enable both services.
4. Set up the agent (see above).
5. Phase 2 adds cloudflared, the tunnel, and SSH through it.
