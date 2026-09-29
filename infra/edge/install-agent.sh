#!/usr/bin/env bash
# Installs or upgrades the edge agent on the edge box. Run as root on the box:
#   sudo ./install-agent.sh ./g3-edge-agent 0.1.0
# Expects to be run from a copy of infra/edge/ (it reads files from etc/).
set -euo pipefail

if [[ $EUID -ne 0 ]]; then echo "Run as root (sudo)." >&2; exit 1; fi
if [[ $# -ne 2 ]]; then echo "Usage: $0 <path-to-g3-edge-agent-binary> <version>" >&2; exit 1; fi

BINARY=$1
VERSION=$2
HERE=$(cd "$(dirname "$0")" && pwd)
BASE=/opt/g3-edge

# 1. Service user (no login, no home).
if ! id g3-edge &>/dev/null; then
  useradd --system --no-create-home --shell /usr/sbin/nologin g3-edge
  echo "Created user g3-edge"
fi

# 2. Binary: /opt/g3-edge/versions/<version>/g3-edge-agent, with `current` pointing at it.
install -d -m 755 "$BASE/versions/$VERSION"
install -m 755 "$BINARY" "$BASE/versions/$VERSION/g3-edge-agent"
ln -sfn "versions/$VERSION" "$BASE/current.tmp"
mv -T "$BASE/current.tmp" "$BASE/current"
echo "Installed $VERSION -> $BASE/current"

# 3. Config. Stop here on first install so the key can be filled in.
install -d -m 755 /etc/g3-edge
if [[ ! -f /etc/g3-edge/agent.env ]]; then
  install -m 600 -o root -g root "$HERE/etc/g3-edge/agent.env.example" /etc/g3-edge/agent.env
  echo
  echo "Created /etc/g3-edge/agent.env from the example."
  echo "Set EDGE_AGENT_KEY (and EDGE_WORKER_URL if needed), then re-run this script."
  exit 0
fi
if grep -q '^EDGE_AGENT_KEY=replace-me' /etc/g3-edge/agent.env; then
  echo "EDGE_AGENT_KEY in /etc/g3-edge/agent.env is still the placeholder." >&2
  exit 1
fi
chmod 600 /etc/g3-edge/agent.env

# 4. The agent reads the dnsmasq leases file; make sure it can.
LEASES=/var/lib/misc/dnsmasq.leases
if [[ -f $LEASES ]] && ! sudo -u g3-edge test -r "$LEASES"; then
  echo "Warning: g3-edge can't read $LEASES; clients will show as ip:<addr>." >&2
fi

# 5. systemd unit.
install -m 644 "$HERE/etc/systemd/system/g3-edge-agent.service" /etc/systemd/system/g3-edge-agent.service
systemctl daemon-reload

# 6. Retire the old collector (script and its database are left in place).
if systemctl list-unit-files g3-usage.timer &>/dev/null && systemctl is-enabled g3-usage.timer &>/dev/null; then
  systemctl disable --now g3-usage.timer
  echo "Disabled old g3-usage.timer"
fi

systemctl enable g3-edge-agent
systemctl restart g3-edge-agent
sleep 2
systemctl --no-pager --lines=10 status g3-edge-agent || true
echo
echo "Health: $(curl -fsS http://127.0.0.1:8700/health || echo 'not responding yet')"
