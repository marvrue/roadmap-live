'use strict';

const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const { appendComment, createStore } = require('../src/store');
const { fixture, tmpDir } = require('./helpers');

const NOW = '2026-09-11T08:10:00.000Z';

function roadmapFile(data = fixture('roadmap-base.json')) {
  const file = path.join(tmpDir(), 'roadmap.json');
  fs.writeFileSync(file, `${JSON.stringify(data, null, 2)}\n`);
  return file;
}

test('appendComment adds a human comment, keeps key order and indentation', () => {
  const file = roadmapFile();
  assert.deepStrictEqual(appendComment(file, 'listing-editor', 'Finish the cart first', NOW), { ok: true });
  const raw = fs.readFileSync(file, 'utf8');
  assert.ok(raw.startsWith('{\n  "project"') && raw.endsWith('}\n'));
  const item = JSON.parse(raw).items[0];
  assert.deepStrictEqual(Object.keys(item), ['id', 'title', 'milestone', 'status', 'updated', 'comments']);
  assert.deepStrictEqual(item.comments, [{ from: 'human', text: 'Finish the cart first', at: NOW }]);
  appendComment(file, 'listing-editor', 'And the checkout after', NOW);
  assert.strictEqual(JSON.parse(fs.readFileSync(file, 'utf8')).items[0].comments.length, 2);
});

test('appendComment rejects empty text, unknown ids, long text and invalid files', () => {
  const file = roadmapFile();
  assert.strictEqual(appendComment(file, 'listing-editor', '   ', NOW).status, 400);
  assert.strictEqual(appendComment(file, 'listing-editor', 42, NOW).status, 400);
  assert.strictEqual(appendComment(file, 'nope', 'hi', NOW).status, 400);
  assert.strictEqual(appendComment(file, 'listing-editor', 'x'.repeat(2001), NOW).status, 413);
  fs.writeFileSync(file, '{ broken');
  assert.strictEqual(appendComment(file, 'listing-editor', 'hi', NOW).status, 409);
});

test('store snapshot carries git state and addComment notifies listeners', async () => {
  const file = roadmapFile();
  const store = createStore(file, { gitDir: path.dirname(file) });
  try {
    assert.strictEqual(store.snapshot().git, null, 'temp dir is not a git repo');
    const seen = [];
    store.subscribe((snap) => seen.push(snap));
    assert.deepStrictEqual(store.addComment('checkout', 'Please debounce'), { ok: true });
    await new Promise((r) => setTimeout(r, 50));
    const last = seen[seen.length - 1];
    assert.strictEqual(last.data.items[1].comments[0].text, 'Please debounce');
  } finally {
    store.stop();
  }
});
