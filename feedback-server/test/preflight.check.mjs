import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import test from 'node:test';

const bash = process.platform === 'win32' ? 'C:/Program Files/Git/bin/bash.exe' : '/bin/bash';
const source = readFileSync(new URL('../deploy/install-host.sh', import.meta.url), 'utf8').replaceAll('\r\n', '\n');
const functionSource = source.match(/refuse_existing_unit\(\) \{[\s\S]*?\n# Unit availability check ends\./u)?.[0];
const state = {
  LoadState: 'loaded', ActiveState: 'inactive', FragmentPath: '',
  SourcePath: '', DropInPaths: '', Transient: 'no',
};

function check(unit, changes = {}, queryStatus = 0) {
  assert.ok(functionSource, 'installer must provide the tested unit availability check');
  const result = spawnSync(bash, ['--noprofile', '--norc', '-c', `
set -Eeuo pipefail
fail() { printf '%s\\n' "$*" >&2; exit 1; }
systemctl() { printf '%s\\n' "$UNIT_STATE"; return "$QUERY_STATUS"; }
${functionSource}
refuse_existing_unit "$UNIT_NAME"
`], {
    encoding: 'utf8', timeout: 5000,
    env: { ...process.env, UNIT_NAME: unit, QUERY_STATUS: String(queryStatus),
      UNIT_STATE: Object.entries({ ...state, ...changes }).map(([key, value]) => `${key}=${value}`).join('\n') },
  });
  assert.ifError(result.error);
  return result;
}

test('unit preflight accepts an unused implicit slice and a missing service', { skip: !existsSync(bash) }, () => {
  for (const [unit, changes] of [
    ['waterhole.slice', {}],
    ['waterhole-feedback.service', { LoadState: 'not-found' }],
  ]) {
    const result = check(unit, changes);
    assert.equal(result.status, 0, result.stderr);
  }
});

test('unit preflight refuses configured, active, transient or loaded service units', { skip: !existsSync(bash) }, () => {
  for (const [unit, changes] of [
    ['waterhole.slice', { FragmentPath: '/etc/systemd/system/waterhole.slice' }],
    ['waterhole.slice', { SourcePath: '/run/generated/waterhole.slice' }],
    ['waterhole.slice', { DropInPaths: '/etc/systemd/system/waterhole.slice.d/limits.conf' }],
    ['waterhole.slice', { ActiveState: 'active' }],
    ['waterhole.slice', { Transient: 'yes' }],
    ['waterhole-feedback.service', {}],
  ]) {
    const result = check(unit, changes);
    assert.equal(result.status, 1, `${unit} with ${JSON.stringify(changes)} must be refused`);
    assert.match(result.stderr, /manual review/iu);
  }
});

test('unit preflight fails closed when systemd inspection fails', { skip: !existsSync(bash) }, () => {
  const result = check('waterhole-feedback.service', { LoadState: 'not-found' }, 1);
  assert.equal(result.status, 1);
  assert.match(result.stderr, /(?:inspect|query|manual review)/iu);
});
