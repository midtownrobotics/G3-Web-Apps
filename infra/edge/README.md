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
| `etc/systemd/network/20-wan0.network` | Unused. Netplan's generated `10-netplan-wan0.network` matches `wan0` first, so this file never takes effect. Safe to delete from the box. |
| `etc/sysctl.d/99-router.conf` | Turns on IPv4 forwarding |
| `etc/nftables.conf` | Firewall, NAT, and the `inet acct` byte counters the agent reads (per client, and per client and remote IP for site stats) |
| `etc/dnsmasq.d/lan.conf` | DHCP and DNS for the LAN, plus the query log used for site stats |
| `etc/tmpfiles.d/g3-edge.conf` | Creates `/run/g3-edge-dns/` at boot for the query log (kept in RAM) |
| `etc/logrotate.d/g3-edge-dns` | Rotates the query log daily |
| `etc/systemd/system/g3-edge-agent.service` | Runs the agent as user `g3-edge` with only `CAP_NET_ADMIN` |
| `etc/g3-edge/agent.env.example` | Template for `/etc/g3-edge/agent.env` (agent config and shared key; root-only, mode 600) |
| `install-agent.sh` | Installs or upgrades the agent binary |
| `check.sh` | Validates nftables, dnsmasq, and netplan configs before you apply them |
| `local/` | **Gitignored.** The real files from the box, in the same layout |

This repo is public. The committed `10-router.yaml` uses placeholder MACs (`02:00:00:00:00:0x`); the real one is in `local/`. Every other file is the same in both places. `check.sh` uses the `local/` copy of a file when there is one.

> **Before go-live:** `nftables.conf` still has the `# TEMP` rule allowing SSH on `wan0`. Remove it (from both copies) once admin SSH through the tunnel is set up in Phase 2.

## First deployment

Do these in order. Steps 1–5 are from a dev machine logged in to Cloudflare (`wrangler login`). Steps 6–12 need to be on the shop LAN.

### Cloud

1. **Database.** Run the command below, then put the `database_id` it prints into `[[env.production.d1_databases]]` in `workers/edge/wrangler.toml`. Commit that change.
   ```bash
   pnpm --filter @g3/worker-edge exec wrangler d1 create g3-edge-prod
   ```
2. **Tables.**
   ```bash
   pnpm --filter @g3/worker-edge run db:migrate:remote
   ```
3. **Shared agent key.** Generate a key and save it somewhere safe; the box needs it in step 7.
   ```bash
   openssl rand -hex 32
   pnpm --filter @g3/worker-edge exec wrangler secret put EDGE_AGENT_KEY --env production
   ```
4. **Worker.** Deploy it; this also sets up `api.edge.g3robotics.com`. Check it with `curl https://api.edge.g3robotics.com/health`.
   ```bash
   pnpm --filter @g3/worker-edge run deploy
   ```
5. **UI.** Create a Cloudflare Pages project connected to this repo, like the other apps:
   - Build command: `pnpm --filter @g3/edge run build`
   - Output directory: `apps/edge/dist`
   - Custom domain: `edge.g3robotics.com`

   The API and G3ID URLs come from `apps/edge/.env.production`, so no environment variables are needed. G3ID already allows redirects to any `*.g3robotics.com` site.

### Box

6. **Copy files.** Build the agent and copy it with this folder to the box. It's about 80 MB, so do it over the LAN.
   ```bash
   pnpm --filter @g3/edge-agent run build
   rsync -a infra/edge/ devices/edge-agent/dist/g3-edge-agent g3@192.168.50.1:~/edge-infra/
   ssh -t g3@192.168.50.1
   cd ~/edge-infra
   ```
7. **Install the agent.**
   ```bash
   sudo ./install-agent.sh ./g3-edge-agent 0.1.0
   ```
   The first run creates `/etc/g3-edge/agent.env` and stops. Put the key from step 3 in `EDGE_AGENT_KEY` (`sudo nano /etc/g3-edge/agent.env`) and run the same command again. The agent then starts and reports usage. Site tracking waits until steps 8–10 are done.
8. **Validate the configs.**
   ```bash
   sudo ./check.sh
   ```
9. **Query log.** This needs the `g3-edge` user from step 7.
   ```bash
   sudo cp etc/tmpfiles.d/g3-edge.conf /etc/tmpfiles.d/
   sudo systemd-tmpfiles --create /etc/tmpfiles.d/g3-edge.conf
   sudo cp etc/logrotate.d/g3-edge-dns /etc/logrotate.d/
   sudo cp local/etc/dnsmasq.d/lan.conf /etc/dnsmasq.d/
   sudo systemctl restart dnsmasq
   sudo ls -l /run/g3-edge-dns/                       # queries.log, group g3-edge, -rw-r-----
   sudo -u g3-edge tail -3 /run/g3-edge-dns/queries.log  # the agent can read it; lines appear as devices browse
   ```
10. **Flow counters.** Reloading resets the existing byte counters, which the agent handles.
    ```bash
    sudo cp local/etc/nftables.conf /etc/nftables.conf
    sudo nft -f /etc/nftables.conf
    sudo nft list set inet acct flows_dl | head
    ```
11. **Check the agent.** Wait 5 minutes, then:
    ```bash
    curl -s http://127.0.0.1:8700/health
    ```
    The health output should show `lastSitesError: null`, `lastDnsAnswers` above 0, and `trackedFlows` above 0.
12. **Clean up the old collector** (see below).

Usage appears on the Overview page within 10 minutes. The first hour of site stats appears on the Sites page about 70 minutes after step 10.

## Printing rollout (replaces shoppi-print)

Printing goes: Shop SW or Edge UI → `workers/edge` → Cloudflare Tunnel (`edge-agent.g3robotics.com`) → the agent's print module → CUPS on the box → the printer. Nothing is stored along the way. If the box can't be reached, printing fails right away with a clear error.

This replaces the old print server behind `shoppi-print.g3robotics.com`, which runs on the same box. Keep it running until step 9 so the shop can print during the switch.

### Box prerequisites

1. **CUPS and printer discovery.** CUPS is probably already installed for shoppi-print. Install whatever is missing (one-time, about 50–100 MB over the hotspot):
   ```bash
   sudo apt install cups cups-filters avahi-daemon
   sudo systemctl enable --now cups avahi-daemon
   ```
   `avahi-daemon` lets CUPS find printers on the shop network (DNS-SD) and set them up without drivers.

### Tunnel

The worker reaches the agent through a Cloudflare Tunnel. If shoppi-print already uses a tunnel on this box, add the new hostname to that tunnel instead of creating another one.

2. **Create or reuse a tunnel.** In the Cloudflare dashboard, go to **Zero Trust → Networks → Tunnels**. To create one, choose **Cloudflared**, name it `g3-edge`, and run the `sudo cloudflared service install <token>` command it shows on the box. The token is a secret; don't commit it.
3. **Add a public hostname** to the tunnel:
   - Subdomain `edge-agent`, domain `g3robotics.com`
   - Path: `^/(print|sync)(/.*)?$` (only these agent routes are reachable; `/health` stays local)
   - Service: `HTTP`, URL `localhost:8700`
4. **Check it** from any machine. You should get `401`: the tunnel reached the agent, and the agent refused because there's no key.
   ```bash
   curl -s -o /dev/null -w "%{http_code}\n" https://edge-agent.g3robotics.com/print/printers
   ```

### Deploy

5. **Edge worker.** It now calls `https://edge-agent.g3robotics.com` (`EDGE_AGENT_URL` in `wrangler.toml`) with the existing `EDGE_AGENT_KEY`.
   ```bash
   pnpm --filter @g3/worker-edge run deploy
   ```
6. **Agent 0.2.0.** This adds the print module and puts `g3-edge` in the `lpadmin` group so it can manage printers.
   ```bash
   pnpm --filter @g3/edge-agent run build
   rsync -a infra/edge/ devices/edge-agent/dist/g3-edge-agent g3@192.168.50.1:~/edge-infra/
   ssh -t g3@192.168.50.1 'cd ~/edge-infra && sudo ./install-agent.sh ./g3-edge-agent 0.2.0'
   ```
7. **Set up the printer** in the Edge UI under **Print → Printers**. Click **Find printers**, then **Add** next to the shop printer; the first printer added becomes the default. If it isn't found, add it by IP address. Then click **Print test page**.

   If shoppi-print already created a CUPS queue for this printer, it shows up here too. You can make it the default instead of adding the printer again.
8. **Try a print** from **Print → Print** in the Edge UI.
9. **Switch the Shop SW over.** Deploy the shop worker. Its `/print` route now sends jobs to the edge worker (one-sided, black and white, default printer) through the `EDGE` service binding, instead of to shoppi-print.
   ```bash
   pnpm --filter @g3/worker-shop run deploy
   ```
   Print a drawing from the Shop SW Files page to confirm.

### Retire shoppi-print

10. Once shop printing works through the edge box:
    - stop and disable the old print server's service on the box;
    - remove the `shoppi-print.g3robotics.com` hostname from its tunnel (and the tunnel itself, if nothing else uses it);
    - delete the shop worker's old secret: `pnpm --filter @g3/worker-shop exec wrangler secret delete PRINT_TOKEN --env production`.

### Troubleshooting

- **"The edge box isn't reachable"**: check the tunnel (step 4), `systemctl status cloudflared`, and `systemctl status g3-edge-agent` on the box.
- **"rejected the worker's key"**: `EDGE_AGENT_KEY` in `/etc/g3-edge/agent.env` doesn't match the worker secret.
- **Printer shows "Stopped"**: CUPS pauses a printer after errors, for example if it was off. Click **Resume** on the Printers page once it's back.
- **On the box**: `lpstat -p -d` lists printers and the default; `lpstat -o` lists queued jobs; the CUPS log is `/var/log/cups/error_log`.

## Changing the network config later

1. Edit the file in `local/`, and make the same change to the committed copy (keeping placeholder MACs).
2. Copy this folder to the box (`rsync` as in step 6) and run `sudo ./check.sh`.
3. Apply one file at a time on the box:
   - **netplan:** `sudo cp local/etc/netplan/10-router.yaml /etc/netplan/ && sudo netplan try`. `netplan try` rolls back automatically unless you confirm within 120 seconds, so a mistake can't lock you out.
   - **nftables:** `sudo cp local/etc/nftables.conf /etc/ && sudo nft -f /etc/nftables.conf`
   - **dnsmasq:** `sudo cp local/etc/dnsmasq.d/lan.conf /etc/dnsmasq.d/ && sudo systemctl restart dnsmasq`

The agent relies on:
- the `inet acct` table and its sets `dl`, `ul`, `flows_dl`, and `flows_ul`;
- the flows sets keeping a timeout of at least 1 hour;
- the interfaces being named `wan0` and `lan0`;
- the query log staying at `/run/g3-edge-dns/queries.log` and being rotated in `create` mode (not `copytruncate`).

`nftables.conf` begins with `flush ruleset`, so every reload resets the counters. The agent handles this.

## Upgrading the agent

Run steps 6 and 7 again with a new version number. The previous version stays in `/opt/g3-edge/versions/`, so rolling back is:

```bash
sudo ln -sfn versions/<old> /opt/g3-edge/current && sudo systemctl restart g3-edge-agent
```

## Removing the old collector

`install-agent.sh` disables `g3-usage.timer` if it's enabled. The agent replaces it, so the old files can be removed:

```bash
sudo rm -f /etc/systemd/system/g3-usage.{service,timer} /usr/local/bin/g3-usage.py
sudo rm -rf /var/lib/g3-router
sudo systemctl daemon-reload
```

## Checking on the agent

```bash
systemctl status g3-edge-agent
journalctl -u g3-edge-agent -f
curl -s http://127.0.0.1:8700/health     # last collect/push, site tracking, unsent buckets
```

If the hotspot is down, usage is buffered in `/var/lib/g3-edge/agent.db` and uploaded when the connection returns.

**Data budget check:** after a day, compare the "Edge box & overhead" line on the Overview page with total usage. It's WAN traffic not attributed to any LAN client (the box's own usage) and should stay small.

**Site stats accuracy:** a large "(unknown)" share on the Sites page means devices are resolving names without the box's DNS, for example with DNS-over-HTTPS, iCloud Private Relay, or a VPN. Phase 2's DNS hardening addresses this.

## Fresh Armbian install (outline)

1. Flash Armbian, create the `g3` user, and set the timezone to `America/New_York`.
2. Disable NetworkManager and use `systemd-networkd`. Install `etc/netplan/10-router.yaml` (real MACs) and `etc/sysctl.d/99-router.conf`, then run `sudo netplan apply && sudo sysctl --system`.
3. Install `nftables` and `dnsmasq`, and enable both services.
4. Follow "First deployment" steps 6–11.
5. Phase 2 adds cloudflared, the tunnel, and SSH through it.
