'use strict';

const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const { validate, warnings } = require('../src/validate');
const { runCheck } = require('../src/cli');
const { fixture, tmpDir } = require('./helpers');

// Writes data to a temp roadmap.json, runs --check with the given env, and
// returns the exit code plus everything printed to stdout and stderr.
function checkOutput(data, env) {
  const file = path.join(tmpDir(), 'roadmap.json');
  fs.writeFileSync(file, JSON.stringify(data, null, 2));
  const logs = [];
  const errs = [];
  const origLog = console.log;
  const origErr = console.error;
  console.log = (l) => logs.push(l);
  console.error = (l) => errs.push(l);
  let code;
  try { code = runCheck(file, env); } finally { console.log = origLog; console.error = origErr; }
  return { code, logs, errs };
}

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
  const data = fixture('roadmap-base.json');
  data.items[0].comments = Array.from({ length: 3000 }, (_, i) => ({ from: 'human', text: `comment number ${i} with some padding text to make it long`, at: '2026-09-11T08:10:00Z' }));
  const { code, logs } = checkOutput(data, { LANG: 'C' });
  assert.strictEqual(code, 0);
  assert.ok(logs.some((l) => l.includes('KB, trim old comments')));
});

test('view setting: every view name the renderer knows is accepted, anything else named in the error', () => {
  const { VIEWS } = require('../src/page/view');
  assert.ok(VIEWS.length >= 9);
  for (const v of VIEWS) {
    const data = fixture('roadmap-base.json');
    data.view = v;
    assert.deepStrictEqual(validate(data), [], v);
  }
  const data = fixture('roadmap-base.json');
  data.view = 'kanban';
  assert.ok(validate(data).some((e) => e.endsWith(`"view" must be one of ${VIEWS.join(', ')}`)));
});

// Goals

test('goal on an item is valid with label, target, current, source and changed', () => {
  const data = fixture('roadmap-base.json');
  data.items[0].goal = { label: 'GitHub stars', target: 100, current: 34, source: 'github-stars:marvrue/roadmap-live', changed: '2026-09-11T14:00:00Z' };
  data.items[1].goal = { label: 'People using it', target: 10, current: 0 };
  data.items[2].goal = { label: 'Downloads', target: 500, source: 'npm-downloads:@scope/pkg-name' };
  data.items[3].goal = { label: 'Customers', target: 1, source: 'stripe-customers:acct_123' };
  assert.deepStrictEqual(validate(data), []);
});

test('rejects malformed goals', () => {
  const data = fixture('roadmap-base.json');
  data.items[0].goal = { label: '', target: 0, current: -1, source: 'github-stars:not/a/repo', changed: 'yesterday' };
  data.items[1].goal = { label: 'x', target: 10, current: '5', source: 'npm-downloads:Not/Valid_Name' };
  data.items[2].goal = 'just a string';
  data.items[3].goal = { label: 'x', target: 10, source: 'no-colon' };
  const errors = validate(data);
  assert.ok(errors.some((e) => e.includes('items[0] ("menu-editor").goal.label must be a non-empty string')));
  assert.ok(errors.some((e) => e.includes('goal.target must be a finite number greater than 0')));
  assert.ok(errors.some((e) => e.includes('goal.current must be a finite number of 0 or more')));
  assert.ok(errors.some((e) => e.includes('goal.source for github-stars must look like "owner/name"')));
  assert.ok(errors.some((e) => e.includes('goal.changed must be an ISO 8601')));
  assert.ok(errors.some((e) => e.includes('items[1] ("checkout").goal.current must be a finite number of 0 or more')));
  assert.ok(errors.some((e) => e.includes('goal.source for npm-downloads must be an npm package name')));
  assert.ok(errors.some((e) => e.includes('items[2] ("payment").goal must be an object')));
  assert.ok(errors.some((e) => e.includes('items[3] ("order-queue").goal.source must look like "kind:argument"')));
});

test('rejects goals whose target or source has the wrong type', () => {
  const data = fixture('roadmap-base.json');
  data.items[0].goal = { label: '   ', target: '100' };
  data.items[1].goal = { label: 'Stars', target: 100, source: 42 };
  const errors = validate(data);
  assert.ok(errors.some((e) => e.includes('items[0] ("menu-editor").goal.label must be a non-empty string')));
  assert.ok(errors.some((e) => e.includes('items[0] ("menu-editor").goal.target must be a finite number greater than 0')));
  assert.ok(errors.some((e) => e.includes('items[1] ("checkout").goal.source must look like "kind:argument"')));
});

test('rejects infinite numbers: 1e400 parses as Infinity and would serialize as null', () => {
  const data = fixture('roadmap-base.json');
  data.items[0].goal = JSON.parse('{"label":"x","target":1e400,"current":1e400}');
  const errors = validate(data);
  assert.ok(errors.some((e) => e.includes('items[0] ("menu-editor").goal.target must be a finite number greater than 0')));
  assert.ok(errors.some((e) => e.includes('items[0] ("menu-editor").goal.current must be a finite number of 0 or more')));
});

test('github-stars source: GitHub owner and name rules, no "." or ".." names', () => {
  const data = fixture('roadmap-base.json');
  data.items[0].goal = { label: 'x', target: 10, source: 'github-stars:../..' };
  data.items[1].goal = { label: 'x', target: 10, source: 'github-stars:marvrue/..' };
  data.items[2].goal = { label: 'x', target: 10, source: 'github-stars:-owner/name' };
  data.items[3].goal = { label: 'x', target: 10, source: 'github-stars:owner-/name' };
  const errors = validate(data);
  for (const i of [0, 1, 2, 3]) assert.ok(errors.some((e) => e.includes(`items[${i}]`) && e.includes('must look like "owner/name"')), `items[${i}]`);
  data.items.forEach((it) => { delete it.goal; });
  data.items[0].goal = { label: 'x', target: 10, source: 'github-stars:marv-rue/roadmap.live' };
  data.items[1].goal = { label: 'x', target: 10, source: 'github-stars:marvrue/.hidden' };
  assert.deepStrictEqual(validate(data), []);
});

test('source: rejects whitespace, control characters, uppercase kinds and empty halves', () => {
  const data = fixture('roadmap-base.json');
  data.items[0].goal = { label: 'x', target: 10, source: 'github-stars:owner/name extra' };
  data.items[1].goal = { label: 'x', target: 10, source: 'GitHub-Stars:owner/name' };
  data.items[2].goal = { label: 'x', target: 10, source: ':arg' };
  data.items[3].goal = { label: 'x', target: 10, source: 'kind:' };
  let errors = validate(data);
  for (const i of [0, 1, 2, 3]) assert.ok(errors.some((e) => e.includes(`items[${i}]`) && e.includes('must look like "kind:argument"')), `items[${i}]`);
  data.items[0].goal.source = 'foo:\x1b[31mred';
  data.items[1].goal.source = 'foo:31mred';
  errors = validate(data);
  for (const i of [0, 1]) assert.ok(errors.some((e) => e.includes(`items[${i}]`) && e.includes('must look like "kind:argument"')), `items[${i}]`);
});

test('npm-downloads source: package names up to 214 characters, not longer', () => {
  const data = fixture('roadmap-base.json');
  data.items[0].goal = { label: 'Downloads', target: 500, source: `npm-downloads:${'a'.repeat(214)}` };
  assert.deepStrictEqual(validate(data), []);
  data.items[0].goal.source = `npm-downloads:${'a'.repeat(215)}`;
  assert.ok(validate(data).some((e) => e.includes('items[0] ("menu-editor").goal.source for npm-downloads must be an npm package name')));
});

test('goals live on items, not on milestones', () => {
  const data = fixture('roadmap-base.json');
  data.milestones[0].goal = { label: 'Stars', target: 100 };
  const errors = validate(data);
  assert.ok(errors.some((e) => e.includes('milestones[0].goal is not supported, put goals on items')));
});

test('tagline must be a non-empty string when present', () => {
  const data = fixture('roadmap-base.json');
  data.tagline = 'Pre-order at the bakery around the corner';
  assert.deepStrictEqual(validate(data), []);
  data.tagline = '';
  assert.ok(validate(data).some((e) => e.includes('"tagline" must be a non-empty string')));
  data.tagline = 42;
  assert.ok(validate(data).some((e) => e.includes('"tagline" must be a non-empty string')));
});

test('error messages strip control characters from ids and milestone references', () => {
  const data = fixture('roadmap-base.json');
  data.items[0].id = 'y\x1b[2Kforged\u202e';
  data.items[0].goal = { label: 'Stars', target: 'x' };
  data.items[1].milestone = 'm\x1b[2K9';
  const errors = validate(data);
  assert.ok(errors.some((e) => e === 'items[0] ("y[2Kforged").goal.target must be a finite number greater than 0'));
  assert.ok(errors.some((e) => e.includes('refers to unknown milestone "m[2K9"')));
  assert.ok(!errors.some((e) => /[\x00-\x1f\x7f-\x9f\u202e]/.test(e)));
});

// Warnings

test('warnings: done item under target without a source', () => {
  const data = fixture('roadmap-base.json');
  data.items[0].status = 'done';
  data.items[0].goal = { label: 'Stars', target: 100, current: 40 };
  assert.deepStrictEqual(warnings(data), [{ key: 'goalDoneUnderTarget', item: 'menu-editor', current: 40, target: 100 }]);
});

test('warnings: a done item with current 0 still counts as under target', () => {
  const data = fixture('roadmap-base.json');
  data.items[0].status = 'done';
  data.items[0].goal = { label: 'Stars', target: 10, current: 0 };
  assert.deepStrictEqual(validate(data), []);
  assert.deepStrictEqual(warnings(data), [{ key: 'goalDoneUnderTarget', item: 'menu-editor', current: 0, target: 10 }]);
});

test('warnings: a sourced goal may fall below target after done', () => {
  const data = fixture('roadmap-base.json');
  data.items[0].status = 'done';
  data.items[0].goal = { label: 'Downloads', target: 500, current: 380, source: 'npm-downloads:roadmap-live' };
  assert.deepStrictEqual(warnings(data), []);
});

test('warnings: open item that already reached its goal', () => {
  const data = fixture('roadmap-base.json');
  data.items[1].status = 'todo';
  data.items[1].goal = { label: 'Stars', target: 100, current: 120, source: 'github-stars:marvrue/roadmap-live' };
  assert.deepStrictEqual(warnings(data), [{ key: 'goalReachedButOpen', item: 'checkout', current: 120, target: 100 }]);
});

test('warnings: reaching the target exactly counts, an open item under target does not', () => {
  const data = fixture('roadmap-base.json');
  data.items[0].status = 'active';
  data.items[0].goal = { label: 'Stars', target: 100, current: 99 };
  data.items[1].status = 'todo';
  data.items[1].goal = { label: 'Users', target: 10, current: 10 };
  data.items[2].status = 'done';
  data.items[2].goal = { label: 'Customers', target: 1, current: 1 };
  assert.deepStrictEqual(warnings(data), [{ key: 'goalReachedButOpen', item: 'checkout', current: 10, target: 10 }]);
});

test('warnings: tagline longer than 140 characters', () => {
  const data = fixture('roadmap-base.json');
  data.tagline = 'x'.repeat(141);
  assert.deepStrictEqual(warnings(data), [{ key: 'taglineLong', length: 141 }]);
  data.tagline = 'x'.repeat(140);
  assert.deepStrictEqual(warnings(data), []);
});

test('the tagline note counts code points, not UTF-16 units', () => {
  const data = fixture('roadmap-base.json');
  data.tagline = '😀'.repeat(140);
  assert.deepStrictEqual(warnings(data), []);
  data.tagline = '😀'.repeat(141);
  assert.deepStrictEqual(warnings(data), [{ key: 'taglineLong', length: 141 }]);
});

test('warnings: nothing to say for a goal without current or a clean file', () => {
  const data = fixture('roadmap-base.json');
  assert.deepStrictEqual(warnings(data), []);
  data.items[0].status = 'done';
  data.items[0].goal = { label: 'Stars', target: 100 };
  assert.deepStrictEqual(warnings(data), []);
});

test('warnings: shrugs at shapes validate would reject', () => {
  assert.deepStrictEqual(warnings(null), []);
  assert.deepStrictEqual(warnings('not an object'), []);
  assert.deepStrictEqual(warnings({ tagline: 'x'.repeat(200) }), [{ key: 'taglineLong', length: 200 }]);
  assert.deepStrictEqual(warnings({ tagline: 42, items: 'not an array' }), []);
  const data = fixture('roadmap-base.json');
  data.items.push('not an object', null);
  data.items[0].status = 'done';
  data.items[0].goal = 'just a string';
  data.items[1].status = 'done';
  data.items[1].goal = { label: 'Stars', target: '100', current: 5 };
  assert.deepStrictEqual(warnings(data), []);
});

// --check output

test('--check prints goal and tagline notes after the ok line', () => {
  const data = fixture('roadmap-base.json');
  data.items[0].status = 'done';
  data.items[0].goal = { label: 'Stars', target: 100, current: 40 };
  data.tagline = 'y'.repeat(150);
  const { code, logs } = checkOutput(data, { LANG: 'C' });
  assert.strictEqual(code, 0);
  assert.ok(logs[0].includes(': ok ('));
  assert.ok(logs.some((l) => l.includes('note: "menu-editor" is done but its goal stands at 40/100')));
  assert.ok(logs.some((l) => l.includes('note: the tagline is 150 characters')));
});

test('--check prints the reached-but-open note', () => {
  const data = fixture('roadmap-base.json');
  data.items[1].goal = { label: 'Stars', target: 100, current: 120, source: 'github-stars:marvrue/roadmap-live' };
  const { code, logs } = checkOutput(data, { LANG: 'C' });
  assert.strictEqual(code, 0);
  assert.strictEqual(logs.length, 2);
  assert.ok(logs[1].includes('note: "checkout" reached its goal (120/100) but is still open'));
});

test('--check prints goal and tagline notes in German', () => {
  const data = fixture('roadmap-base.json');
  data.tagline = 'z'.repeat(141);
  data.items[0].status = 'done';
  data.items[0].goal = { label: 'Stars', target: 100, current: 40 };
  data.items[1].goal = { label: 'Users', target: 10, current: 12 };
  const { code, logs } = checkOutput(data, { LANG: 'de_DE.UTF-8' });
  assert.strictEqual(code, 0);
  assert.ok(logs[0].includes(': ok (2 Meilensteine, 4 Items, 1 erledigt, 0 in Arbeit)'));
  assert.ok(logs.some((l) => l.includes('Hinweis: die Tagline hat 141 Zeichen, höchstens 140')));
  assert.ok(logs.some((l) => l.includes('Hinweis: "menu-editor" ist erledigt, aber das Ziel steht bei 40/100')));
  assert.ok(logs.some((l) => l.includes('Hinweis: "checkout" hat sein Ziel erreicht (12/10), ist aber noch offen')));
});

test('--check strips control characters from item ids in notes', () => {
  const data = fixture('roadmap-base.json');
  data.items[0].id = 'menu\x1b[2K\nfake\u202e';
  data.items[0].status = 'done';
  data.items[0].goal = { label: 'Stars', target: 100, current: 40 };
  const { code, logs } = checkOutput(data, { LANG: 'C' });
  assert.strictEqual(code, 0);
  assert.ok(logs.some((l) => l.includes('note: "menu[2Kfake" is done but')));
  assert.ok(!logs.some((l) => /[\x00-\x1f\x7f-\x9f\u202e]/.test(l)));
});

test('--check fails on a malformed goal and prints no notes', () => {
  const data = fixture('roadmap-base.json');
  data.tagline = 'z'.repeat(141);
  data.items[0].goal = { label: 'Stars', target: -5 };
  const { code, logs, errs } = checkOutput(data, { LANG: 'C' });
  assert.strictEqual(code, 1);
  assert.deepStrictEqual(logs, []);
  assert.ok(errs[0].endsWith(': 1 problem'));
  assert.ok(errs.some((l) => l.includes('items[0] ("menu-editor").goal.target must be a finite number greater than 0')));
});
