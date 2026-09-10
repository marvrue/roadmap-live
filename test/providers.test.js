'use strict';

const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const { resolveProvider, PROVIDERS } = require('../src/providers');
const { runSync, INBOX_DIR, INBOX_FILE, PENDING_FILE, RESULT_FILE } = require('../src/sync');
const { fakeExec, fakeGithubFetch, fixture, tmpDir, baseEnv } = require('./helpers');

test('provider order: anthropic, claude-cli, codex-cli, gemini-cli, agent', () => {
  assert.deepStrictEqual(PROVIDERS.map((p) => p.name), ['anthropic', 'claude-cli', 'codex-cli', 'gemini-cli', 'agent']);
});

test('ANTHROPIC_API_KEY wins over installed CLIs', () => {
  const r = resolveProvider({ env: { ...baseEnv, ANTHROPIC_API_KEY: 'k' }, exec: fakeExec(['claude', 'codex', 'gemini']) });
  assert.strictEqual(r.provider.name, 'anthropic');
  assert.strictEqual(r.skipped.length, 0);
});

test('claude before codex before gemini, agent as fallback', () => {
  assert.strictEqual(resolveProvider({ env: baseEnv, exec: fakeExec(['claude', 'codex', 'gemini']) }).provider.name, 'claude-cli');
  assert.strictEqual(resolveProvider({ env: baseEnv, exec: fakeExec(['codex', 'gemini']) }).provider.name, 'codex-cli');
  assert.strictEqual(resolveProvider({ env: baseEnv, exec: fakeExec(['gemini']) }).provider.name, 'gemini-cli');
  const r = resolveProvider({ env: baseEnv, exec: fakeExec([]) });
  assert.strictEqual(r.provider.name, 'agent');
  assert.deepStrictEqual(r.skipped.map((s) => s.name), ['anthropic', 'claude-cli', 'codex-cli', 'gemini-cli']);
});

test('--provider and ROADMAP_PROVIDER override the order', () => {
  assert.strictEqual(resolveProvider({ env: { ...baseEnv, ANTHROPIC_API_KEY: 'k' }, name: 'gemini-cli', exec: fakeExec(['gemini']) }).provider.name, 'gemini-cli');
  assert.strictEqual(resolveProvider({ env: { ...baseEnv, ANTHROPIC_API_KEY: 'k', ROADMAP_PROVIDER: 'agent' }, exec: fakeExec([]) }).provider.name, 'agent');
  assert.throws(() => resolveProvider({ env: baseEnv, name: 'nope', exec: fakeExec([]) }), /unknown provider: nope/);
  assert.throws(() => resolveProvider({ env: baseEnv, name: 'codex-cli', exec: fakeExec([]) }), /not available/);
});

test('agent provider round trip: inbox written, result applied, files removed', async () => {
  const dir = tmpDir();
  const file = path.join(dir, 'roadmap.json');
  fs.writeFileSync(file, JSON.stringify(fixture('roadmap-base.json'), null, 2));
  const env = { ...baseEnv, ROADMAP_PROVIDER: 'agent', GITHUB_TOKEN: 't' };
  const log = [];
  const opts = { file, repo: 'acme/abholbereit', dryRun: false, apply: false, provider: null };
  const code = await runSync(opts, env, { log: (l) => log.push(l), fetchFn: fakeGithubFetch(), exec: fakeExec([]), now: Date.parse('2026-09-10T12:00:00Z') });
  assert.strictEqual(code, 0);
  assert.ok(log.some((l) => l.includes('Your coding agent will classify 4 pull requests on its next run. Then run: roadmap-live sync --apply')));
  const inboxFile = path.join(dir, INBOX_DIR, INBOX_FILE);
  const inbox = JSON.parse(fs.readFileSync(inboxFile, 'utf8'));
  assert.strictEqual(inbox.prs.length, 4);
  assert.ok(inbox.items.some((it) => it.id === 'menu-editor'));
  assert.ok(inbox.prs[0].prompt.includes('Answer with exactly this JSON shape'));
  assert.deepStrictEqual(JSON.parse(fs.readFileSync(file, 'utf8')), fixture('roadmap-base.json'), 'sync must not write before --apply');

  // The agent classifies and writes result.json, keyed by PR number.
  const results = {};
  for (const n of [41, 42, 43, 44]) results[n] = fixture(`classify/pr-${n}.json`);
  fs.writeFileSync(path.join(dir, INBOX_DIR, RESULT_FILE), JSON.stringify(results));
  fs.unlinkSync(inboxFile);

  const code2 = await runSync({ ...opts, apply: true }, env, { log: (l) => log.push(l) });
  assert.strictEqual(code2, 0);
  const after = JSON.parse(fs.readFileSync(file, 'utf8'));
  const by = (id) => after.items.find((it) => it.id === id);
  assert.strictEqual(by('menu-editor').status, 'done');
  assert.deepStrictEqual(by('menu-editor').prs, [42]);
  assert.strictEqual(by('checkout').status, 'active');
  assert.strictEqual(by('checkout').open_points.length, 2);
  assert.strictEqual(by('payment').status, 'active');
  assert.deepStrictEqual(after.unplanned.map((u) => u.prs), [[41]]);
  assert.strictEqual(after.sync.repo, 'acme/abholbereit');
  assert.ok(!fs.existsSync(path.join(dir, INBOX_DIR, PENDING_FILE)));
  assert.ok(!fs.existsSync(path.join(dir, INBOX_DIR, RESULT_FILE)));
  assert.ok(fs.readFileSync(path.join(dir, 'CHANGELOG.md'), 'utf8').includes('Menu editor active → done'));
});
