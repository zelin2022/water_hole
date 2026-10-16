#!/usr/bin/env bash
# Manually run on the intended Ubuntu host as root with three prepared private inputs.
# Usage: sudo bash install-host.sh /private/source.tar /private/receiver.env /private/tunnel-token
set -Eeuo pipefail
umask 077

fail() { printf '%s\n' "$*" >&2; exit 1; }
[[ $EUID -eq 0 ]] || fail 'Run this reviewed installer as root.'
[[ $# -eq 3 ]] || fail 'Expected source.tar, receiver.env, and tunnel-token paths.'
[[ $(uname -s) == Linux && $(uname -m) == x86_64 ]] || fail 'Only Linux x86_64 is supported.'
for command in python3 curl tar sha256sum systemctl systemd-analyze getent useradd install ss mktemp; do
  command -v "$command" >/dev/null || fail "Required command unavailable: $command"
done
[[ $(systemd --version | head -n 1 | awk '{print $2}') -ge 255 ]] || fail 'systemd 255 or newer is required.'

refuse_existing() {
  [[ ! -e $1 && ! -L $1 ]] || fail "Refusing to replace existing path: $1"
}
refuse_existing /opt/waterhole-feedback
refuse_existing /etc/waterhole-feedback
refuse_existing /var/lib/waterhole-feedback
for unit in waterhole.slice waterhole-feedback.service waterhole-tunnel.service; do
  refuse_existing "/etc/systemd/system/$unit"
  [[ $(systemctl show -p LoadState --value "$unit") == not-found ]] || fail "Existing unit requires manual review: $unit"
done
refuse_existing /etc/systemd/journald@waterhole.conf
refuse_existing /etc/systemd/system/systemd-journald@waterhole.service.d
for user in waterhole-feedback waterhole-tunnel; do
  ! getent passwd "$user" >/dev/null || fail "Existing user requires manual review: $user"
  ! getent group "$user" >/dev/null || fail "Existing group requires manual review: $user"
done
for port in 3210 3211; do
  [[ -z $(ss -H -lnt "sport = :$port") ]] || fail "Required loopback port is already occupied: $port"
done
for input in "$@"; do
  [[ -f $input && ! -L $input ]] || fail 'Inputs must be regular files, not symbolic links.'
done

stage=$(mktemp -d /var/tmp/waterhole-feedback-install.XXXXXXXX)
cleanup() {
  case "$stage" in /var/tmp/waterhole-feedback-install.*) rm -rf -- "$stage" ;; esac
}
trap cleanup EXIT
install -m 0600 "$1" "$stage/source.tar"
install -m 0600 "$2" "$stage/receiver-input.env"
install -m 0600 "$3" "$stage/token-input"

# Validate the complete archive before extracting any member. Never evaluate an env file as shell.
python3 - "$stage" <<'PY_VALIDATE'
import pathlib, re, tarfile, urllib.parse, sys
stage = pathlib.Path(sys.argv[1])
allowed_root = {
    '.env.example', '.gitignore', 'README.md', 'abuse.mjs', 'admin.mjs',
    'config.mjs', 'png.mjs', 'protocol.mjs', 'server.mjs', 'start.mjs',
    'store.mjs', 'verify.js'
}
allowed_deploy = {
    'install-host.sh', 'waterhole.slice', 'waterhole-feedback.service',
    'waterhole-tunnel.service', 'journald-waterhole.conf', 'journald-waterhole-override.conf'
}
allowed_tests = {'abuse', 'config', 'deployment', 'png', 'protocol', 'server', 'store'}
required = {'feedback-server/' + name for name in allowed_root}
required |= {'feedback-server/deploy/' + name for name in allowed_deploy - {'install-host.sh'}}
if (stage / 'source.tar').stat().st_size > 20 * 1024 * 1024:
    raise SystemExit('Source archive is too large.')
with tarfile.open(stage / 'source.tar', 'r:') as archive:
    members = archive.getmembers()
    if len(members) > 1000:
        raise SystemExit('Too many source archive members.')
    seen = set()
    total = 0
    for member in members:
        name = member.name.rstrip('/')
        parts = name.split('/')
        if not name or '\\' in name or name.startswith('/') or any(p in ('', '.') for p in parts) or ".." in parts or parts[0] != "feedback-server":
            raise SystemExit('Unsafe source archive path.')
        if name in seen or member.issym() or member.islnk() or not (member.isdir() or member.isfile()):
            raise SystemExit('Duplicate, linked, or nonregular source member.')
        seen.add(name)
        if member.isdir():
            if name not in {'feedback-server', 'feedback-server/deploy', 'feedback-server/test'}:
                raise SystemExit('Unexpected source directory.')
        else:
            permitted = (len(parts) == 2 and parts[1] in allowed_root)
            permitted |= (len(parts) == 3 and parts[1] == 'deploy' and parts[2] in allowed_deploy)
            permitted |= (len(parts) == 3 and parts[1] == 'test' and parts[2].endswith('.check.mjs') and parts[2][:-10] in allowed_tests)
            total += member.size
            if not permitted or member.size > 2 * 1024 * 1024 or total > 10 * 1024 * 1024:
                raise SystemExit('Unexpected or oversized source file.')
    if not required.issubset(seen):
        raise SystemExit('Source archive is incomplete.')
    destination = stage / 'source'
    destination.mkdir(mode=0o700)
    for member in members:
        target = destination.joinpath(*member.name.rstrip('/').split('/'))
        if member.isdir():
            target.mkdir(parents=True, exist_ok=True, mode=0o755)
        else:
            target.parent.mkdir(parents=True, exist_ok=True, mode=0o755)
            with archive.extractfile(member) as reader, target.open('xb') as writer:
                writer.write(reader.read())
            target.chmod(0o644)

allowed_env = {'PORT', 'PUBLIC_ORIGIN', 'TURNSTILE_HOSTNAME', 'TURNSTILE_SITE_KEY', 'TURNSTILE_SECRET_KEY', 'FEEDBACK_DB', 'SUBMISSIONS_ENABLED', 'TRUST_PROXY', 'ALLOWED_WEB_ORIGINS'}
values = {}
for line in (stage / 'receiver-input.env').read_text(encoding='utf-8-sig').splitlines():
    line = line.strip()
    if not line or line.startswith('#'):
        continue
    key, separator, value = line.partition('=')
    if not separator or key not in allowed_env or key in values or any(c in value for c in '\x00\r\n'):
        raise SystemExit('Invalid or duplicate receiver configuration key.')
    values[key] = value
origin = values.get('PUBLIC_ORIGIN', '')
url = urllib.parse.urlsplit(origin)
hostname = values.get('TURNSTILE_HOSTNAME', '')
if url.scheme != 'https' or url.username is not None or url.password is not None or url.path not in ('', '/') or url.query or url.fragment or url.port is not None or url.hostname != hostname or not re.fullmatch(r'[a-z0-9](?:[a-z0-9.-]{0,251}[a-z0-9])?', hostname):
    raise SystemExit('Expected one exact HTTPS hostname without a port or path.')
for key in ('TURNSTILE_SITE_KEY', 'TURNSTILE_SECRET_KEY'):
    if not re.fullmatch(r'[A-Za-z0-9_-]{1,128}', values.get(key, '')):
        raise SystemExit('Missing or invalid Turnstile credential.')
if values.get('ALLOWED_WEB_ORIGINS', ''):
    raise SystemExit('Review additional browser origins separately after installation.')
token = (stage / 'token-input').read_text(encoding='utf-8-sig').strip()
if not re.fullmatch(r'[A-Za-z0-9_+/=.\-]{20,4096}', token):
    raise SystemExit('Invalid tunnel token file.')
safe = ['PORT=3210', 'PUBLIC_ORIGIN=https://' + hostname, 'TURNSTILE_HOSTNAME=' + hostname,
        'TURNSTILE_SITE_KEY=' + values['TURNSTILE_SITE_KEY'], 'TURNSTILE_SECRET_KEY=' + values['TURNSTILE_SECRET_KEY'],
        'FEEDBACK_DB=/var/lib/waterhole-feedback/feedback.sqlite', 'SUBMISSIONS_ENABLED=0',
        'TRUST_PROXY=cloudflare-tunnel', 'ALLOWED_WEB_ORIGINS=']
(stage / 'receiver.env').write_text('\n'.join(safe) + '\n', encoding='utf-8')
(stage / 'tunnel-token').write_text(token + '\n', encoding='utf-8')
PY_VALIDATE

NODE_VERSION=24.22.0
NODE_SHA256=cc2f601cee82d9a5a233302fe307abc600727035fd7d2c3a3571755989e95008
CLOUDFLARED_VERSION=2026.10.1
CLOUDFLARED_SHA256=3bfc539f45d2620c71debb7a86be0efa737ed5ccbad9eb85c787116900e5c586
curl --proto '=https' --tlsv1.2 --fail --silent --show-error --location --retry 2 --connect-timeout 10 --max-time 180 \
  "https://nodejs.org/dist/v$NODE_VERSION/node-v$NODE_VERSION-linux-x64.tar.xz" -o "$stage/node.tar.xz"
curl --proto '=https' --tlsv1.2 --fail --silent --show-error --location --retry 2 --connect-timeout 10 --max-time 180 \
  "https://github.com/cloudflare/cloudflared/releases/download/$CLOUDFLARED_VERSION/cloudflared-linux-amd64" -o "$stage/cloudflared"
printf '%s  %s\n' "$NODE_SHA256" "$stage/node.tar.xz" "$CLOUDFLARED_SHA256" "$stage/cloudflared" | sha256sum --check --status
mkdir "$stage/node"
tar -xJf "$stage/node.tar.xz" --strip-components=1 -C "$stage/node" --no-same-owner
chmod 0755 "$stage/cloudflared"
"$stage/node/bin/node" --version
"$stage/cloudflared" --version
"$stage/cloudflared" tunnel run --help | grep -- '--token-file' >/dev/null

# Inventory is private and read-only; the installer controls only its own new units.
ss -lntup > "$stage/listeners-before.txt"
systemctl --no-pager --plain list-units --type=service --state=running > "$stage/services-before.txt"
useradd --system --user-group --no-create-home --home-dir /nonexistent --shell /usr/sbin/nologin waterhole-feedback
useradd --system --user-group --no-create-home --home-dir /nonexistent --shell /usr/sbin/nologin waterhole-tunnel
install -d -m 0755 /opt/waterhole-feedback /opt/waterhole-feedback/current
install -d -m 0700 /etc/waterhole-feedback
cp -R "$stage/node" /opt/waterhole-feedback/node
install -m 0755 "$stage/cloudflared" /opt/waterhole-feedback/cloudflared
cp -R "$stage/source/feedback-server" /opt/waterhole-feedback/current/feedback-server
chmod -R a+rX /opt/waterhole-feedback
chmod -R go-w /opt/waterhole-feedback
find /opt/waterhole-feedback -type d -exec chmod 0755 {} +
chown -R root:root /opt/waterhole-feedback
install -m 0600 "$stage/receiver.env" /etc/waterhole-feedback/receiver.env
install -m 0600 "$stage/tunnel-token" /etc/waterhole-feedback/tunnel-token
install -m 0600 "$stage/listeners-before.txt" /etc/waterhole-feedback/listeners-before.txt
install -m 0600 "$stage/services-before.txt" /etc/waterhole-feedback/services-before.txt
deploy=/opt/waterhole-feedback/current/feedback-server/deploy
for unit in waterhole.slice waterhole-feedback.service waterhole-tunnel.service; do
  install -m 0644 "$deploy/$unit" "/etc/systemd/system/$unit"
done
install -m 0644 "$deploy/journald-waterhole.conf" /etc/systemd/journald@waterhole.conf
install -d -m 0755 /etc/systemd/system/systemd-journald@waterhole.service.d
install -m 0644 "$deploy/journald-waterhole-override.conf" /etc/systemd/system/systemd-journald@waterhole.service.d/limits.conf
systemd-analyze verify /etc/systemd/system/waterhole.slice /etc/systemd/system/waterhole-feedback.service /etc/systemd/system/waterhole-tunnel.service systemd-journald@waterhole.service
systemctl daemon-reload
systemctl enable --now waterhole-feedback.service
healthy=0
for attempt in {1..10}; do
  if curl --fail --silent --max-time 1 http://127.0.0.1:3210/health > "$stage/health.json" && \
    python3 -c 'import json,sys; value=json.load(open(sys.argv[1])); sys.exit(0 if value == {"ok": True, "accepting": False} else 1)' "$stage/health.json"; then
    healthy=1; break
  fi
  sleep 1
done
[[ $healthy -eq 1 ]] || fail 'Receiver health failed; inspect journalctl --namespace=waterhole -u waterhole-feedback.service.'
systemctl enable --now waterhole-tunnel.service
ready=0
for attempt in {1..20}; do
  if curl --fail --silent --max-time 1 http://127.0.0.1:3211/ready >/dev/null; then ready=1; break; fi
  sleep 1
done
ss -lntup > /etc/waterhole-feedback/listeners-after.txt
systemctl --no-pager --plain list-units --type=service --state=running > /etc/waterhole-feedback/services-after.txt
systemctl show -p ActiveState -p MemoryCurrent -p MemoryPeak -p CPUUsageNSec waterhole-feedback.service waterhole-tunnel.service waterhole.slice
[[ $ready -eq 1 ]] || fail 'Tunnel not ready yet; inspect journalctl --namespace=waterhole -u waterhole-tunnel.service. Receiver remains disabled.'
printf '%s\n' 'Installed isolated feedback services. Submissions remain disabled. Public routing, load checks, and live human verification are still required.'
