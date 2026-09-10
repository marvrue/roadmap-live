'use strict';

const { test } = require('node:test');
const assert = require('node:assert');
const github = require('../src/github');
const { fakeGithubFetch, fakeExec } = require('./helpers');

test('fetchPullRequests paginates, stops at since and normalizes four PRs', async () => {
  const calls = [];
  const client = github.createClient({ token: 't', fetchFn: fakeGithubFetch({ calls }) });
  const prs = await github.fetchPullRequests(client, 'acme/storefront', '2026-08-11T00:00:00Z');
  assert.deepStrictEqual(prs.map((p) => p.number), [44, 42, 43, 41], 'PR 40 is older than since');
  assert.ok(calls.some((u) => u.includes('page=2')), 'follows the Link header');
  assert.ok(!calls.some((u) => u.includes('/pulls/40/')), 'no detail calls for skipped PRs');

  const by = Object.fromEntries(prs.map((p) => [p.number, p]));
  assert.strictEqual(by[42].merged, true);
  assert.strictEqual(by[42].review_state, 'approved');
  assert.strictEqual(by[42].comments.length, 2);
  assert.strictEqual(by[42].comments[0].type, 'comment');
  assert.strictEqual(by[43].review_state, 'approved', 'approval after changes requested');
  assert.strictEqual(by[43].reviews.map((r) => r.state).join(','), 'CHANGES_REQUESTED,APPROVED');
  assert.strictEqual(by[44].review_state, 'none');
  assert.strictEqual(by[44].comments.length, 2);
  assert.strictEqual(by[44].comments[0].type, 'review_comment');
  assert.strictEqual(by[44].comments[0].path, 'src/cart.js');
  assert.strictEqual(by[41].comments.length, 0);
});

test('reviewDecision', () => {
  const at = (s, t) => ({ state: s, submitted_at: t });
  assert.strictEqual(github.reviewDecision([at('CHANGES_REQUESTED', '2026-09-01T00:00:00Z')]), 'changes_requested');
  assert.strictEqual(github.reviewDecision([at('CHANGES_REQUESTED', '2026-09-01T00:00:00Z'), at('APPROVED', '2026-09-02T00:00:00Z')]), 'approved');
  assert.strictEqual(github.reviewDecision([at('APPROVED', '2026-09-01T00:00:00Z'), at('CHANGES_REQUESTED', '2026-09-02T00:00:00Z')]), 'changes_requested');
  assert.strictEqual(github.reviewDecision([at('COMMENTED', '2026-09-01T00:00:00Z')]), 'none');
  assert.strictEqual(github.reviewDecision([]), 'none');
});

test('backs off on rate limits and gives up on other errors', async () => {
  let n = 0;
  const waits = [];
  const fetchFn = async () => {
    n++;
    if (n === 1) return new Response('{"message":"rate limited"}', { status: 403, headers: { 'x-ratelimit-remaining': '0', 'x-ratelimit-reset': String(Math.floor(Date.now() / 1000) + 2) } });
    return new Response('[]', { status: 200 });
  };
  const client = github.createClient({ token: 't', fetchFn, wait: async (ms) => waits.push(ms) });
  assert.deepStrictEqual(await client.list('/repos/a/b/pulls'), []);
  assert.strictEqual(waits.length, 1);
  assert.ok(waits[0] > 0 && waits[0] <= 4000);

  const failing = github.createClient({ token: 't', fetchFn: async () => new Response('{"message":"Bad credentials"}', { status: 401 }) });
  await assert.rejects(() => failing.get('/user'), /GitHub API 401.*Bad credentials/);
});

test('resolveRepo order: flag, sync.repo, GITHUB_REPOSITORY, git remote', () => {
  const roadmap = { sync: { repo: 'from/roadmap' } };
  const env = { GITHUB_REPOSITORY: 'from/env' };
  const exec = fakeExec([], { git: 'git@github.com:from/remote.git\n' });
  assert.deepStrictEqual(github.resolveRepo({ flag: 'from/flag', roadmap, env, exec }), { repo: 'from/flag', source: 'flag' });
  assert.deepStrictEqual(github.resolveRepo({ roadmap, env, exec }), { repo: 'from/roadmap', source: 'roadmap' });
  assert.deepStrictEqual(github.resolveRepo({ roadmap: {}, env, exec }), { repo: 'from/env', source: 'env' });
  assert.deepStrictEqual(github.resolveRepo({ roadmap: {}, env: {}, exec }), { repo: 'from/remote', source: 'git' });
  assert.strictEqual(github.resolveRepo({ roadmap: {}, env: {}, exec: fakeExec([]) }), null);
  assert.strictEqual(github.repoFromRemote('https://github.com/a/b'), 'a/b');
  assert.strictEqual(github.repoFromRemote('https://github.com/a/b.git'), 'a/b');
  assert.strictEqual(github.repoFromRemote('https://gitlab.com/a/b.git'), null);
});
