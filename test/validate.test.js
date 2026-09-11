'use strict';

const { test } = require('node:test');
const assert = require('node:assert');
const { validate } = require('../src/validate');
const { fixture, tmpDir } = require('./helpers');

test('old roadmap.json without sync fields is valid', () => {
  assert.deepStrictEqual(validate(fixture('roadmap-old.json')), []);
});

test('new roadmap.json with prs, open_points, unplanned, sync, theme is valid', () => {
  assert.deepStrictEqual(validate(fixture('demo-roadmap.json')), []);
});

test('blocked is a valid status', () => {
  const data = fixture('roadmap-base.json');
  data.items[0].status = 'blocked';
  assert.deepStrictEqual(validate(data), []);
});

test('rejects unknown status, unknown milestone and duplicate ids', () => {
  const data = fixture('roadmap-base.json');
  data.items[0].status = 'doing';
  data.items[1].milestone = 'm9';
  data.items[2].id = data.items[3].id;
  const errors = validate(data);
  assert.ok(errors.some((e) => e.includes('status must be one of todo, active, blocked, done')));
  assert.ok(errors.some((e) => e.includes('unknown milestone "m9"')));
  assert.ok(errors.some((e) => e.includes('used more than once')));
});

test('rejects malformed sync fields', () => {
  const data = fixture('roadmap-base.json');
  data.items[0].prs = [0, 'x'];
  data.items[0].open_points = [{ text: '', source: 'pr:1', opened: 'yesterday' }];
  data.unplanned = [{ title: '' }];
  data.sync = { repo: 'not a repo', last_run: 'nope' };
  data.stale_after_days = 0;
  data.language = 'German';
  const errors = validate(data);
  assert.ok(errors.some((e) => e.includes('prs[0]')));
  assert.ok(errors.some((e) => e.includes('prs[1]')));
  assert.ok(errors.some((e) => e.includes('open_points[0].text')));
  assert.ok(errors.some((e) => e.includes('open_points[0].opened')));
  assert.ok(errors.some((e) => e.includes('unplanned[0].title')));
  assert.ok(errors.some((e) => e.includes('unplanned[0].first_seen')));
  assert.ok(errors.some((e) => e.includes('sync.repo')));
  assert.ok(errors.some((e) => e.includes('sync.last_run')));
  assert.ok(errors.some((e) => e.includes('stale_after_days')));
  assert.ok(errors.some((e) => e.includes('language')));
});

test('root must be an object', () => {
  assert.deepStrictEqual(validate([]), ['root must be a JSON object']);
});

test('comments, question and branch are valid when well formed', () => {
  const data = fixture('roadmap-base.json');
  data.items[0].branch = 'feat/menu';
  data.items[0].comments = [
    { from: 'human', text: 'Finish the cart first', at: '2026-09-11T08:10:00Z' },
    { from: 'agent', text: 'Ok, cart first.', at: '2026-09-11T08:32:00Z' },
  ];
  data.items[0].question = { text: 'Pickup time in 15 or 30 minute steps?', options: ['15', '30'], asked: '2026-09-11T08:32:00Z' };
  data.items[1].question = { text: 'Which font?', asked: '2026-09-11T08:32:00Z' };
  assert.deepStrictEqual(validate(data), []);
});

test('rejects malformed comments, question and branch', () => {
  const data = fixture('roadmap-base.json');
  data.items[0].branch = '';
  data.items[0].comments = [
    { from: 'bot', text: 'x', at: '2026-09-11T08:10:00Z' },
    { from: 'human', text: '', at: '2026-09-11T08:10:00Z' },
    { from: 'human', text: 'ok', at: 'yesterday' },
    'not an object',
  ];
  data.items[1].question = { text: '', options: [], asked: 'nope' };
  data.items[2].question = { text: 'q', options: ['a', 'b', 'c', 'd', 'e'], asked: '2026-09-11T08:10:00Z' };
  data.items[3].question = 'just a string';
  const errors = validate(data);
  assert.ok(errors.some((e) => e.includes('branch must be a non-empty string')));
  assert.ok(errors.some((e) => e.includes('comments[0].from must be "human" or "agent"')));
  assert.ok(errors.some((e) => e.includes('comments[1].text must be a non-empty string')));
  assert.ok(errors.some((e) => e.includes('comments[2].at must be an ISO 8601')));
  assert.ok(errors.some((e) => e.includes('comments[3] must be an object')));
  assert.ok(errors.some((e) => e.includes('question.text must be a non-empty string')));
  assert.ok(errors.some((e) => e.includes('question.options must have 1 to 4 entries')));
  assert.ok(errors.some((e) => e.includes('question.asked must be an ISO 8601')));
  assert.ok(errors.some((e) => e.includes('items[2] ("payment").question.options must have 1 to 4 entries')));
  assert.ok(errors.some((e) => e.includes('items[3] ("order-queue").question must be an object')));
});

test('--check warns above 200 KB', () => {
  const { runCheck } = require('../src/cli');
  const fs = require('fs');
  const path = require('path');
  const data = fixture('roadmap-base.json');
  data.items[0].comments = Array.from({ length: 3000 }, (_, i) => ({ from: 'human', text: `comment number ${i} with some padding text to make it long`, at: '2026-09-11T08:10:00Z' }));
  const file = path.join(tmpDir(), 'roadmap.json');
  fs.writeFileSync(file, JSON.stringify(data, null, 2));
  const logs = [];
  const orig = console.log;
  console.log = (l) => logs.push(l);
  try { assert.strictEqual(runCheck(file, { LANG: 'C' }), 0); } finally { console.log = orig; }
  assert.ok(logs.some((l) => l.includes('KB, trim old comments')));
});

test('view setting: milestones or board', () => {
  const data = fixture('roadmap-base.json');
  data.view = 'board';
  assert.deepStrictEqual(validate(data), []);
  data.view = 'kanban';
  assert.ok(validate(data).some((e) => e.includes('"view" must be one of milestones, board')));
});
