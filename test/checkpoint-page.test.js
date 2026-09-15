'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { renderPage } = require('../src/render');
const { inspectCheckpoint, checkpointScope, checkpointInput } = require('../src/checkpoint');
const { createStore } = require('../src/store');
const { tmpDir } = require('./helpers');

function data() {
  const r = { project: 'Sample', milestones: [{ id: 'm1', title: 'Deliver', outcome: 'A working example' }], items: [{ id: 'a', title: 'Example', milestone: 'm1', status: 'active', acceptance: [{ id: 'works', text: 'It works' }] }] };
  r.focus = { milestone: 'm1', reason: 'Finish this first', baseline: checkpointScope(r, 'm1') };
  return r;
}
const render = (r, lang = 'en') => renderPage({ mode: 'static', ok: true, data: r }, { lang, now: Date.parse('2026-09-15T12:00:00Z') });
const body = (html) => html.split('<script id="roadmap-state"')[0];

test('static checkpoints show outcome, criteria and evidence in both languages without JavaScript', () => {
  const r = data(); r.items[0].status = 'done';
  const en = body(render(r)); const de = body(render(r, 'de'));
  assert.match(en, /Review needed/); assert.match(en, /evidence missing for/);
  assert.match(de, /Klärung nötig/); assert.match(de, /Nachweis für/);
  assert.match(en, /A working example/); assert.match(en, /0 of 1 criteria/);
  r.items[0].acceptance[0].evidence = 'Verified with an actual order';
  assert.match(body(render(r)), /1 of 1 criteria/);
  assert.match(body(render(r)), /Verified with an actual order/);
  delete r.focus;
  assert.ok(!body(render(r)).includes('id="checkpoint-title"'));
});

test('unsafe outcome, evidence, reason and findings are escaped', () => {
  const r = data(); const unsafe = '<img src=x onerror=alert(1)>';
  r.milestones[0].outcome = unsafe; r.focus.reason = unsafe; r.items[0].title = unsafe;
  r.items[0].acceptance[0].evidence = unsafe; r.items[0].status = 'done';
  const html = body(render(r)); assert.ok(!html.includes(unsafe)); assert.match(html, /&lt;img/);
});

test('a previous successful check is clearly marked stale after an unreviewed completion', () => {
  const r = data();
  r.checkpoint = { event: 'start', item: 'a', result: 'continue', at: '2026-09-15T10:00:00Z', input: checkpointInput(r), findings: [] };
  assert.ok(!body(render(r)).includes('changed since that check'));
  r.items[0].status = 'done';
  const html = body(render(r));
  assert.match(html, /changed since that check/); assert.match(html, /Review needed/);
});

test('browser and Node use exactly the same rules and pre-rendered checkpoint HTML', () => {
  const sandbox = { Intl, Date }; sandbox.self = sandbox; vm.createContext(sandbox);
  for (const file of ['src/checkpoint.js', 'src/page/view.js']) vm.runInContext(fs.readFileSync(path.join(__dirname, '..', file), 'utf8'), sandbox);
  const r = data(); r.items[0].status = 'done';
  assert.deepEqual(JSON.parse(JSON.stringify(sandbox.RoadmapCheckpoint.inspectCheckpoint(r))), inspectCheckpoint(r));
  const dict = JSON.parse(fs.readFileSync(path.join(__dirname, '../src/locales/en.json')));
  const opts = { t: sandbox.RoadmapView.makeT(dict, dict, 'en'), lang: 'en', now: Date.parse('2026-09-15T12:00:00Z'), colorMode: 'system', theme: 'neutral' };
  const browser = sandbox.RoadmapView.renderApp({ mode: 'static', ok: true, data: r }, opts);
  assert.match(browser, /Review needed/); assert.match(browser, /evidence missing for/);
  assert.ok(render(r).indexOf('root.RoadmapCheckpoint = factory()') < render(r).indexOf('root.RoadmapView = factory('));
});

test('file changes automatically cause new checkpoint findings on the live store without writing a report', async () => {
  const r = data(); const file = path.join(tmpDir(), 'roadmap.json'); fs.writeFileSync(file, JSON.stringify(r));
  const store = createStore(file);
  try {
    assert.equal(inspectCheckpoint(store.snapshot().data).result, 'continue');
    const changed = new Promise((resolve, reject) => {
      const timeout = setTimeout(() => { unsubscribe(); reject(new Error('no live update')); }, 7000);
      const unsubscribe = store.subscribe((snapshot) => {
        if (snapshot.data.items[0].status !== 'done') return;
        clearTimeout(timeout); unsubscribe(); resolve(snapshot);
      });
    });
    r.items[0].status = 'done'; fs.writeFileSync(file, JSON.stringify(r));
    const snapshot = await changed;
    assert.ok(inspectCheckpoint(snapshot.data).findings.some((f) => f.code === 'missingEvidence'));
    assert.equal(JSON.parse(fs.readFileSync(file)).checkpoint, undefined);
  } finally { store.stop(); }
});
