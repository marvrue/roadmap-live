'use strict';

const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const { runSync } = require('../src/sync');
const { fixture, fakeGithubFetch, fakeProvider, fakeExec, tmpDir, baseEnv } = require('./helpers');

const NOW = Date.parse('2026-09-10T12:00:00Z');

function setup(data = fixture('roadmap-base.json')) {
  const dir = tmpDir();
  const file = path.join(dir, 'roadmap.json');
  fs.writeFileSync(file, `${JSON.stringify(data, null, 2)}\n`);
  return { dir, file };
}

function run(file, { dryRun = false, now = NOW, log = [], provider = fakeProvider() } = {}) {
  const env = { ...baseEnv, GITHUB_TOKEN: 't' };
  return runSync({ file, repo: 'acme/storefront', dryRun, apply: false, provider: null }, env, {
    log: (l) => log.push(l), fetchFn: fakeGithubFetch(), exec: fakeExec([]), provider, now,
  });
}

test('sync end to end: statuses, open points, unplanned, changelog, key order', async () => {
  const { dir, file } = setup();
  const log = [];
  assert.strictEqual(await run(file, { log }), 0);
  const after = JSON.parse(fs.readFileSync(file, 'utf8'));
  const by = (id) => after.items.find((it) => it.id === id);
  assert.strictEqual(by('listing-editor').status, 'done');
  assert.strictEqual(by('checkout').status, 'active');
  assert.strictEqual(by('checkout').open_points.length, 2);
  assert.strictEqual(by('payment').status, 'active');
  assert.strictEqual(by('order-queue').status, 'todo');
  assert.deepStrictEqual(after.unplanned, [{ title: 'Wishlist alerts', prs: [41], first_seen: '2026-09-06T09:00:00Z' }]);
  assert.deepStrictEqual(after.sync, { last_run: '2026-09-10T12:00:00.000Z', repo: 'acme/storefront' });
  assert.deepStrictEqual(Object.keys(after), ['project', 'milestones', 'items', 'unplanned', 'sync'], 'existing key order kept, new keys appended');
  assert.deepStrictEqual(Object.keys(by('listing-editor')), ['id', 'title', 'milestone', 'status', 'updated', 'prs', 'branch']);
  const raw = fs.readFileSync(file, 'utf8');
  assert.ok(raw.startsWith('{\n  "project"') && raw.endsWith('}\n'), 'two-space indentation and trailing newline');

  const changelog = fs.readFileSync(path.join(dir, 'CHANGELOG.md'), 'utf8');
  assert.ok(changelog.startsWith('# Changelog'));
  assert.ok(changelog.includes('Listing editor active → done (https://github.com/acme/storefront/pull/42)'));
  assert.ok(changelog.includes('Checkout with reserved copies todo → active'));
  assert.ok(log.some((l) => l.includes('4 pull requests with new activity')));
});

test('sync is idempotent: a second run on the same activity changes nothing', async () => {
  const { dir, file } = setup();
  await run(file);
  const first = fs.readFileSync(file, 'utf8');
  const firstLog = fs.readFileSync(path.join(dir, 'CHANGELOG.md'), 'utf8');
  const log = [];
  await run(file, { now: NOW + 3600000, log });
  assert.strictEqual(fs.readFileSync(file, 'utf8'), first);
  assert.strictEqual(fs.readFileSync(path.join(dir, 'CHANGELOG.md'), 'utf8'), firstLog);
  assert.ok(log.some((l) => l.includes('No new pull request activity')));

  // Even when the same PRs are fetched again (last_run moved back), the
  // apply step produces no changes.
  const data = JSON.parse(first);
  data.sync.last_run = '2026-08-11T00:00:00Z';
  fs.writeFileSync(file, `${JSON.stringify(data, null, 2)}\n`);
  const log2 = [];
  await run(file, { now: NOW + 7200000, log: log2 });
  assert.ok(log2.some((l) => l.includes('No changes to the roadmap')));
  const again = JSON.parse(fs.readFileSync(file, 'utf8'));
  again.sync.last_run = data.sync.last_run;
  assert.deepStrictEqual(again, data);
  assert.strictEqual(fs.readFileSync(path.join(dir, 'CHANGELOG.md'), 'utf8'), firstLog);
});

test('--dry-run prints the plan and writes nothing', async () => {
  const { dir, file } = setup();
  const before = fs.readFileSync(file, 'utf8');
  const log = [];
  assert.strictEqual(await run(file, { dryRun: true, log }), 0);
  assert.strictEqual(fs.readFileSync(file, 'utf8'), before);
  assert.ok(!fs.existsSync(path.join(dir, 'CHANGELOG.md')));
  assert.ok(log.some((l) => l.includes('Planned changes:')));
  assert.ok(log.some((l) => l.includes('Listing editor: active → done (PR #42)')));
  assert.ok(log.some((l) => l.includes('Dry run, nothing was written.')));
});

test('a PR that fails classification is skipped and fetched again next time', async () => {
  const { file } = setup();
  const good = fakeProvider();
  const provider = { name: 'partial', async classify(prompt) { if (prompt.includes('Pull request #43:')) return 'no json'; return good.classify(prompt); } };
  const log = [];
  assert.strictEqual(await run(file, { provider, log }), 0);
  const after = JSON.parse(fs.readFileSync(file, 'utf8'));
  assert.strictEqual(after.items.find((it) => it.id === 'listing-editor').status, 'done', 'other PRs are still applied');
  assert.strictEqual(after.items.find((it) => it.id === 'payment').status, 'todo');
  assert.strictEqual(after.sync.last_run, '2026-09-08T10:59:59.000Z', 'just before the failed PR\'s updated_at');
  assert.ok(log.some((l) => l.includes('Skipped #43')));
});

test('invalid roadmap stops sync before any network call', async () => {
  const { file } = setup({ project: 'x', milestones: [], items: [{ id: 'a' }] });
  const orig = console.error;
  const errors = [];
  console.error = (l) => errors.push(l);
  try {
    assert.strictEqual(await run(file), 1);
  } finally {
    console.error = orig;
  }
  assert.ok(errors[0].includes('is invalid'));
});
