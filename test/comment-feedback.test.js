'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const view = require('../src/page/view');
const locales = { en: require('../src/locales/en.json'), de: require('../src/locales/de.json') };

function data() {
  return { project: 'Feedback', milestones: [{ id: 'm1', title: 'First' }], items: [{
    id: 'trial', title: 'Try it', milestone: 'm1', status: 'todo',
    question: { text: 'Tried it?', options: ['Not yet', 'Yes'], asked: '2026-09-15T10:00:00Z' },
  }] };
}

// Run the actual bootstrap and renderer; only browser DOM/network boundaries
// are supplied here so response and SSE ordering can be controlled.
function page(roadmap = data()) {
  const handlers = {}, requests = [];
  const app = { innerHTML: '', querySelectorAll: () => [], addEventListener: (name, fn) => { handlers[name] = fn; } };
  const state = { mode: 'live', ok: true, data: roadmap };
  const document = {
    getElementById: (id) => id === 'app' ? app : id === 'roadmap-state' ? { textContent: JSON.stringify(state) } : id === 'roadmap-locales' ? { textContent: JSON.stringify(locales) } : null,
    documentElement: { setAttribute() {}, getAttribute() { return null; }, hasAttribute() { return false; } },
    addEventListener() {}, visibilityState: 'visible', activeElement: null,
  };
  const sandbox = {
    RoadmapView: view, document, location: { search: '?key=test&lang=en', pathname: '/', hash: '' },
    history: { replaceState() {} }, localStorage: { getItem() { return null; }, setItem() {}, removeItem() {} },
    navigator: { language: 'en' }, URLSearchParams, setInterval() {}, setTimeout() {}, clearTimeout() {},
    fetch: (url, init) => new Promise((resolve, reject) => requests.push({ url, init, resolve, reject })),
  };
  sandbox.window = sandbox;
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../src/page/page.js'), 'utf8'), sandbox);
  return { api: sandbox.RoadmapPage, app, requests, handlers, document };
}

function waiting(html) { return html.match(/<section class="waiting">[\s\S]*?<\/section>/)?.[0] || ''; }
function snapshot(p, comments) {
  const state = JSON.parse(JSON.stringify(p.api.getState()));
  state.data.items[0].comments = comments;
  p.api.setState(state);
}
function human(text, at = '2026-09-15T11:00:00Z') { return { from: 'human', text, at }; }

test('answer confirms saving and success beside the question, without waiting for SSE', async () => {
  const p = page();
  const sent = p.api.sendComment('trial', 'Not yet');
  assert.match(waiting(p.app.innerHTML), /data-comment-state="sending"/);
  assert.match(waiting(p.app.innerHTML), /data-action="answer"[^>]*disabled/);
  p.requests[0].resolve({ ok: true, status: 204 });
  assert.equal(await sent, true);
  assert.match(waiting(p.app.innerHTML), /data-comment-state="saved"/);
  assert.match(waiting(p.app.innerHTML), /Saved/);
  assert.match(waiting(p.app.innerHTML), /role="status"/);
});

test('a rapid second submission does not send another request', async () => {
  const p = page();
  const first = p.api.sendComment('trial', 'Not yet');
  const second = p.api.sendComment('trial', 'Not yet');
  assert.equal(p.requests.length, 1);
  p.requests[0].resolve({ ok: true, status: 204 });
  await first; await second;
});

test('a saved answer stays visible after reload and disables that answer option', () => {
  const r = data(); r.items[0].comments = [human('Not yet')];
  const p = page(r);
  assert.match(waiting(p.app.innerHTML), /data-comment-state="saved"/);
  assert.match(waiting(p.app.innerHTML), /data-text="Not yet"[^>]*disabled/);
  assert.doesNotMatch(waiting(p.app.innerHTML), /data-text="Yes"[^>]*disabled/);
});

test('an older comment is not mistaken for an answer to a new question', () => {
  const r = data(); r.items[0].comments = [human('Not yet', '2026-09-15T09:00:00Z')];
  assert.doesNotMatch(waiting(page(r).app.innerHTML), /data-comment-state="saved"/);
});

test('network failure is visible beside the question and can be retried', async () => {
  const p = page();
  const sent = p.api.sendComment('trial', '<unsaved>');
  p.requests[0].reject(new Error('offline'));
  assert.equal(await sent, false);
  assert.match(waiting(p.app.innerHTML), /data-comment-state="failed"/);
  assert.match(waiting(p.app.innerHTML), /&lt;unsaved&gt;/);
  p.api.render();
  assert.match(waiting(p.app.innerHTML), /value="&lt;unsaved&gt;"/);
  assert.doesNotMatch(waiting(p.app.innerHTML), /<unsaved>/);
  const retry = p.api.sendComment('trial', '<unsaved>');
  assert.equal(p.requests.length, 2);
  p.requests[1].resolve({ ok: true, status: 204 });
  assert.equal(await retry, true);
  assert.doesNotMatch(p.app.innerHTML, /data-comment-state="failed"/);
});

test('an expired key keeps the unsaved text visible with an explanation', async () => {
  const p = page();
  const sent = p.api.sendComment('trial', 'Keep this text');
  p.requests[0].resolve({ ok: false, status: 401 });
  assert.equal(await sent, false);
  assert.match(waiting(p.app.innerHTML), /data-comment-state="unauthorized"/);
  assert.match(waiting(p.app.innerHTML), /Keep this text/);
  assert.doesNotMatch(waiting(p.app.innerHTML), /<form/);
});

test('an old identical comment cannot settle a new pending send on an unrelated update', async () => {
  const r = data(); r.items[0].comments = [human('Repeat', '2026-09-15T09:00:00Z')];
  const p = page(r);
  const sent = p.api.sendComment('trial', 'Repeat');
  snapshot(p, r.items[0].comments);
  assert.match(waiting(p.app.innerHTML), /data-comment-state="sending"/);
  assert.equal((p.app.innerHTML.match(/class="text">Repeat<\/span>/g) || []).length, 2);
  p.requests[0].reject(new Error('offline'));
  await sent;
  assert.match(waiting(p.app.innerHTML), /data-comment-state="failed"/);
});

test('SSE before the HTTP response shows the persisted answer only once in the conversation', async () => {
  const p = page();
  const sent = p.api.sendComment('trial', 'Not yet');
  snapshot(p, [human('Not yet')]);
  p.requests[0].resolve({ ok: true, status: 204 });
  await sent;
  assert.match(waiting(p.app.innerHTML), /data-comment-state="saved"/);
  assert.equal((p.app.innerHTML.match(/class="text">Not yet<\/span>/g) || []).length, 1);
});

test('a replacement question does not inherit the previous saved answer', async () => {
  const p = page();
  const sent = p.api.sendComment('trial', 'Not yet');
  p.requests[0].resolve({ ok: true, status: 204 });
  await sent;
  const state = JSON.parse(JSON.stringify(p.api.getState()));
  state.data.items[0].question = { text: 'And today?', options: ['Not yet', 'Yes'], asked: '2026-09-16T10:00:00Z' };
  p.api.setState(state);
  assert.doesNotMatch(waiting(p.app.innerHTML), /data-comment-state="saved"/);
  assert.doesNotMatch(waiting(p.app.innerHTML), /data-text="Not yet"[^>]*disabled/);
});

test('the free-text submit handler restores a failed draft and permits resubmission', async () => {
  const p = page();
  const input = { value: 'My own answer' };
  const form = { getAttribute: () => 'trial', querySelector: () => input };
  p.app.querySelectorAll = (selector) => selector.startsWith('form.comment-form') ? [form] : [];
  const event = { target: { closest: () => form }, preventDefault() {} };
  p.handlers.submit(event);
  assert.equal(input.value, '');
  assert.deepEqual(JSON.parse(p.requests[0].init.body), { id: 'trial', text: 'My own answer' });
  p.requests[0].reject(new Error('offline'));
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(input.value, 'My own answer');
  assert.match(waiting(p.app.innerHTML), /data-comment-state="failed"/);
  p.handlers.submit(event);
  p.requests[1].resolve({ ok: true, status: 204 });
  await new Promise((resolve) => setImmediate(resolve));
  assert.match(waiting(p.app.innerHTML), /data-comment-state="saved"/);
  assert.equal(input.value, '');
});

test('an answer button uses the same confirmed submission path', async () => {
  const p = page();
  const el = { getAttribute: (key) => ({ 'data-action': 'answer', 'data-id': 'trial', 'data-text': 'Yes' })[key] };
  p.handlers.click({ target: { closest: (selector) => selector === '[data-action]' ? el : null } });
  assert.deepEqual(JSON.parse(p.requests[0].init.body), { id: 'trial', text: 'Yes' });
  p.requests[0].resolve({ ok: true, status: 204 });
  await new Promise((resolve) => setImmediate(resolve));
  assert.match(waiting(p.app.innerHTML), /data-comment-state="saved"/);
});

test('a persisted SSE receipt resolves a lost HTTP response as saved', async () => {
  const p = page();
  const sent = p.api.sendComment('trial', 'Not yet');
  snapshot(p, [human('Not yet')]);
  p.requests[0].reject(new Error('connection lost'));
  assert.equal(await sent, true);
  assert.match(waiting(p.app.innerHTML), /data-comment-state="saved"/);
});
