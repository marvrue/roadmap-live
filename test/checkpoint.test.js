'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const { inspectCheckpoint, checkpointScope, checkpointInput, checkpointCurrent } = require('../src/checkpoint');
const { validate } = require('../src/validate');

function roadmap() {
  const data = {
    project: 'Example',
    milestones: [{ id: 'earlier', title: 'Earlier' }, { id: 'delivery', title: 'Delivery', outcome: 'One working order', limit: 3 }],
    items: [
      { id: 'old', title: 'Old', milestone: 'earlier', status: 'todo' },
      { id: 'order', title: 'Place order', milestone: 'delivery', status: 'todo', acceptance: [{ id: 'saved', text: 'Order is saved' }] },
    ],
  };
  data.focus = { milestone: 'delivery', reason: 'Finish the order first', baseline: checkpointScope(data, 'delivery') };
  return data;
}
const codes = (r) => r.findings.map((f) => f.code);

test('legacy roadmaps stay valid and only explicit lifecycle checks require a focus', () => {
  const data = roadmap(); delete data.focus;
  assert.deepEqual(validate(data), []);
  assert.equal(inspectCheckpoint(data).result, 'disabled');
  assert.deepEqual(codes(inspectCheckpoint(data, { event: 'start', item: 'order' })), ['focusRequired']);
});

test('an explicit focus does not reorder milestones and allows starting a scoped task', () => {
  const data = roadmap();
  assert.equal(inspectCheckpoint(data, { event: 'start', item: 'order' }).result, 'continue');
  assert.equal(data.milestones[0].id, 'earlier');
  assert.ok(codes(inspectCheckpoint(data, { event: 'start', item: 'old' })).includes('wrongMilestone'));
  assert.ok(codes(inspectCheckpoint(data, { event: 'start', item: 'absent' })).includes('unknownItem'));
});

test('completion requires criteria and their evidence, including when an agent directly writes done', () => {
  const data = roadmap(); const item = data.items[1]; item.status = 'active';
  assert.ok(codes(inspectCheckpoint(data, { event: 'complete', item: item.id })).includes('missingEvidence'));
  item.status = 'done';
  assert.ok(codes(inspectCheckpoint(data)).includes('missingEvidence'));
  item.acceptance[0].evidence = 'test/order.test.js: saves an order, passed';
  assert.equal(inspectCheckpoint(data, { event: 'milestone' }).result, 'continue');
  item.acceptance = [];
  assert.ok(codes(inspectCheckpoint(data)).includes('missingCriteria'));
});

test('a new task cannot be started while another is active, and milestone closure requires every task', () => {
  const data = roadmap(); data.items[0].status = 'active';
  assert.ok(codes(inspectCheckpoint(data, { event: 'start', item: 'order' })).includes('finishCurrent'));
  assert.ok(codes(inspectCheckpoint(data)).includes('wrongMilestone'));
  assert.ok(codes(inspectCheckpoint(data, { event: 'milestone' })).includes('unfinishedItem'));
});

test('scope baseline catches additions, removals, title, outcome and criterion changes but ignores evidence and progress', () => {
  for (const mutate of [
    (d) => d.items.push({ id: 'extra', title: 'Extra', status: 'todo', milestone: 'delivery' }),
    (d) => d.items.pop(),
    (d) => { d.items[1].title = 'Different'; },
    (d) => { d.items[1].acceptance[0].text = 'A weaker test'; },
    (d) => { d.milestones[1].outcome = 'Something else'; },
    (d) => { d.items[1].goal = { label: 'Orders', target: 10 }; },
  ]) {
    const d = roadmap(); mutate(d);
    assert.ok(codes(inspectCheckpoint(d, { event: 'scope' })).includes('scopeChanged'));
  }
  const data = roadmap(); data.items.reverse(); data.items[0].status = 'active';
  data.items[0].acceptance[0].evidence = 'Observed'; data.items[0].updated = '2026-09-15T10:00:00Z';
  assert.ok(!codes(inspectCheckpoint(data)).includes('scopeChanged'));
});

test('questions, reviewer requests and unmeasured or unmet goals prevent completion', () => {
  const data = roadmap(); const item = data.items[1]; item.status = 'active'; item.acceptance[0].evidence = 'Passed';
  item.question = { text: 'Which?', asked: '2026-09-15T10:00:00Z' };
  item.open_points = [{ text: 'Fix the test', source: 'pr:1', opened: '2026-09-15T10:00:00Z', resolved: null }];
  item.goal = { label: 'Uses', target: 5 };
  data.focus.baseline = checkpointScope(data, data.focus.milestone);
  const found = codes(inspectCheckpoint(data, { event: 'complete', item: 'order' }));
  for (const code of ['openQuestion', 'reviewPoints', 'goalPending']) assert.ok(found.includes(code));
  delete item.question; item.open_points[0].resolved = '2026-09-15T11:00:00Z'; item.goal.current = 5;
  assert.equal(inspectCheckpoint(data, { event: 'complete', item: 'order' }).result, 'continue');
});

test('saved results expire on relevant edits but not on their own write, timestamps or unrelated items', () => {
  const data = roadmap();
  data.checkpoint = { at: '2026-09-15T10:00:00Z', event: 'start', item: 'order', result: 'continue', input: checkpointInput(data) };
  assert.equal(checkpointCurrent(data), true);
  data.items[1].updated = '2026-09-15T11:00:00Z'; data.items[0].note = 'Unrelated';
  assert.equal(checkpointCurrent(data), true);
  data.items[1].status = 'active';
  assert.equal(checkpointCurrent(data), false);
});

test('invalid focus, limits, criteria and checkpoints are schema errors, missing evidence is a review finding', () => {
  for (const mutate of [
    (d) => { d.focus.milestone = 'missing'; },
    (d) => { d.focus.reason = ''; },
    (d) => { d.focus.baseline = null; },
    (d) => { d.milestones[1].limit = -1; },
    (d) => { d.items[1].acceptance.push({ id: 'saved', text: 'duplicate' }); },
    (d) => { d.items[1].acceptance[0].evidence = 12; },
    (d) => { d.checkpoint = { at: 'bad', event: 'unknown' }; },
  ]) {
    const d = roadmap(); mutate(d); assert.ok(validate(d).length > 0);
  }
  assert.deepEqual(validate(roadmap()), []);
});

module.exports = { roadmap };
