'use strict';

const { test } = require('node:test');
const assert = require('node:assert');
const { validate } = require('../src/validate');
const { fixture } = require('./helpers');

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
