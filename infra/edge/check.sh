#!/usr/bin/env bash
# Validates the base network configs before applying them. Run on the box:
#   sudo ./check.sh
# Uses the real files in local/ (gitignored) when present, otherwise the
# committed copies (which have placeholder MACs, so netplan may complain).
set -euo pipefail

HERE=$(cd "$(dirname "$0")" && pwd)
pick() { if [[ -f "$HERE/local/$1" ]]; then echo "$HERE/local/$1"; else echo "$HERE/$1"; fi; }
status=0

NFT=$(pick etc/nftables.conf)
echo "== nftables: $NFT"
if nft -c -f "$NFT"; then echo "ok"; else status=1; fi

DNSMASQ=$(pick etc/dnsmasq.d/lan.conf)
echo "== dnsmasq: $DNSMASQ"
if dnsmasq --test --conf-file="$DNSMASQ"; then :; else status=1; fi

NETPLAN=$(pick etc/netplan/10-router.yaml)
echo "== netplan: $NETPLAN"
ROOT=$(mktemp -d)
trap 'rm -rf "$ROOT"' EXIT
install -D -m 600 "$NETPLAN" "$ROOT/etc/netplan/10-router.yaml"
if netplan generate --root-dir "$ROOT"; then echo "ok"; else status=1; fi

if [[ $status -eq 0 ]]; then echo "All checks passed."; else echo "Some checks FAILED." >&2; fi
exit $status
