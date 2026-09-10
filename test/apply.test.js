'use strict';

const { test } = require('node:test');
const assert = require('node:assert');
const { applyClassification, targetStatus } = require('../src/apply');
const { fixture } = require('./helpers');

const prs = () => Object.fromEntries(fixture('github/pulls.json').map((p) => [p.number, {
  number: p.number, title: p.title, url: p.html_url, state: p.state, merged: !!p.merged_at, merged_at: p.merged_at,
  created_at: p.created_at, updated_at: p.updated_at, review_state: 'none', reviews: [], comments: [],
}]));

test('merged PR above 0.75 sets done and links the PR', () => {
  const roadmap = fixture('roadmap-base.json');
  const changes = applyClassification(roadmap, prs()[42], fixture('classify/pr-42.json'));
  const item = roadmap.items.find((it) => it.id === 'menu-editor');
  assert.strictEqual(item.status, 'done');
  assert.deepStrictEqual(item.prs, [42]);
  assert.strictEqual(item.updated, '2026-09-08T14:02:00Z');
  assert.ok(changes.some((c) => c.kind === 'status' && c.from === 'active' && c.to === 'done' && c.pr === 42));
  assert.strictEqual(item.open_points, undefined, 'a point already resolved on first sight is not recorded');
});

test('merged PR with confidence 0.6 links the PR but leaves the status', () => {
  const roadmap = fixture('roadmap-base.json');
  applyClassification(roadmap, prs()[42], { matches: [{ item_id: 'menu-editor', confidence: 0.6, status_hint: 'done' }], open_points: [], unplanned: [] });
  const item = roadmap.items.find((it) => it.id === 'menu-editor');
  assert.strictEqual(item.status, 'active');
  assert.deepStrictEqual(item.prs, [42]);
});

test('open PR sets active, changes requested sets blocked, approval after that sets active', () => {
  const roadmap = fixture('roadmap-base.json');
  const pr = { ...prs()[43], review_state: 'changes_requested' };
  applyClassification(roadmap, pr, fixture('classify/pr-43.json'));
  const item = roadmap.items.find((it) => it.id === 'payment');
  assert.strictEqual(item.status, 'blocked');
  applyClassification(roadmap, { ...pr, review_state: 'approved' }, fixture('classify/pr-43.json'));
  assert.strictEqual(item.status, 'active');
});

test('an open follow-up PR does not reopen a done item', () => {
  const roadmap = fixture('roadmap-base.json');
  roadmap.items[0].status = 'done';
  applyClassification(roadmap, prs()[44], { matches: [{ item_id: 'menu-editor', confidence: 0.9, status_hint: 'active' }], open_points: [], unplanned: [] });
  assert.strictEqual(roadmap.items[0].status, 'done');
  assert.deepStrictEqual(roadmap.items[0].prs, [44]);
});

test('closed without merge leaves the status alone', () => {
  assert.strictEqual(targetStatus({ status: 'active' }, { state: 'closed', merged: false }, 0.9), null);
  assert.strictEqual(targetStatus({ status: 'todo' }, { state: 'open', merged: false, review_state: 'none' }, 0.5), null);
});

test('open points are added once, keyed by source, and resolved later', () => {
  const roadmap = fixture('roadmap-base.json');
  const pr = prs()[44];
  pr.comments = fixture('github/pr-44-review-comments.json').map((c) => ({ id: c.id, created_at: c.created_at, type: 'review_comment' }));
  const first = applyClassification(roadmap, pr, fixture('classify/pr-44.json'));
  const item = roadmap.items.find((it) => it.id === 'checkout');
  assert.strictEqual(item.status, 'active');
  assert.strictEqual(item.open_points.length, 2);
  assert.strictEqual(item.open_points[0].opened, '2026-09-09T08:30:00Z');
  assert.strictEqual(item.open_points[0].resolved, null);
  assert.strictEqual(first.filter((c) => c.kind === 'open_point').length, 2);

  const again = applyClassification(roadmap, pr, fixture('classify/pr-44.json'));
  assert.deepStrictEqual(again, [], 'applying the same classification twice changes nothing');
  assert.strictEqual(item.open_points.length, 2);

  const resolved = fixture('classify/pr-44.json');
  resolved.open_points[0].resolved = true;
  const third = applyClassification(roadmap, { ...pr, updated_at: '2026-09-10T09:00:00Z' }, resolved);
  assert.strictEqual(item.open_points[0].resolved, '2026-09-10T09:00:00Z');
  assert.strictEqual(item.open_points[1].resolved, null);
  assert.strictEqual(third.filter((c) => c.kind === 'resolved').length, 1);
});

test('unrelated PR goes to unplanned once and leaves it when matched later', () => {
  const roadmap = fixture('roadmap-base.json');
  const pr = prs()[41];
  applyClassification(roadmap, pr, fixture('classify/pr-41.json'));
  applyClassification(roadmap, pr, fixture('classify/pr-41.json'));
  assert.deepStrictEqual(roadmap.unplanned, [{ title: 'Customer loyalty points', prs: [41], first_seen: '2026-09-06T09:00:00Z' }]);
  assert.strictEqual(roadmap.items.length, 4, 'never creates items');

  const changes = applyClassification(roadmap, pr, { matches: [{ item_id: 'order-queue', confidence: 0.8, status_hint: 'active' }], open_points: [], unplanned: [] });
  assert.strictEqual(roadmap.unplanned, undefined);
  assert.ok(changes.some((c) => c.kind === 'unplanned_removed'));
});

test('sync never touches titles, notes, milestones or ids', () => {
  const roadmap = fixture('demo-roadmap.json');
  const before = JSON.parse(JSON.stringify(roadmap));
  for (const n of [41, 42, 43, 44]) applyClassification(roadmap, prs()[n], fixture(`classify/pr-${n}.json`));
  assert.deepStrictEqual(roadmap.milestones, before.milestones);
  roadmap.items.forEach((it, i) => {
    assert.strictEqual(it.id, before.items[i].id);
    assert.strictEqual(it.title, before.items[i].title);
    assert.strictEqual(it.note, before.items[i].note);
    assert.strictEqual(it.milestone, before.items[i].milestone);
  });
});
