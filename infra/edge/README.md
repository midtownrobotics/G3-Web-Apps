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
| `etc/nftables.conf` | Firewall, NAT, and the `inet acct` byte counters the agent reads (per client, and per client and remote IP for site stats). Reloading it leaves the agent's own `inet g3` table alone. |
| `etc/dnsmasq.d/lan.conf` | DHCP and DNS for the LAN, the query log used for site stats, and an include of the agent's generated config |
| `etc/tmpfiles.d/g3-edge.conf` | Creates `/run/g3-edge-dns/` at boot for the query log (kept in RAM), and `/var/lib/g3-edge/dnsmasq/` for the agent's generated dnsmasq config |
| `etc/logrotate.d/g3-edge-dns` | Rotates the query log daily |
| `etc/systemd/system/g3-edge-agent.service` | Runs the agent as user `g3-edge` with only `CAP_NET_ADMIN` |
| `etc/systemd/system/g3-edge-dnsmasq.{path,service}` | Restarts dnsmasq (after `dnsmasq --test`) when the agent changes its generated config, so the agent needs no extra privileges |
| `etc/g3-edge/agent.env.example` | Template for `/etc/g3-edge/agent.env` (agent config and shared key; root-only, mode 600) |
| `install-agent.sh` | Installs or upgrades the agent binary |
| `check.sh` | Validates nftables, dnsmasq, and netplan configs before you apply them |
| `local/` | **Gitignored.** The real files from the box, in the same layout |

This repo is public. The committed `10-router.yaml` uses placeholder MACs (`02:00:00:00:00:0x`); the real one is in `local/`. Every other file is the same in both places. `check.sh` uses the `local/` copy of a file when there is one.

SSH to the box works from the shop LAN, and for now also on `wan0` (the `# TEMP` rule in `nftables.conf`). Remove that rule, from both copies, before going live.

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

For blocklists and exceptions, continue with "Phase 2 rollout" below.

## Phase 2 rollout (blocklists, exceptions, DNS hardening)

For a box already running the Phase 1 setup above. Do the cloud steps first: a new agent talking to an old worker just logs sync errors until the worker is updated.

### Cloud

1. **Database.** Apply the new migration (`0003_control.sql`):
   ```bash
   pnpm --filter @g3/worker-edge run db:migrate:remote
   ```
2. **Worker.** Deploy it. The worker now pokes the agent at `https://edge-agent.g3robotics.com` (`EDGE_AGENT_URL` in `wrangler.toml`).
   ```bash
   pnpm --filter @g3/worker-edge run deploy
   ```
3. **UI.** Push the branch so Pages rebuilds. Admins get **Network → Controls**, plus an **Exceptions** card on each device's page.

### Tunnel

The tunnel lets the worker tell the agent "something changed" instantly. It's optional: without it, the box still picks up changes within 5 minutes, since every upload response tells it the current settings version. It only forwards `POST /sync`, which requires the shared key and carries no data; the agent then fetches the settings from the worker itself.

4. **Create the tunnel.** In the Cloudflare dashboard, go to **Zero Trust → Networks → Tunnels → Create a tunnel** and choose **Cloudflared**. Name it `g3-edge`.
5. **Install cloudflared on the box.** Follow the dashboard's "Debian, arm64" instructions: add Cloudflare's apt repo, `sudo apt install cloudflared`, then run the `sudo cloudflared service install <token>` command it shows. The token is a secret; don't commit it.
6. **Add the public hostname** in the tunnel's settings:
   - Subdomain `edge-agent`, domain `g3robotics.com`
   - Path: `^/sync$` (nothing else on the agent is reachable through the tunnel)
   - Service: `HTTP`, URL `localhost:8700`
7. **Check it** from any machine. It should return 401 (the tunnel works; there's no key):
   ```bash
   curl -s -o /dev/null -w "%{http_code}\n" -X POST https://edge-agent.g3robotics.com/sync
   ```
   `https://edge-agent.g3robotics.com/health` should be 404. The **Tunnel** card on the Edge Box page runs the same check and should say **Connected**.

### Box

8. **Install agent 0.2.0.** From the repo root:
   ```bash
   pnpm --filter @g3/edge-agent run build
   rsync -a infra/edge/ devices/edge-agent/dist/g3-edge-agent g3@192.168.50.1:~/edge-infra/
   ssh -t g3@192.168.50.1
   cd ~/edge-infra
   sudo ./install-agent.sh ./g3-edge-agent 0.2.0
   ```
   This also installs the dnsmasq restart units and creates `/var/lib/g3-edge/dnsmasq/`. The agent writes its dnsmasq config there, but dnsmasq ignores it until step 10.
9. **Validate:** `sudo ./check.sh`
10. **Apply the base config changes.** nftables no longer clears the agent's table on reload; dnsmasq includes the agent's config. (The temporary SSH-on-`wan0` rule is unchanged.)
    ```bash
    sudo cp local/etc/nftables.conf /etc/nftables.conf
    sudo nft -f /etc/nftables.conf
    sudo cp local/etc/dnsmasq.d/lan.conf /etc/dnsmasq.d/
    sudo systemctl restart dnsmasq
    ```
11. **Check.** The first command should list `table inet g3`. In the health output, `enforcement` should show `lastSyncError: null` and `appliedStateVersion` matching the version shown on the Edge Box page.
    ```bash
    sudo nft list tables
    curl -s http://127.0.0.1:8700/health
    ```
12. **Try it.** In the UI, create a small blocklist (for example `example.com`), turn on **Enforce blocklists**, and open that site from a device on the shop network. It should fail to load within a few seconds; a device may need up to 5 minutes if it had the site's address cached. Then give that device an exception, and the site should load.

To see what the agent has applied on the box:
```bash
sudo nft list table inet g3                           # rules; blocklist sets fill as devices look up sites
sudo cat /var/lib/g3-edge/dnsmasq/g3-edge.conf        # generated dnsmasq config
```

**If something goes wrong:** turn off **Enforce blocklists** and **DNS hardening** in the UI; the box removes all blocking within seconds (or 5 minutes without the tunnel). If the UI or internet is unavailable, on the box: `sudo nft delete table inet g3` removes blocking until the agent's next cycle, and `sudo systemctl stop g3-edge-agent` keeps it off.

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
- the query log staying at `/run/g3-edge-dns/queries.log` and being rotated in `create` mode (not `copytruncate`);
- `nftables.conf` never using `flush ruleset`, which would delete the agent's `inet g3` table (the agent recreates it within 5 minutes, but blocking stops until then);
- `lan.conf` keeping its `conf-dir=/var/lib/g3-edge/dnsmasq/,*.conf` line.

Reloading `nftables.conf` resets the `inet acct` counters. The agent handles this.

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

**Site stats accuracy:** a large "(unknown)" share on the Sites page means devices are resolving names without the box's DNS, for example with DNS-over-HTTPS, iCloud Private Relay, or a VPN. Turning on **DNS hardening** (Network → Controls) addresses most of this; VPNs can't be fully stopped.

## Fresh Armbian install (outline)

1. Flash Armbian, create the `g3` user, and set the timezone to `America/New_York`.
2. Disable NetworkManager and use `systemd-networkd`. Install `etc/netplan/10-router.yaml` (real MACs) and `etc/sysctl.d/99-router.conf`, then run `sudo netplan apply && sudo sysctl --system`.
3. Install `nftables` and `dnsmasq`, and enable both services.
4. Follow "First deployment" steps 6–11, then "Phase 2 rollout" steps 5, 8, and 10.
