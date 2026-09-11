'use strict';

// The package as a library: what roadmap-live-cloud requires without the
// CLI. Nothing here touches the filesystem except the fixtures.

const { test } = require('node:test');
const assert = require('node:assert');
const lib = require('../roadmap-live');
const { fixture, fakeGithubFetch, fakeProvider, baseEnv } = require('./helpers');

const NOW = Date.parse('2026-09-10T12:00:00Z');

test('the entry exports the pieces a service needs', () => {
  for (const name of ['validate', 'loadRoadmap', 'parseArgs', 'diffChanges']) assert.strictEqual(typeof lib[name], 'function', `${name} (kept from before)`);
  for (const name of ['renderPage', 'staticState', 'syncRoadmap', 'addComment', 'changelogLines', 'applyClassification', 'classifyPr', 'buildPrompt', 'validateClassification']) {
    assert.strictEqual(typeof lib[name], 'function', name);
  }
  assert.strictEqual(typeof lib.github.createClient, 'function');
  assert.strictEqual(typeof lib.github.fetchPullRequests, 'function');
  assert.strictEqual(typeof lib.providers.byName, 'function');
  assert.strictEqual(typeof lib.providers.resolveProvider, 'function');
  assert.ok(Array.isArray(lib.providers.PROVIDERS));
  assert.deepStrictEqual(lib.BUILTIN_THEMES, ['neutral', 'paper', 'mono']);
});

test('syncRoadmap returns the next roadmap and the changes without writing anything', async () => {
  const roadmap = fixture('roadmap-base.json');
  const before = JSON.stringify(roadmap);
  const log = [];
  const r = await lib.syncRoadmap({
    roadmap,
    repo: 'acme/abholbereit',
    token: 't',
    provider: fakeProvider(),
    fetchFn: fakeGithubFetch(),
    now: NOW,
    lang: 'en',
    env: baseEnv,
    log: (l) => log.push(l),
  });
  assert.strictEqual(JSON.stringify(roadmap), before, 'input is not mutated');
  assert.strictEqual(r.prs.length, 4);
  assert.deepStrictEqual(r.failed, []);
  assert.strictEqual(r.lastRun, '2026-09-10T12:00:00.000Z');
  const by = (id) => r.roadmap.items.find((it) => it.id === id);
  assert.strictEqual(by('menu-editor').status, 'done');
  assert.strictEqual(by('checkout').status, 'active');
  assert.strictEqual(by('checkout').open_points.length, 2);
  assert.deepStrictEqual(r.roadmap.sync, { last_run: '2026-09-10T12:00:00.000Z', repo: 'acme/abholbereit' });
  assert.ok(r.changes.some((c) => c.kind === 'status' && c.title === 'Menu editor' && c.to === 'done'));
  const lines = lib.changelogLines(r.changes, r.t, 'en');
  assert.ok(lines.some((l) => l.includes('Menu editor active → done')));
  assert.ok(log.some((l) => l.includes('Classifying #42')));
});

test('syncRoadmap with no new activity reports prs: [] and leaves the roadmap alone', async () => {
  const roadmap = fixture('roadmap-base.json');
  roadmap.sync = { last_run: '2026-09-10T11:00:00Z', repo: 'acme/abholbereit' };
  const r = await lib.syncRoadmap({ roadmap, repo: 'acme/abholbereit', token: 't', provider: fakeProvider(), fetchFn: fakeGithubFetch(), now: NOW, env: baseEnv });
  assert.deepStrictEqual(r.prs, []);
  assert.deepStrictEqual(r.changes, []);
  assert.deepStrictEqual(r.roadmap, roadmap);
});

test('syncRoadmap keeps a failed pull request for the next run', async () => {
  const roadmap = fixture('roadmap-base.json');
  const good = fakeProvider();
  const provider = { name: 'partial', async classify(prompt) { if (prompt.includes('Pull request #43:')) return 'no json'; return good.classify(prompt); } };
  const r = await lib.syncRoadmap({ roadmap, repo: 'acme/abholbereit', token: 't', provider, fetchFn: fakeGithubFetch(), now: NOW, env: baseEnv });
  assert.deepStrictEqual(r.failed.map((pr) => pr.number), [43]);
  assert.strictEqual(r.roadmap.sync.last_run, '2026-09-08T10:59:59.000Z');
  assert.strictEqual(r.roadmap.items.find((it) => it.id === 'menu-editor').status, 'done');
});

test('addComment appends a human comment to roadmap data in memory', () => {
  const roadmap = fixture('roadmap-base.json');
  const r = lib.addComment(roadmap, 'checkout', '  finish the cart first ', '2026-09-10T12:00:00Z');
  assert.deepStrictEqual(r, { ok: true });
  const item = roadmap.items.find((it) => it.id === 'checkout');
  assert.deepStrictEqual(item.comments, [{ from: 'human', text: 'finish the cart first', at: '2026-09-10T12:00:00Z' }]);
  assert.strictEqual(lib.addComment(roadmap, 'nope', 'x').status, 400);
  assert.strictEqual(lib.addComment(roadmap, 'checkout', '   ').status, 400);
  assert.strictEqual(lib.addComment(roadmap, 'checkout', 'x'.repeat(2001)).status, 413);
});

test('renderPage builds a page from in-memory state', () => {
  const roadmap = fixture('roadmap-base.json');
  const state = { mode: 'static', ok: true, data: roadmap, error: null, file: 'roadmap.json', changelog: [], generatedAt: new Date(NOW).toISOString(), repoUrl: null, roadmapUrl: null };
  const html = lib.renderPage(state, { theme: 'paper', lang: 'en', now: NOW });
  assert.ok(html.startsWith('<!doctype html>'));
  assert.ok(html.includes(roadmap.project));
});
