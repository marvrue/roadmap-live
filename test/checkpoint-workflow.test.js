'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { spawnSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const { tmpDir, baseEnv } = require('./helpers');

test('real CLI workflow: agreed scope, one task, missing evidence, completion, scope drift and milestone closure', () => {
  const file = path.join(tmpDir(), 'roadmap.json');
  fs.copyFileSync(path.join(__dirname, '../examples/checkpoint-roadmap.json'), file);
  const cli = path.join(__dirname, '../roadmap-live.js');
  const run = (expected, ...args) => {
    const result = spawnSync(process.execPath, [cli, ...args, file], { encoding: 'utf8', env: { ...baseEnv, ROADMAP_LANG: 'en' } });
    assert.equal(result.status, expected, result.stdout + result.stderr);
    return result;
  };
  const edit = (fn) => { const r = JSON.parse(fs.readFileSync(file)); fn(r); fs.writeFileSync(file, JSON.stringify(r)); };
  run(0, 'focus', '--milestone', 'm1', '--reason', 'Deliver the first usable flow');
  for (const id of ['place-order', 'open-order']) {
    run(0, 'checkpoint', '--event', 'start', '--item', id);
    edit((r) => { r.items.find((i) => i.id === id).status = 'active'; });
    assert.match(run(2, 'checkpoint', '--event', 'complete', '--item', id).stdout, /evidence missing/);
    if (id === 'place-order') assert.match(run(2, 'checkpoint', '--event', 'start', '--item', 'open-order').stdout, /Finish or hand back/);
    edit((r) => { r.items.find((i) => i.id === id).acceptance[0].evidence = 'Simulated evidence for this CLI test, not a product claim'; });
    run(0, 'checkpoint', '--event', 'complete', '--item', id);
    edit((r) => { r.items.find((i) => i.id === id).status = 'done'; });
    run(0, 'checkpoint');
    if (id === 'place-order') run(2, 'checkpoint', '--event', 'milestone');
  }
  run(0, 'checkpoint', '--event', 'milestone');
  edit((r) => { r.items.push({ id: 'extra', title: 'An unagreed extra', milestone: 'm1', status: 'todo' }); });
  assert.match(run(2, 'checkpoint', '--event', 'scope').stdout, /since the scope was agreed/);
  run(0, '--check');
});
