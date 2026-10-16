import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { loadConfig } from '../config.mjs';

const deployment = new URL('../deploy/', import.meta.url);
function config(name) {
  const source = readFileSync(new URL(name, deployment), 'utf8');
  const sections = new Map(); let section;
  for (const raw of source.split(/\r?\n/u)) {
    const line = raw.trim();
    if (!line || line.startsWith('#') || line.startsWith(';')) continue;
    if (line.startsWith('[')) {
      assert.match(line, /^\[[A-Za-z]+\]$/u);
      section = line.slice(1, -1); sections.set(section, new Map()); continue;
    }
    const split = line.indexOf('=');
    assert.ok(section && split > 0, `invalid deployment line in ${name}`);
    const values = sections.get(section); const key = line.slice(0, split);
    assert.ok(!values.has(key), `duplicate ${key} would weaken deployment checks`);
    values.set(key, line.slice(split + 1));
  }
  return { source, sections, get: (sectionName, key) => sections.get(sectionName)?.get(key) };
}
function bytes(value) {
  const match = /^(\d+)([KMG])?$/u.exec(value ?? '');
  assert.ok(match, `missing or invalid memory limit ${value}`);
  return Number(match[1]) * 1024 ** ({ K: 1, M: 2, G: 3 }[match[2]] ?? 0);
}
function bounded(value, maximum) {
  const actual = bytes(value); assert.ok(actual > 0 && actual <= maximum);
}

test('deployment caps the entire feedback workload including the private logger', () => {
  const slice = config('waterhole.slice');
  const quota = slice.get('Slice', 'CPUQuota');
  assert.match(quota ?? '', /^\d+(?:\.\d+)?%$/u);
  assert.ok(parseFloat(quota) > 0 && parseFloat(quota) <= 50);
  bounded(slice.get('Slice', 'MemoryMax'), 256 * 1024 ** 2);
  assert.equal(slice.get('Slice', 'MemorySwapMax'), '0');
  for (const name of ['waterhole-feedback.service', 'waterhole-tunnel.service', 'journald-waterhole-override.conf']) {
    const unit = config(name);
    assert.equal(unit.get('Service', 'Slice'), 'waterhole.slice');
    bounded(unit.get('Service', 'MemoryMax'), (name.startsWith('journald') ? 32 : 128) * 1024 ** 2);
    assert.equal(unit.get('Service', 'MemorySwapMax'), '0');
  }
});

test('receiver and connector run without privileged execution or writable code', () => {
  for (const [name, user] of [['waterhole-feedback.service', 'waterhole-feedback'], ['waterhole-tunnel.service', 'waterhole-tunnel']]) {
    const unit = config(name);
    assert.equal(unit.get('Service', 'User'), user);
    assert.equal(unit.get('Service', 'Group'), user);
    assert.equal(unit.get('Service', 'NoNewPrivileges'), 'yes');
    assert.equal(unit.get('Service', 'CapabilityBoundingSet'), '');
    assert.equal(unit.get('Service', 'AmbientCapabilities'), '');
    assert.equal(unit.get('Service', 'ProtectSystem'), 'strict');
    assert.equal(unit.get('Service', 'ProtectHome'), 'yes');
    assert.equal(unit.get('Service', 'PrivateDevices'), 'yes');
    assert.equal(unit.get('Service', 'PrivateTmp'), 'yes');
    assert.equal(unit.get('Service', 'UMask'), '0077');
    assert.ok(Number(unit.get('Service', 'Nice')) >= 10);
    assert.ok(Number(unit.get('Service', 'OOMScoreAdjust')) >= 500);
    assert.equal(unit.get('Service', 'LogNamespace'), 'waterhole');
    assert.ok(Number(unit.get('Service', 'LogRateLimitBurst')) <= 100);
    const service = unit.sections.get('Service');
    for (const key of service.keys()) {
      assert.ok(!['ReadWritePaths', 'BindPaths', 'RootDirectory', 'NetworkNamespacePath'].includes(key), `${name} contains an unreviewed filesystem/network exception`);
      if (key.startsWith('Exec')) {
        assert.equal(key, 'ExecStart', 'deployment must not run side-effecting setup hooks');
        const command = service.get(key);
        assert.match(command, /^\/opt\/waterhole-feedback\//u);
        assert.doesNotMatch(command, /(?:docker|iptables|nft|ufw|tailscale|amnezia|\bservice\s+install|\/bin\/(?:ba)?sh)/iu);
      }
    }
  }
  const receiver = config('waterhole-feedback.service');
  assert.equal(receiver.get('Service', 'StateDirectory'), 'waterhole-feedback');
  assert.equal(receiver.get('Service', 'StateDirectoryMode'), '0700');
  assert.equal(receiver.get('Service', 'EnvironmentFile'), '/etc/waterhole-feedback/receiver.env');
  assert.match(receiver.get('Service', 'ExecStart'), /\/node\/bin\/node .*\/current\/feedback-server\/start\.mjs$/u);
  assert.equal(loadConfig({ HOST: '0.0.0.0' }).host, '127.0.0.1', 'public binding must not be configurable');
});

test('connector keeps credentials private and metrics on loopback', () => {
  const tunnel = config('waterhole-tunnel.service');
  assert.equal(tunnel.get('Service', 'LoadCredential'), 'tunnel-token:/etc/waterhole-feedback/tunnel-token');
  const command = tunnel.get('Service', 'ExecStart');
  assert.match(command, /^\/opt\/waterhole-feedback\/cloudflared tunnel /u);
  assert.match(command, /(?:^| )--token-file %d\/tunnel-token(?: |$)/u);
  assert.match(command, /(?:^| )--metrics 127\.0\.0\.1:3211(?: |$)/u);
  assert.match(command, /(?:^| )--no-autoupdate(?: |$)/u);
  assert.doesNotMatch(command, /(?:^| )--token(?: |=)|(?:0\.0\.0\.0|\[::\])|--(?:url|proxy-address|warp-routing)/u);
  for (const name of ['waterhole-feedback.service', 'waterhole-tunnel.service', 'journald-waterhole-override.conf', 'journald-waterhole.conf', 'waterhole.slice']) {
    assert.doesNotMatch(config(name).source, /(?:TURNSTILE_SECRET_KEY|TUNNEL_TOKEN|PRIVATE KEY)\s*[=:]/u);
  }
});

test('feedback journals have their own bounded disk budget without forwarding copies', () => {
  const journal = config('journald-waterhole.conf');
  assert.equal(journal.get('Journal', 'Storage'), 'persistent');
  bounded(journal.get('Journal', 'SystemMaxUse'), 16 * 1024 ** 2);
  bounded(journal.get('Journal', 'SystemMaxFileSize'), 2 * 1024 ** 2);
  bounded(journal.get('Journal', 'RuntimeMaxUse'), 16 * 1024 ** 2);
  bounded(journal.get('Journal', 'RuntimeMaxFileSize'), 2 * 1024 ** 2);
  for (const key of ['ForwardToSyslog', 'ForwardToKMsg', 'ForwardToConsole', 'ForwardToWall']) assert.equal(journal.get('Journal', key), 'no');
});
