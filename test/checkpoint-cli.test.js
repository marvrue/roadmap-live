'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');
const { tmpDir, baseEnv } = require('./helpers');
const { runCheckpoint, writeRoadmap } = require('../src/checkpoint-cli');
const cli = path.resolve(__dirname, '..', 'roadmap-live.js');
const env = { ...baseEnv, ROADMAP_LANG: 'en' };
function sample() {
  const file = path.join(tmpDir(), 'roadmap.json');
  const data = { project: 'Sample', milestones: [{ id: 'm1', title: 'First', outcome: 'A usable result' }], items: [{ id: 'a', title: 'A', milestone: 'm1', status: 'active', updated: '2026-09-10T12:00:00Z', acceptance: [{ id: 'works', text: 'Works' }] }] };
  fs.writeFileSync(file, JSON.stringify(data));
  assert.equal(runCheckpoint({ command: 'focus', file, milestone: 'm1', reason: 'First delivery' }, env, { log() {} }), 0);
  return file;
}
test('CLI records a failing complete check, preserves agent fields, and becomes a no-op on identical input', () => {
  const file = sample(); const options = { command: 'checkpoint', file, event: 'complete', item: 'a' };
  const run = () => runCheckpoint(options, env, { log() {} });
  assert.equal(run(), 2);
  const first = fs.readFileSync(file, 'utf8'); const parsed = JSON.parse(first);
  assert.equal(parsed.items[0].status, 'active'); assert.equal(parsed.items[0].updated, '2026-09-10T12:00:00Z');
  assert.equal(parsed.checkpoint.result, 'review');
  assert.equal(run(), 2); assert.equal(fs.readFileSync(file, 'utf8'), first);
  parsed.items[0].acceptance[0].evidence = 'Observed a working result';
  fs.writeFileSync(file, JSON.stringify(parsed));
  assert.equal(run(), 0); assert.equal(JSON.parse(fs.readFileSync(file)).checkpoint.result, 'continue');
});
test('dry-run never writes and real CLI returns 2 for findings, 1 for invalid options, 0 for success', () => {
  const file = sample(); const before = fs.readFileSync(file, 'utf8');
  const run = (...args) => spawnSync(process.execPath, [cli, 'checkpoint', file, ...args], { env, encoding: 'utf8' });
  const pending = run('--event', 'complete', '--item', 'a', '--dry-run');
  assert.equal(pending.status, 2, pending.stderr); assert.match(pending.stdout, /evidence missing/);
  assert.equal(fs.readFileSync(file, 'utf8'), before);
  assert.equal(run('--event', 'wrong').status, 1);
  assert.equal(run('--event', 'start').status, 1);
  assert.equal(run('--event', 'scope', '--item', 'a').status, 1);
  assert.equal(run('--event', 'check', '--dry-run').status, 0);
});
test('scope agreement needs a reason and a known milestone, and dry-run does not reset the baseline', () => {
  const file = sample(); const before = fs.readFileSync(file, 'utf8'); const deps = { log() {} };
  for (const opts of [{ milestone: 'm1' }, { milestone: 'unknown', reason: 'Why' }]) {
    assert.equal(runCheckpoint({ command: 'focus', file, ...opts }, env, deps), 1);
  }
  assert.equal(runCheckpoint({ command: 'focus', file, milestone: 'm1', reason: 'Another reason', dryRun: true }, env, deps), 0);
  assert.equal(fs.readFileSync(file, 'utf8'), before);
});
test('atomic checkpoint writer refuses an intervening edit and leaves it intact', () => {
  const file = sample(); const old = fs.readFileSync(file, 'utf8');
  const newer = JSON.parse(old); newer.items[0].comments = [{ from: 'human', text: 'Keep this', at: '2026-09-15T10:00:00Z' }];
  const raw = JSON.stringify(newer); fs.writeFileSync(file, raw);
  assert.throws(() => writeRoadmap(file, old, JSON.parse(old)), /changed during checkpoint/);
  assert.equal(fs.readFileSync(file, 'utf8'), raw);
  assert.ok(!fs.existsSync(`${file}.checkpoint-${process.pid}.tmp`));
});
