'use strict';

// Absolute times in title attributes follow the local timezone; pin it so the
// snapshots match on every machine.
process.env.TZ = 'UTC';

const { test } = require('node:test');
const assert = require('node:assert');
const path = require('path');
const fs = require('fs');
const { renderPage, staticState, resolveTheme, BUILTIN_THEMES, runRender } = require('../src/render');
const view = require('../src/page/view');
const i18n = require('../src/i18n');
const { fixture, assertSnapshot, tmpDir, FIXTURES } = require('./helpers');

const NOW = Date.parse('2026-09-10T12:00:00Z');
const demoFile = path.join(FIXTURES, 'demo-roadmap.json');

// The rendered body without the embedded state, locales and scripts.
const body = (html) => html.split('<script id="roadmap-state"')[0];

function demoState() {
  const state = staticState(demoFile, fixture('demo-roadmap.json'), { now: NOW });
  state.changelog = ['- 2026-09-08: Listing editor active → done (https://github.com/acme/storefront/pull/42)'];
  return state;
}

for (const theme of BUILTIN_THEMES) {
  for (const mode of ['light', 'dark']) {
    test(`render snapshot: ${theme} ${mode}`, () => {
      const html = renderPage(demoState(), { theme, lang: 'en', mode, live: false, now: NOW });
      assert.ok(html.includes('<title>45 % · storefront</title>'));
      assert.ok(html.includes(`data-mode="${mode}"`));
      assertSnapshot(`demo-${theme}-${mode}.html`, html);
    });
  }
}

test('the template never contains a color or font name', () => {
  const css = fs.readFileSync(path.join(__dirname, '..', 'src', 'page', 'page.css'), 'utf8');
  assert.ok(!/#[0-9a-f]{3,8}\b/i.test(css), 'no hex colors in page.css');
  assert.ok(!/rgba?\(/.test(css), 'no rgb colors in page.css');
  assert.ok(!/Helvetica|Georgia|Menlo|Inter\b/.test(css), 'no font names in page.css');
});

test('every theme defines the required variables for light and dark', () => {
  const required = ['--bg', '--surface', '--text', '--text-2', '--text-3', '--line', '--line-strong', '--attention', '--attention-bg', '--done', '--font-heading', '--font-body', '--font-mono', '--radius', '--measure'];
  for (const name of BUILTIN_THEMES) {
    const css = resolveTheme(name).css;
    for (const v of required) assert.ok(css.includes(`${v}:`), `${name} defines ${v}`);
    assert.ok(css.includes('prefers-color-scheme: dark'));
    assert.ok(css.includes('[data-mode="dark"]'));
  }
});

test('static page is English by default and German with lang de', () => {
  const en = body(renderPage(demoState(), { theme: 'neutral', lang: 'en', live: false, now: NOW }));
  const de = body(renderPage(demoState(), { theme: 'neutral', lang: 'de', live: false, now: NOW }));
  assert.ok(en.includes('Since you last looked') && en.includes('<html lang="en"'));
  assert.ok(de.includes('Seit dem letzten Blick') && de.includes('<html lang="de"') && de.includes('In Arbeit'));
  assert.ok(!de.includes('Since you last looked'));
});

test('feed: stale first, then newest first, max 8, unplanned marked', () => {
  const t = i18n.translator('en');
  const feed = view.computeFeed(fixture('demo-roadmap.json'), NOW, t);
  assert.ok(feed.length <= 8);
  assert.strictEqual(feed[0].kind, 'stale');
  assert.ok(feed[0].text.includes('Order queue for the warehouse screen: no activity for 21 days'));
  assert.ok(feed.some((e) => e.kind === 'unplanned' && e.tag === 'Not on the roadmap' && e.attention));
  assert.ok(feed.some((e) => e.kind === 'point' && e.pr === 44));
  const rest = feed.slice(1);
  for (let i = 1; i < rest.length; i++) assert.ok(Date.parse(rest[i - 1].at) >= Date.parse(rest[i].at));
});

test('stale is computed, not stored', () => {
  const data = fixture('demo-roadmap.json');
  const item = data.items.find((it) => it.id === 'order-queue');
  assert.strictEqual(view.staleDays(item, NOW, 7), 21);
  assert.strictEqual(view.staleDays(data.items.find((it) => it.id === 'listing-editor'), NOW, 7), 0, 'done items are never stale');
  assert.strictEqual(view.staleDays(data.items.find((it) => it.id === 'printer'), NOW, 7), 0, 'todo without PRs is never stale');
  assert.strictEqual(view.staleDays(item, NOW, 30), 0);
});

test('board: blocked in In progress with a label, done collapses to three', () => {
  const html = body(renderPage(demoState(), { theme: 'neutral', lang: 'en', live: false, now: NOW }));
  assert.ok(/<section class="col active"[\s\S]*data-id="payment"[\s\S]*<span class="label attention">blocked<\/span>/.test(html));
  assert.ok(html.includes('and 2 more'));
  assert.ok(html.includes('2 open points'));
  assert.ok(!html.includes('id="history"'), 'static view has no history');
  assert.ok(html.includes('class="changelog"'));
  assert.ok(html.includes('href="https://github.com/acme/storefront/pull/42"'));
});

test('live view keeps the now panel and the history', () => {
  const state = { ...demoState(), mode: 'live', updatedAt: new Date(NOW).toISOString(), changes: [{ at: new Date(NOW).toISOString(), id: 'checkout', title: 'Checkout with reserved copies', from: 'todo', to: 'active' }] };
  const html = renderPage(state, { theme: 'neutral', lang: 'en', live: true, now: NOW });
  assert.ok(body(html).includes('id="history"'));
  assert.ok(body(html).includes('id="now"'));
  assert.ok(html.includes('EventSource'));
  assert.ok(!body(html).includes('class="changelog"'));
});

test('static page has no external requests', () => {
  const html = renderPage(demoState(), { theme: 'paper', lang: 'en', live: false, now: NOW });
  assert.ok(!/<link[^>]+href="http/.test(html));
  assert.ok(!/<script[^>]+src=/.test(html));
  assert.ok(!/url\(http/.test(html));
});

test('runRender writes the file and honours the theme in roadmap.json and roadmap-themes/', () => {
  const dir = tmpDir();
  const file = path.join(dir, 'roadmap.json');
  const data = fixture('demo-roadmap.json');
  data.theme = 'custom';
  fs.writeFileSync(file, JSON.stringify(data));
  fs.mkdirSync(path.join(dir, 'roadmap-themes'));
  fs.writeFileSync(path.join(dir, 'roadmap-themes', 'custom.css'), ':root { --bg: #123456; --text: #000; }');
  const out = path.join(dir, 'site', 'index.html');
  const logs = [];
  const orig = console.log;
  console.log = (l) => logs.push(l);
  try {
    assert.strictEqual(runRender({ file, out, theme: null, mode: null }, { LANG: 'de_DE.UTF-8' }), 0);
  } finally {
    console.log = orig;
  }
  const html = fs.readFileSync(out, 'utf8');
  assert.ok(html.includes('--bg: #123456'));
  assert.ok(html.includes('<html lang="de"'));
  assert.ok(logs[0].includes('custom'));
});

test('waiting block: only with a question, buttons on the live page, hint on the static one', () => {
  const live = body(renderPage({ ...demoState(), mode: 'live' }, { theme: 'neutral', lang: 'en', live: true, now: NOW }));
  assert.ok(live.includes('class="waiting"'));
  assert.ok(live.includes('Hold copies for 15 or 30 minutes?'));
  assert.ok(live.includes('data-action="answer" data-id="checkout" data-text="15"'));
  assert.ok(live.includes('<form class="comment-form" data-id="checkout"'));
  const stat = body(renderPage(demoState(), { theme: 'neutral', lang: 'en', live: false, now: NOW }));
  assert.ok(stat.includes('class="waiting"'));
  assert.ok(stat.includes('Answering works on the live page'));
  assert.ok(!/<input|<textarea|<form/.test(stat), 'static page has no fields');
  assert.ok(!stat.includes('data-action="answer"'), 'static page has no write path');
  const noQuestion = demoState();
  noQuestion.data.items.forEach((it) => { delete it.question; });
  assert.ok(!body(renderPage(noQuestion, { theme: 'neutral', lang: 'en', live: false, now: NOW })).includes('class="waiting"'));
});

test('conversations: count collapsed, thread when expanded, pending marker, done items hidden', () => {
  const state = { ...demoState(), mode: 'live' };
  const collapsed = body(renderPage(state, { theme: 'neutral', lang: 'en', live: true, now: NOW }));
  assert.ok(collapsed.includes('2 comments'));
  assert.ok(collapsed.includes('data-action="expand" data-id="checkout"'));
  assert.ok(!collapsed.includes('Finish the cart first, the checkout can wait'));
  const t = i18n.translator('en');
  const expanded = view.renderApp(state, { t, lang: 'en', now: NOW, filter: null, colorMode: 'system', theme: 'neutral', showAllDone: false, changed: null, expanded: { checkout: true, 'listing-editor': true }, pending: [{ id: 'checkout', text: 'Use 15', at: new Date(NOW).toISOString() }] });
  assert.ok(expanded.includes('Finish the cart first, the checkout can wait'));
  assert.ok(/class="conv"[\s\S]*<li class="agent">[\s\S]*Ok, cart first/.test(expanded));
  assert.ok(/Use 15[\s\S]*?<span class="when">sent<\/span>/.test(expanded));
  assert.ok(!expanded.includes('Images are resized on upload now.'), 'done item conversation is not rendered');
});

test('a failed pending comment shows the attention marker', () => {
  const state = { ...demoState(), mode: 'live' };
  const t = i18n.translator('en');
  const html = view.renderApp(state, { t, lang: 'en', now: NOW, filter: null, colorMode: 'system', theme: 'neutral', showAllDone: false, changed: null, expanded: { checkout: true }, pending: [{ id: 'checkout', text: 'x', at: new Date(NOW).toISOString(), failed: true }] });
  assert.ok(html.includes('class="when attention"'));
  assert.ok(html.includes('not sent, try again'));
});

test('git state in the header and branch in the subline', () => {
  const state = { ...demoState(), mode: 'live', git: { branch: 'feat/checkout', ahead: 3, changed: 2 } };
  const html = body(renderPage(state, { theme: 'neutral', lang: 'en', live: true, now: NOW }));
  assert.ok(html.includes('feat/checkout'));
  assert.ok(html.includes('3 ahead of main'));
  assert.ok(html.includes('2 changed'));
  assert.ok(/<a href="https:\/\/github.com\/acme\/storefront\/pull\/44">PR #44<\/a>[\s\S]{0,80}feat\/checkout/.test(html));
  const clean = body(renderPage({ ...state, git: { branch: 'main', ahead: 0, changed: 0 } }, { theme: 'neutral', lang: 'en', live: true, now: NOW }));
  assert.ok(!clean.includes('ahead of main') && !clean.includes('changed'));
  const stat = body(renderPage({ ...demoState(), git: { branch: 'x', ahead: 1, changed: 1 } }, { theme: 'neutral', lang: 'en', live: false, now: NOW }));
  assert.ok(!stat.includes('ahead of main'), 'static page shows no git state');
});

test('feed has a row per agent comment', () => {
  const t = i18n.translator('en');
  const feed = view.computeFeed(fixture('demo-roadmap.json'), NOW, t);
  const row = feed.find((e) => e.kind === 'comment');
  assert.ok(row);
  assert.strictEqual(row.label, 'agent');
  assert.ok(row.text.startsWith('Checkout with reserved copies: Ok, cart first'));
});
