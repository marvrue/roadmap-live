'use strict';

const { test } = require('node:test');
const assert = require('node:assert');
const classify = require('../src/classify');
const github = require('../src/github');
const { fixture, fakeGithubFetch, fakeProvider } = require('./helpers');

async function recordedPrs() {
  const client = github.createClient({ token: 't', fetchFn: fakeGithubFetch() });
  const prs = await github.fetchPullRequests(client, 'acme/abholbereit', '2026-08-11T00:00:00Z');
  return Object.fromEntries(prs.map((p) => [p.number, p]));
}

test('prompt contains items, schema, comments with sources and the language', async () => {
  const prs = await recordedPrs();
  const prompt = classify.buildPrompt({ roadmap: fixture('roadmap-base.json'), pr: prs[44], lang: 'de' });
  assert.ok(prompt.includes('id: checkout | title: Checkout with pickup time | milestone: Ordering flow'));
  assert.ok(prompt.includes('[pr:44#review_comment:2001] anna'));
  assert.ok(prompt.includes('on src/cart.js'));
  assert.ok(prompt.includes('in German'));
  assert.ok(prompt.includes('"item_id": "menu-editor"'), 'schema example');
  const merged = classify.buildPrompt({ roadmap: fixture('roadmap-base.json'), pr: prs[42], lang: 'en' });
  assert.ok(merged.includes('State: merged; review state: approved'));
  assert.ok(merged.includes('[pr:42#review:900] anna APPROVED'));
});

test('classifyPr accepts fenced JSON from the provider and validates it', async () => {
  const prs = await recordedPrs();
  const roadmap = fixture('roadmap-base.json');
  for (const n of [41, 42, 43, 44]) {
    const r = await classify.classifyPr({ roadmap, pr: prs[n], provider: fakeProvider(), lang: 'en' });
    assert.strictEqual(r.ok, true, `PR ${n}`);
    assert.deepStrictEqual(Object.keys(r.value), ['matches', 'open_points', 'unplanned']);
  }
});

test('unknown item ids are dropped, wrong shapes fail', () => {
  const ids = ['a', 'b'];
  const ok = classify.validateClassification({ matches: [{ item_id: 'zzz', confidence: 0.9 }, { item_id: 'a', confidence: 1.7, status_hint: 'weird' }], open_points: [{ item_id: 'zzz', text: 'x' }], unplanned: [] }, ids);
  assert.strictEqual(ok.ok, true);
  assert.deepStrictEqual(ok.value.matches, [{ item_id: 'a', confidence: 1, status_hint: null }]);
  assert.deepStrictEqual(ok.value.open_points, []);
  assert.strictEqual(classify.validateClassification({ matches: 'no' }, ids).ok, false);
  assert.strictEqual(classify.validateClassification([], ids).ok, false);
  assert.strictEqual(classify.validateClassification({ matches: [{ item_id: 'a', confidence: 'high' }] }, ids).ok, false);
  assert.strictEqual(classify.validateClassification({}, ids).ok, true, 'missing arrays mean empty');
});

test('malformed JSON is retried once, then the PR is skipped', async () => {
  const prs = await recordedPrs();
  let calls = 0;
  const bad = { name: 'bad', async classify() { calls++; return 'I cannot answer in JSON, sorry.'; } };
  const r = await classify.classifyPr({ roadmap: fixture('roadmap-base.json'), pr: prs[41], provider: bad, lang: 'en' });
  assert.strictEqual(r.ok, false);
  assert.strictEqual(r.malformed, true);
  assert.strictEqual(calls, 2);

  let n = 0;
  const flaky = { name: 'flaky', async classify() { n++; return n === 1 ? '{ broken' : JSON.stringify(fixture('classify/pr-41.json')); } };
  const r2 = await classify.classifyPr({ roadmap: fixture('roadmap-base.json'), pr: prs[41], provider: flaky, lang: 'en' });
  assert.strictEqual(r2.ok, true);
  assert.strictEqual(n, 2);

  const failing = { name: 'down', async classify() { throw new Error('network down'); } };
  const r3 = await classify.classifyPr({ roadmap: fixture('roadmap-base.json'), pr: prs[41], provider: failing, lang: 'en' });
  assert.strictEqual(r3.ok, false);
  assert.match(r3.reason, /network down/);
});

test('extractJson handles fences, prose and nested braces', () => {
  assert.deepStrictEqual(classify.extractJson('```json\n{"a":{"b":1}}\n```'), { a: { b: 1 } });
  assert.deepStrictEqual(classify.extractJson('Sure: {"a":[1,2]} done'), { a: [1, 2] });
  assert.strictEqual(classify.extractJson('nothing here'), null);
  assert.strictEqual(classify.extractJson(null), null);
});
