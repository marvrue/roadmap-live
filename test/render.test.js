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
  state.changelog = ['- 2026-09-08: Menu editor active → done (https://github.com/acme/abholbereit/pull/42)'];
  return state;
}

for (const theme of BUILTIN_THEMES) {
  for (const mode of ['light', 'dark']) {
    test(`render snapshot: ${theme} ${mode}`, () => {
      const html = renderPage(demoState(), { theme, lang: 'en', mode, live: false, now: NOW });
      assert.ok(html.includes('<title>45 % · abholbereit</title>'));
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

test('every built-in theme is embedded, the chosen one active, custom themes added', () => {
  const html = renderPage(demoState(), { theme: 'paper', lang: 'en', live: false, now: NOW });
  assert.ok(html.includes('<style data-theme="paper" media="all">'));
  assert.ok(html.includes('<style data-theme="neutral" media="not all">'));
  assert.ok(html.includes('<style data-theme="mono" media="not all">'));
  assert.ok(html.includes('data-action="theme-name"'));
  assert.ok(body(html).includes('>paper</button>'));
  const dir = tmpDir();
  fs.mkdirSync(path.join(dir, 'roadmap-themes'));
  fs.writeFileSync(path.join(dir, 'roadmap-themes', 'custom.css'), ':root { --bg: #123456; }');
  const custom = renderPage(demoState(), { theme: 'custom', baseDir: dir, lang: 'en', live: false, now: NOW });
  assert.ok(custom.includes('<style data-theme="custom" media="all">'));
  assert.ok(custom.includes('<style data-theme="neutral" media="not all">'));
  assert.ok(custom.includes('"themes":["custom","neutral","paper","mono"]'));
});

test('static page is English by default and German with lang de', () => {
  const en = body(renderPage(demoState(), { theme: 'neutral', lang: 'en', live: false, now: NOW }));
  const de = body(renderPage(demoState(), { theme: 'neutral', lang: 'de', live: false, now: NOW }));
  assert.ok(en.includes('Since you last looked') && en.includes('<html lang="en"'));
  assert.ok(de.includes('Seit dem letzten Blick') && de.includes('<html lang="de"') && de.includes('in Arbeit'));
  assert.ok(!de.includes('Since you last looked'));
});

test('feed: stale first, then newest first, max 8, unplanned marked', () => {
  const t = i18n.translator('en');
  const data = fixture('demo-roadmap.json');
  // Without goals the fixture has exactly eight rows; the goal row is covered below
  // and would push the oldest (the unplanned entry) out of the cap.
  data.items.forEach((it) => { delete it.goal; });
  const feed = view.computeFeed(data, NOW, t);
  assert.ok(feed.length <= 8);
  assert.strictEqual(feed[0].kind, 'stale');
  assert.ok(feed[0].text.includes('Order queue for the kitchen screen: no activity for 21 days'));
  assert.ok(feed.some((e) => e.kind === 'unplanned' && e.tag === 'Not on the roadmap' && e.attention));
  assert.ok(feed.some((e) => e.kind === 'point' && e.pr === 44));
  const rest = feed.slice(1);
  for (let i = 1; i < rest.length; i++) assert.ok(Date.parse(rest[i - 1].at) >= Date.parse(rest[i].at));
});

test('stale is computed, not stored', () => {
  const data = fixture('demo-roadmap.json');
  const item = data.items.find((it) => it.id === 'order-queue');
  assert.strictEqual(view.staleDays(item, NOW, 7), 21);
  assert.strictEqual(view.staleDays(data.items.find((it) => it.id === 'menu-editor'), NOW, 7), 0, 'done items are never stale');
  assert.strictEqual(view.staleDays(data.items.find((it) => it.id === 'printer'), NOW, 7), 0, 'todo without PRs is never stale');
  assert.strictEqual(view.staleDays(item, NOW, 30), 0);
});

test('board: blocked in In progress with a label, done collapses to three', () => {
  const html = body(renderPage(demoState(), { theme: 'neutral', lang: 'en', live: false, now: NOW, view: 'board' }));
  assert.ok(/<section class="col active"[\s\S]*data-id="payment"[\s\S]*<span class="label attention">blocked<\/span>/.test(html));
  assert.ok(html.includes('and 2 more'));
  assert.ok(html.includes('2 open points'));
  assert.ok(!html.includes('id="history"'), 'static view has no history');
  assert.ok(html.includes('class="changelog"'));
  assert.ok(html.includes('href="https://github.com/acme/abholbereit/pull/42"'));
});

test('live view keeps the now panel and the history', () => {
  const state = { ...demoState(), mode: 'live', updatedAt: new Date(NOW).toISOString(), changes: [{ at: new Date(NOW).toISOString(), id: 'checkout', title: 'Checkout with pickup time', from: 'todo', to: 'active' }] };
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
  const live = body(renderPage({ ...demoState(), mode: 'live' }, { theme: 'neutral', lang: 'en', live: true, now: NOW, canWrite: true }));
  assert.ok(live.includes('class="waiting"'));
  assert.ok(live.includes('Pickup time in 15 or 30 minute steps?'));
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
  const expanded = view.renderApp(state, { t, lang: 'en', now: NOW, filter: null, colorMode: 'system', theme: 'neutral', showAllDone: false, changed: null, expanded: { checkout: true, 'menu-editor': true }, pending: [{ id: 'checkout', text: 'Use 15', at: new Date(NOW).toISOString() }] });
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
  assert.ok(/<a href="https:\/\/github.com\/acme\/abholbereit\/pull\/44">PR #44<\/a>[\s\S]{0,80}feat\/checkout/.test(html));
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
  assert.ok(row.text.startsWith('Checkout with pickup time: Ok, cart first'));
});

test('share button: live page only with a link or with Pages off, static page always', () => {
  const live = (extra) => body(renderPage({ ...demoState(), mode: 'live', ...extra }, { theme: 'neutral', lang: 'en', live: true, now: NOW }));
  assert.ok(!live({ pages: null, shareUrl: null }).includes('data-action="share"'));
  assert.ok(live({ pages: { enabled: false }, shareUrl: null }).includes('data-action="share"'));
  assert.ok(live({ pages: { enabled: true, url: 'https://x/' }, shareUrl: 'https://x/' }).includes('data-action="share"'));
  assert.ok(body(renderPage(demoState(), { theme: 'neutral', lang: 'en', live: false, now: NOW })).includes('data-action="share"'));
  const t = i18n.translator('en');
  const off = view.renderApp({ ...demoState(), mode: 'live', pages: { enabled: false } }, { t, lang: 'en', now: NOW, filter: null, colorMode: 'system', showAllDone: false, changed: null, share: { note: 'off' } });
  assert.ok(off.includes('data-action="enable-pages"') && off.includes('The public page is off.'));
});

const BASE_OPTS = () => ({ t: i18n.translator('en'), lang: 'en', now: NOW, filter: null, colorMode: 'system', showAllDone: false, changed: null });
// The <main> block of one view, without the constant blocks around it.
const mainOf = (html, cls) => html.match(new RegExp('<main class="' + cls + '">[\\s\\S]*?</main>'))[0];

test('views: milestones is the default, board via opts, the row above the content links every view', () => {
  const base = BASE_OPTS();
  const ms = view.renderApp(demoState(), base);
  assert.ok(ms.includes('<main class="milestones">'));
  assert.ok(!ms.includes('<main class="board">'));
  assert.ok(ms.includes('<nav class="views" aria-label="Switch the view">'));
  assert.ok(ms.includes('<a href="?view=milestones" data-action="view" data-view="milestones" aria-current="page">Milestones</a>'));
  assert.ok(ms.includes('<a href="?view=board" data-action="view" data-view="board">Board</a>'));
  assert.ok(!ms.includes('<button type="button" class="theme" data-action="view"'), 'the header button is gone');
  assert.ok(/<section class="ms is-current" data-milestone="m1">[\s\S]*?<h2>Ordering flow<\/h2>/.test(ms));
  assert.ok(/<section class="ms" data-milestone="m3">/.test(ms), 'Launch has one open item, so it is neither current nor done');
  assert.ok(/<details class="ms-done fold" data-key="ms:m3" data-milestone="m3">[\s\S]*?<summary>4 done<\/summary>/.test(ms));
  assert.ok(view.renderApp(demoState(), { ...base, open: { 'ms:m3': true } }).includes('data-milestone="m3" open>'));
  assert.ok(/<span class="label status attention">blocked<\/span><span>Card payment with Stripe<\/span>/.test(ms));
  assert.ok(/<span class="label status">in progress<\/span><span>Checkout with pickup time<\/span>/.test(ms));
  const board = view.renderApp(demoState(), { ...base, view: 'board' });
  assert.ok(board.includes('<main class="board">') && board.includes('data-view="board" aria-current="page">Board</a>'));
  assert.ok(!board.includes('class="label status'), 'board keeps its columns without status labels');
  const filtered = view.renderApp(demoState(), { ...base, filter: 'm2' });
  assert.ok(filtered.includes('data-milestone="m2"') && !filtered.includes('data-milestone="m1"'));
  const stat = body(renderPage(demoState(), { theme: 'neutral', lang: 'en', live: false, now: NOW }));
  assert.ok(stat.includes('<main class="milestones">') && stat.includes('<nav class="views"'));
  const order = [...ms.matchAll(/data-view="([a-z]+)"/g)].map((m) => m[1]);
  assert.deepStrictEqual(order, ['milestones', 'board', 'focus', 'timeline', 'conversations', 'points', 'prs', 'signals', 'list']);
});

test('views that need synced data stay out of the row until the roadmap has it', () => {
  const plain = demoState();
  plain.data.items.forEach((it) => { delete it.prs; delete it.open_points; });
  delete plain.data.unplanned;
  assert.deepStrictEqual(view.availableViews(plain.data), ['milestones', 'board', 'focus', 'timeline', 'conversations', 'signals', 'list']);
  const html = view.renderApp(plain, { ...BASE_OPTS(), view: 'prs' });
  assert.ok(!html.includes('data-view="prs"') && !html.includes('data-view="points"'));
  assert.ok(html.includes('<main class="milestones">'), 'an unavailable view falls back to the first');
  assert.strictEqual(view.resolveView(demoState().data, 'nope'), 'milestones');
});

test('focus: active items at full size, blocked after them, now block folded in', () => {
  const live = { ...demoState(), mode: 'live' };
  const html = view.renderApp(live, { ...BASE_OPTS(), view: 'focus', canWrite: true });
  assert.ok(html.includes('<main class="focus">'));
  assert.ok(!html.includes('id="now"') && !html.includes('id="history"'), 'the now block is the view itself');
  const ids = mainOf(html, 'focus').match(/<article class="item" data-id="([a-z-]+)"/g);
  assert.deepStrictEqual(ids, ['<article class="item" data-id="checkout"', '<article class="item" data-id="order-queue"', '<article class="item" data-id="payment"']);
  assert.ok(/<h2 class="title">Checkout with pickup time<\/h2><div class="elapsed" data-since="2026-09-09T09:00:00Z">/.test(html));
  assert.ok(/<h2 class="title">Card payment with Stripe<\/h2><span class="label attention state">blocked<\/span>/.test(html));
  assert.ok(html.includes('href="https://github.com/acme/abholbereit/pull/44#discussion_r2001"'), 'open points link to the review comment');
  assert.ok(html.includes('Pickup time in 15 or 30 minute steps?') && html.includes('data-action="answer" data-id="checkout" data-text="15"'));
  const focusMain = mainOf(html, 'focus');
  assert.strictEqual((focusMain.match(/<form class="comment-form" data-id="checkout"/g) || []).length, 1, 'question and thread share one field');
  assert.ok(html.includes('Finish the cart first, the checkout can wait'), 'the thread is open');
  const idle = demoState();
  idle.data.items.forEach((it) => { if (it.status === 'active' || it.status === 'blocked') it.status = 'todo'; });
  const none = view.renderApp(idle, { ...BASE_OPTS(), view: 'focus' });
  assert.ok(none.includes('Nothing in progress right now.') && none.includes('<b>Checkout with pickup time</b>'));
});

test('timeline: newest first, grouped by day, every kind of event, capped at 40', () => {
  const rows = view.computeTimeline(demoState(), BASE_OPTS());
  for (let i = 1; i < rows.length; i++) assert.ok(Date.parse(rows[i - 1].at) >= Date.parse(rows[i].at));
  const kinds = new Set(rows.map((r) => r.kind));
  for (const k of ['status', 'point', 'resolved', 'comment', 'question', 'unplanned', 'sync']) assert.ok(kinds.has(k), `has ${k}`);
  const html = view.renderApp(demoState(), { ...BASE_OPTS(), view: 'timeline' });
  assert.ok(html.includes('<main class="timeline">'));
  assert.ok(html.includes('<section class="day"><h2>yesterday</h2>'), 'Sep 9 is yesterday for NOW');
  assert.ok(/<li data-kind="resolved" class="is-quiet">[\s\S]*?<span class="tag quiet">resolved<\/span>/.test(html));
  assert.ok(/<li data-kind="question">[\s\S]*?<span class="label attention">question<\/span>/.test(html));
  assert.ok(!html.includes('data-action="more-timeline"'));
  const big = demoState();
  for (let i = 0; i < 50; i++) big.data.items.push({ id: `x${i}`, title: `Item ${i}`, milestone: 'm1', status: 'done', updated: `2026-08-${String(1 + (i % 28)).padStart(2, '0')}T10:00:00Z` });
  const capped = view.renderApp(big, { ...BASE_OPTS(), view: 'timeline' });
  assert.strictEqual((capped.match(/<li data-kind=/g) || []).length, 40 + 4, '40 timeline rows plus the 4 feed rows');
  assert.ok(capped.includes('data-action="more-timeline"'));
  assert.ok((view.renderApp(big, { ...BASE_OPTS(), view: 'timeline', showAllTimeline: true }).match(/<li data-kind=/g) || []).length > 44);
});

test('conversations: questions first, unanswered threads marked, waiting block folded in, others foldable with the key', () => {
  const live = { ...demoState(), mode: 'live' };
  const html = view.renderApp(live, { ...BASE_OPTS(), view: 'conversations', canWrite: true });
  assert.ok(html.includes('<main class="conversations">'));
  assert.ok(!html.includes('class="waiting"'), 'questions live in the threads here');
  const main = mainOf(html, 'conversations');
  const ids = main.split('<details')[0].match(/<article class="item" data-id="([a-z-]+)"/g);
  assert.deepStrictEqual(ids, ['<article class="item" data-id="checkout"', '<article class="item" data-id="order-queue"']);
  assert.ok(/data-id="order-queue"[\s\S]*?<span class="label">unanswered<\/span>/.test(main));
  assert.ok(main.includes('Pickup time in 15 or 30 minute steps?'));
  assert.ok(main.includes('<details class="fold" data-key="conv:others"><summary>4 items without a conversation</summary>'));
  const stat = view.renderApp(demoState(), { ...BASE_OPTS(), view: 'conversations' });
  assert.ok(!stat.includes('data-key="conv:others"') && !/<input|<form/.test(stat));
});

test('open points: grouped by item, open first, resolved folded, linked to the comment', () => {
  const html = view.renderApp(demoState(), { ...BASE_OPTS(), view: 'points' });
  const main = mainOf(html, 'points');
  const ids = main.match(/<section class="group[^"]*" data-id="([a-z-]+)"/g);
  assert.deepStrictEqual(ids, ['<section class="group" data-id="checkout"', '<section class="group is-done" data-id="menu-editor"']);
  assert.ok(main.includes('<span class="meta">2 open</span>'));
  assert.ok(main.includes('<details class="fold" data-key="pt:menu-editor"><summary>1 resolved</summary>'));
  assert.ok(main.includes('href="https://github.com/acme/abholbereit/pull/42#issuecomment-1893"'));
  assert.ok(!main.includes('class="empty"'));
});

test('pull requests: newest first with items, review points and unplanned work', () => {
  const html = view.renderApp(demoState(), { ...BASE_OPTS(), view: 'prs' });
  const main = mainOf(html, 'prs');
  const nums = main.match(/data-pr="(\d+)"/g);
  assert.deepStrictEqual(nums, ['data-pr="44"', 'data-pr="43"', 'data-pr="42"', 'data-pr="41"']);
  assert.ok(/data-pr="43">[\s\S]*?<span class="label attention">blocked<\/span><span class="text">Card payment with Stripe<\/span>/.test(main));
  assert.ok(/data-pr="41">[\s\S]*?<span class="label attention">Unplanned<\/span><span class="text">Customer loyalty points<span class="tag">Not on the roadmap<\/span><\/span>/.test(main));
  assert.ok(/data-pr="44">[\s\S]*?<span class="label">review<\/span><span class="text">Checkout with pickup time: Please debounce/.test(main));
  assert.ok(main.includes('data-key="pr:42"'));
});

test('signals: only questions, blocked, stale and unplanned; calm sentence when there is nothing', () => {
  const html = view.renderApp(demoState(), { ...BASE_OPTS(), view: 'signals' });
  const main = mainOf(html, 'signals');
  assert.deepStrictEqual(main.match(/data-kind="([a-z]+)"/g), ['data-kind="questions"', 'data-kind="blocked"', 'data-kind="stale"', 'data-kind="unplanned"']);
  assert.ok(main.includes('<h2 class="section attention">Gone quiet</h2>'));
  assert.ok(!html.includes('class="unplanned"'), 'unplanned block below is folded into the view');
  const calm = demoState();
  calm.data.items.forEach((it) => { delete it.question; if (it.status === 'blocked') it.status = 'todo'; if (it.id === 'order-queue') it.updated = '2026-09-10T10:00:00Z'; });
  delete calm.data.unplanned;
  const quiet = view.renderApp(calm, { ...BASE_OPTS(), view: 'signals' });
  assert.ok(quiet.includes('<p class="big">Nothing needs you.</p>'));
  assert.ok(quiet.includes('2 in progress, 4 open, 5 done.'));
});

test('list: one table row per item, default order by milestone then status, headers sort', () => {
  const html = view.renderApp(demoState(), { ...BASE_OPTS(), view: 'list' });
  const main = mainOf(html, 'list-view');
  const ids = main.match(/<tr data-id="([a-z-]+)"/g).map((m) => m.slice(13, -1));
  assert.deepStrictEqual(ids.slice(0, 3), ['payment', 'checkout', 'menu-editor']);
  assert.ok(main.includes('<td class="c-status mono attention">blocked</td>'));
  assert.ok(main.includes('<tr data-id="menu-editor" class="is-done">'));
  assert.ok(main.includes('<button type="button" data-action="sort" data-key="updated" data-dir="desc" title="Sort by Updated">Updated</button>'));
  assert.ok(main.includes('data-key="title" data-dir="asc"'), 'text columns start ascending');
  const sorted = view.renderApp(demoState(), { ...BASE_OPTS(), view: 'list', sort: { key: 'title', dir: 'asc' } });
  const byTitle = sorted.match(/<tr data-id="([a-z-]+)"/g).map((m) => m.slice(13, -1));
  assert.deepStrictEqual(byTitle.slice(0, 2), ['app-store', 'analytics']);
  assert.ok(sorted.includes('<th class="c-title" aria-sort="ascending">'));
  const desc = view.renderApp(demoState(), { ...BASE_OPTS(), view: 'list', sort: { key: 'updated', dir: 'desc' } });
  assert.strictEqual(desc.match(/<tr data-id="([a-z-]+)"/g)[0], '<tr data-id="checkout"');
});

test('every view renders in German and on the static page without fields', () => {
  for (const v of view.VIEWS) {
    const de = body(renderPage(demoState(), { theme: 'paper', lang: 'de', live: false, now: NOW, view: v }));
    assert.ok(de.includes('<nav class="views"'), v);
    assert.ok(!/<input|<textarea|<form/.test(de), `${v} static page has no fields`);
    assert.ok(!de.includes('page.'), `${v} has no untranslated key`);
  }
});

// Goals on the page

test('formatCount: plain integers below 10,000, compact and language-independent above', () => {
  assert.strictEqual(view.formatCount(0), '0');
  assert.strictEqual(view.formatCount(9999), '9999');
  assert.strictEqual(view.formatCount(10000), '10k');
  assert.strictEqual(view.formatCount(12345), '12.3k');
  assert.strictEqual(view.formatCount(99950), '100k');
  assert.strictEqual(view.formatCount(1500000), '1.5M');
  assert.strictEqual(view.formatCount(2000000000), '2B');
  assert.strictEqual(view.formatCount(3.7), '4');
});

test('goalText: current/target, an en dash when nothing was measured', () => {
  assert.strictEqual(view.goalText({ label: 'Stars', target: 100, current: 34 }), '34/100');
  assert.strictEqual(view.goalText({ label: 'Stars', target: 100, current: 120 }), '120/100');
  assert.strictEqual(view.goalText({ label: 'Stars', target: 100 }), '–/100');
  assert.strictEqual(view.goalText({ label: 'Downloads', target: 100000, current: 12345 }), '12.3k/100k');
});

test('milestones view: a goal replaces the status word for open and done items, not for active ones', () => {
  const t = i18n.translator('en');
  const base = { t, lang: 'en', now: NOW, filter: null, colorMode: 'system', showAllDone: false, changed: null };
  const ms = view.renderApp(demoState(), base);
  // todo item with a goal: the goal is the label, the status word is gone
  assert.ok(/<span class="label status goal">34\/100<\/span><span>App store listing<\/span>/.test(ms));
  // active item with a goal keeps "in progress" and shows the goal in the subline
  assert.ok(/<span class="label status">in progress<\/span><span>Checkout with pickup time<\/span>/.test(ms));
  assert.ok(/data-id="checkout"[\s\S]*?<div class="sub">[\s\S]*?<span class="goal">7\/20 Test orders<\/span>/.test(ms));
  // done item whose goal was reached: label shows the numbers, the subline goal is dimmed
  assert.ok(/<span class="label status goal">240\/200<\/span><span>Basic analytics<\/span>/.test(ms));
  assert.ok(/data-id="analytics"[\s\S]*?<span class="goal reached">240\/200 Monthly orders<\/span>/.test(ms));
  // an unmeasured goal shows the dash with a title
  const state = demoState();
  state.data.items.find((it) => it.id === 'printer').goal = { label: 'Printers sold', target: 5 };
  const dash = view.renderApp(state, base);
  assert.ok(/<span class="label status goal" title="not measured yet">–\/5<\/span><span>Receipt printer support<\/span>/.test(dash));
});

test('board: the goal sits in the subline, never in the title', () => {
  const t = i18n.translator('en');
  const board = view.renderApp(demoState(), { t, lang: 'en', now: NOW, filter: null, colorMode: 'system', showAllDone: false, changed: null, view: 'board' });
  assert.ok(!board.includes('class="label status'));
  assert.ok(/data-id="app-store"[\s\S]*?<span class="goal">34\/100 GitHub stars<\/span>/.test(board));
});

test('feed: at most one goal row, the latest change, competing like every other row', () => {
  const t = i18n.translator('en');
  const feed = view.computeFeed(fixture('demo-roadmap.json'), NOW, t);
  const goals = feed.filter((e) => e.kind === 'goal');
  assert.strictEqual(goals.length, 1);
  assert.strictEqual(goals[0].label, '34/100');
  assert.strictEqual(goals[0].text, 'App store listing: GitHub stars');
  assert.strictEqual(goals[0].at, '2026-09-09T06:00:00Z');
  assert.ok(!goals[0].attention, 'a moving number is not an attention signal');
  const html = view.renderApp(demoState(), { t, lang: 'en', now: NOW, filter: null, colorMode: 'system', showAllDone: false, changed: null, showAllFeed: true });
  assert.ok(/<li data-kind="goal"><span class="label">34\/100<\/span><span class="text">App store listing: GitHub stars<\/span>/.test(html));
  const short = body(renderPage(demoState(), { theme: 'neutral', lang: 'en', live: false, now: NOW }));
  assert.ok(!short.includes('data-kind="goal"'), 'the goal row is the sixth newest, so the four-row feed does not show it');
});

test('a goal change is not activity: stale detection and the header time ignore it', () => {
  const data = fixture('demo-roadmap.json');
  const item = data.items.find((it) => it.id === 'order-queue');
  item.goal = { label: 'Orders', target: 10, current: 3, changed: '2026-09-10T11:00:00Z' };
  assert.strictEqual(view.staleDays(item, NOW, 7), 21);
  const t = i18n.translator('en');
  const html = view.renderApp({ ...demoState(), data }, { t, lang: 'en', now: NOW, filter: null, colorMode: 'system', showAllDone: false, changed: null });
  assert.ok(/<span>updated <time[^>]*datetime="2026-09-09T10:00:00.000Z"/.test(html));
});

test('current milestone: the first that is not complete, an empty one counts as not started', () => {
  const data = fixture('roadmap-base.json');
  data.milestones.unshift({ id: 'm0', title: 'Empty first' });
  const info = view.milestoneStats(data);
  assert.strictEqual(info.current.m.id, 'm0');
  assert.strictEqual(info.stats[0].total, 0);
  assert.strictEqual(info.stats[0].complete, false);
  const t = i18n.translator('en');
  const html = view.renderApp({ ...demoState(), data }, { t, lang: 'en', now: NOW, filter: null, colorMode: 'system', showAllDone: false, changed: null });
  assert.ok(/<section class="ms is-current" data-milestone="m0">/.test(html));
  assert.ok(html.includes('class="seg is-current"'));
});

test('tagline: under the project name when set, no element without it', () => {
  const html = body(renderPage(demoState(), { theme: 'neutral', lang: 'en', live: false, now: NOW }));
  assert.ok(/<header class="top"><div class="brand"><h1>abholbereit<\/h1><p class="tagline">Pre-order at the bakery around the corner, pick up without waiting.<\/p><\/div><div class="meta">/.test(html));
  const none = demoState();
  delete none.data.tagline;
  const plain = body(renderPage(none, { theme: 'neutral', lang: 'en', live: false, now: NOW }));
  assert.ok(plain.includes('<div class="brand"><h1>abholbereit</h1></div>'));
  assert.ok(!plain.includes('class="tagline"'));
});

test('formatCount: rounding that lands on 1000 of a unit moves up a unit, T is the top', () => {
  assert.strictEqual(view.formatCount(999950), '1M');
  assert.strictEqual(view.formatCount(999999), '1M');
  assert.strictEqual(view.formatCount(999999999), '1B');
  assert.strictEqual(view.formatCount(9999.6), '10k');
  assert.strictEqual(view.formatCount(9999.4), '9999');
  assert.strictEqual(view.formatCount(2.5e12), '2.5T');
  assert.strictEqual(view.formatCount(1e15), '1000T');
  assert.strictEqual(view.formatCount('100'), '–');
  assert.strictEqual(view.formatCount(NaN), '–');
  assert.strictEqual(view.goalText({ label: 'x', target: 'abc', current: 34 }), '34/–');
});

test('feed: a goal with an unparsable change date or without a measurement never wins the row', () => {
  const t = i18n.translator('en');
  const data = fixture('demo-roadmap.json');
  const byId = Object.fromEntries(data.items.map((it) => [it.id, it]));
  byId.legal.goal = { label: 'Pages', target: 2, current: 1, changed: 'garbage' };
  byId.seo.goal = { label: 'Keywords', target: 9, changed: '2026-09-10T11:00:00Z' };
  const goals = view.computeFeed(data, NOW, t).filter((e) => e.kind === 'goal');
  assert.strictEqual(goals.length, 1);
  assert.strictEqual(goals[0].id, 'app-store');
  data.items.forEach((it) => { delete it.goal; });
  byId.legal.goal = { label: 'Pages', target: 2, current: 1, changed: 'garbage' };
  assert.strictEqual(view.computeFeed(data, NOW, t).filter((e) => e.kind === 'goal').length, 0);
});

test('now panel: the fallback follows milestone order, not file order', () => {
  const data = fixture('roadmap-base.json');
  data.milestones.unshift({ id: 'm0', title: 'Empty first' });
  data.items.forEach((it) => { if (it.status === 'active') it.status = 'todo'; });
  const last = data.milestones[data.milestones.length - 1].id;
  data.items.unshift({ id: 'late', title: 'Written first, planned last', milestone: last, status: 'todo' });
  const t = i18n.translator('en');
  const html = view.renderApp({ ...demoState(), data, mode: 'live' }, { t, lang: 'en', now: NOW, filter: null, colorMode: 'system', showAllDone: false, changed: null });
  const first = data.items.find((it) => it.status === 'todo' && it.milestone === data.milestones[1].id);
  assert.ok(html.includes('<b>' + first.title + '</b>'));
  assert.ok(!html.includes('<b>Written first, planned last</b>'));
});

test('an unmeasured goal in the subline carries the title too', () => {
  const t = i18n.translator('en');
  const state = demoState();
  state.data.items.find((it) => it.id === 'checkout').goal = { label: 'Test orders', target: 20 };
  const html = view.renderApp(state, { t, lang: 'en', now: NOW, filter: null, colorMode: 'system', showAllDone: false, changed: null });
  assert.ok(/data-id="checkout"[\s\S]*?<span class="goal" title="not measured yet">–\/20 Test orders<\/span>/.test(html));
});

test('feed shows four rows with a show-all button, all rows when asked', () => {
  const t = i18n.translator('en');
  const base = { t, lang: 'en', now: NOW, filter: null, colorMode: 'system', showAllDone: false, changed: null };
  const short = view.renderApp(demoState(), base);
  const rows = (short.match(/<li data-kind=/g) || []).length;
  assert.strictEqual(rows, 4);
  assert.ok(short.includes('data-action="more-feed"') && short.includes('show all 8'));
  const all = view.renderApp(demoState(), { ...base, showAllFeed: true });
  assert.strictEqual((all.match(/<li data-kind=/g) || []).length, 8);
  assert.ok(!all.includes('data-action="more-feed"'));
});

// Goals: edge paths

test('formatCount: three digits round to whole units, negatives keep their sign', () => {
  assert.strictEqual(view.formatCount(123456), '123k');
  assert.strictEqual(view.formatCount(250000), '250k');
  assert.strictEqual(view.formatCount(100000000), '100M');
  assert.strictEqual(view.formatCount(123456789), '123M');
  assert.strictEqual(view.formatCount(-5), '-5');
  assert.strictEqual(view.formatCount(-12345), '-12.3k');
  assert.strictEqual(view.formatCount(-250000), '-250k');
  assert.strictEqual(view.formatCount(10000.4), '10k');
});

test('goalReached: at the target counts as reached, an unmeasured goal never is', () => {
  const t = i18n.translator('en');
  const base = { t, lang: 'en', now: NOW, filter: null, colorMode: 'system', showAllDone: false, changed: null };
  const state = demoState();
  const printer = state.data.items.find((it) => it.id === 'printer');
  const article = (html) => html.match(/<article class="item" data-id="printer"[\s\S]*?<\/article>/)[0];
  printer.goal = { label: 'Printers sold', target: 5, current: 5 };
  assert.ok(article(view.renderApp(state, base)).includes('<span class="goal reached">5/5 Printers sold</span>'));
  printer.goal = { label: 'Printers sold', target: 5, current: 4 };
  assert.ok(article(view.renderApp(state, base)).includes('<span class="goal">4/5 Printers sold</span>'));
  printer.goal = { label: 'Printers sold', target: 5 };
  assert.ok(article(view.renderApp(state, base)).includes('<span class="goal" title="not measured yet">–/5 Printers sold</span>'));
});

test('hasGoal: a goal that is not an object or has no numeric target is ignored everywhere', () => {
  const t = i18n.translator('en');
  const base = { t, lang: 'en', now: NOW, filter: null, colorMode: 'system', showAllDone: false, changed: null };
  const data = fixture('demo-roadmap.json');
  data.items.find((it) => it.id === 'app-store').goal = 'lots of stars';
  data.items.find((it) => it.id === 'analytics').goal = { label: 'Monthly orders', target: '200', current: 240, changed: '2026-09-04T11:00:00Z' };
  data.items.find((it) => it.id === 'checkout').goal = { label: 'Test orders', current: 7 };
  const html = view.renderApp({ ...demoState(), data }, base);
  assert.ok(/<span class="label status">open<\/span><span>App store listing<\/span>/.test(html));
  assert.ok(/<span class="label status">done<\/span><span>Basic analytics<\/span>/.test(html));
  assert.ok(!html.includes('class="goal'), 'no goal in any subline');
  assert.ok(!html.includes('label status goal'));
  assert.ok(!view.computeFeed(data, NOW, t).some((e) => e.kind === 'goal'));
});

test('current milestone: none when every milestone is complete', () => {
  const data = fixture('demo-roadmap.json');
  data.items.forEach((it) => { it.status = 'done'; delete it.question; });
  const info = view.milestoneStats(data);
  assert.strictEqual(info.current, null);
  assert.ok(info.stats.every((s) => s.complete));
  const t = i18n.translator('en');
  const html = view.renderApp({ ...demoState(), data }, { t, lang: 'en', now: NOW, filter: null, colorMode: 'system', showAllDone: false, changed: null });
  assert.ok(!html.includes('is-current'));
});

test('now panel: an empty current milestone points at the first open item anywhere, none open means all done', () => {
  const t = i18n.translator('en');
  const base = { t, lang: 'en', now: NOW, filter: null, colorMode: 'system', showAllDone: false, changed: null };
  const data = fixture('roadmap-base.json');
  data.milestones.unshift({ id: 'm0', title: 'Empty first' });
  data.items.find((it) => it.id === 'menu-editor').status = 'done';
  const live = { ...demoState(), mode: 'live', data };
  assert.strictEqual(view.milestoneStats(data).current.m.id, 'm0');
  const html = view.renderApp(live, base);
  assert.ok(/<div class="idle">Next up: <b>Checkout with pickup time<\/b>/.test(html));
  data.items.forEach((it) => { it.status = 'done'; });
  const done = view.renderApp(live, base);
  assert.ok(done.includes('Everything is done.'));
  assert.ok(done.includes('3 milestones, 4 items.'));
  assert.ok(!done.includes('Next up:'));
});

test('milestones view: a blocked item with a goal keeps its status word and attention color', () => {
  const t = i18n.translator('en');
  const base = { t, lang: 'en', now: NOW, filter: null, colorMode: 'system', showAllDone: false, changed: null };
  const state = demoState();
  state.data.items.find((it) => it.id === 'payment').goal = { label: 'Sandbox accounts', target: 1, current: 0 };
  const art = view.renderApp(state, base).match(/<article class="item" data-id="payment"[\s\S]*?<\/article>/)[0];
  assert.ok(art.includes('<span class="label status attention">blocked</span><span>Card payment with Stripe</span>'));
  assert.ok(art.includes('<span class="goal">0/1 Sandbox accounts</span>'));
  assert.ok(!art.includes('label status goal'));
});

test('feed: a goal without a change date has no row, equal dates keep the first item', () => {
  const t = i18n.translator('en');
  const data = fixture('demo-roadmap.json');
  data.items.forEach((it) => { if (it.goal) delete it.goal.changed; });
  assert.ok(!view.computeFeed(data, NOW, t).some((e) => e.kind === 'goal'));
  const tie = fixture('demo-roadmap.json');
  tie.items.find((it) => it.id === 'analytics').goal.changed = '2026-09-09T06:00:00Z';
  const goals = view.computeFeed(tie, NOW, t).filter((e) => e.kind === 'goal');
  assert.strictEqual(goals.length, 1);
  assert.strictEqual(goals[0].id, 'analytics');
  assert.strictEqual(goals[0].label, '240/200');
});

test('tagline: whitespace only is no tagline, no data falls back to the tool name', () => {
  const t = i18n.translator('en');
  const base = { t, lang: 'en', now: NOW, filter: null, colorMode: 'system', showAllDone: false, changed: null };
  const state = demoState();
  state.data.tagline = '   \n ';
  const html = view.renderApp(state, base);
  assert.ok(html.includes('<div class="brand"><h1>abholbereit</h1></div>'));
  assert.ok(!html.includes('class="tagline"'));
  const none = view.renderApp({ ...demoState(), data: null, ok: false, error: 'Unexpected token' }, base);
  assert.ok(none.includes('<div class="brand"><h1>roadmap-live</h1></div>'));
  assert.ok(!none.includes('class="tagline"'));
});

test('German: the unmeasured goal title is translated', () => {
  const t = i18n.translator('de');
  const state = demoState();
  state.data.items.find((it) => it.id === 'printer').goal = { label: 'Verkaufte Drucker', target: 5 };
  const html = view.renderApp(state, { t, lang: 'de', now: NOW, filter: null, colorMode: 'system', showAllDone: false, changed: null });
  assert.ok(/<span class="label status goal" title="noch nicht gemessen">–\/5<\/span><span>Receipt printer support<\/span>/.test(html));
});

test('focus: a filter without active items shows the idle block; all done and no items have their own sentence', () => {
  const filtered = mainOf(view.renderApp(demoState(), { ...BASE_OPTS(), view: 'focus', filter: 'm3' }), 'focus');
  assert.ok(!filtered.includes('<article'), 'Launch has nothing in progress');
  assert.ok(filtered.includes('<div class="now"><div class="eyebrow">'), 'the idle block stands in for the list');
  assert.ok(filtered.includes('Nothing in progress right now.') && filtered.includes('<b>App store listing</b>'), 'the idle block follows the filter: Launch still has one open item');
  const next = demoState();
  next.data.items.find((it) => it.id === 'checkout').status = 'todo';
  next.data.items.find((it) => it.id === 'payment').status = 'todo';
  const idle = mainOf(view.renderApp(next, { ...BASE_OPTS(), view: 'focus', filter: 'm3' }), 'focus');
  assert.ok(idle.includes('Nothing in progress right now.') && idle.includes('Next up: <b>App store listing</b>'), 'the filtered milestone names the next item');
  const done = demoState();
  done.data.items.forEach((it) => { it.status = 'done'; delete it.question; });
  const allDone = mainOf(view.renderApp(done, { ...BASE_OPTS(), view: 'focus' }), 'focus');
  assert.ok(allDone.includes('Everything is done.') && allDone.includes('3 milestones, 11 items.'));
  const empty = demoState();
  empty.data.items = [];
  assert.ok(mainOf(view.renderApp(empty, { ...BASE_OPTS(), view: 'focus' }), 'focus').includes('No items yet.'));
});

test('conversations: empty sentence on the static page, filter narrows the threads, blocked marked, fold remembers being open', () => {
  const stat = mainOf(view.renderApp(demoState(), { ...BASE_OPTS(), view: 'conversations', filter: 'm3' }), 'conversations');
  assert.ok(stat.includes('<div class="empty">No conversations yet. Comments and questions show up here.</div>'));
  const live = { ...demoState(), mode: 'live' };
  live.data.items.find((it) => it.id === 'payment').comments = [{ from: 'agent', text: 'Sandbox requested.', at: '2026-09-07T16:30:00Z' }];
  const m1 = mainOf(view.renderApp(live, { ...BASE_OPTS(), view: 'conversations', filter: 'm1', canWrite: true, open: { 'conv:others': true } }), 'conversations');
  const ids = m1.split('<details')[0].match(/<article class="item" data-id="([a-z-]+)"/g);
  assert.deepStrictEqual(ids, ['<article class="item" data-id="checkout"', '<article class="item" data-id="payment"'], 'Kitchen threads are filtered out');
  assert.ok(/data-id="payment"[\s\S]*?<span class="attention">blocked<\/span>/.test(m1));
  assert.ok(!m1.includes('data-key="conv:others"'), 'every open item of Ordering flow has a thread');
  const m2 = mainOf(view.renderApp(live, { ...BASE_OPTS(), view: 'conversations', filter: 'm2', canWrite: true, open: { 'conv:others': true } }), 'conversations');
  assert.ok(m2.includes('<details class="fold" data-key="conv:others" open><summary>2 items without a conversation</summary>'));
  assert.ok(m2.includes('data-id="printer"') && m2.includes('data-id="notifications"'));
});

test('open points: only resolved points show the empty sentence, a filter narrows the groups, fold remembers being open', () => {
  const resolved = demoState();
  resolved.data.items.find((it) => it.id === 'checkout').open_points.forEach((p) => { p.resolved = '2026-09-09T12:00:00Z'; });
  const main = mainOf(view.renderApp(resolved, { ...BASE_OPTS(), view: 'points', open: { 'pt:menu-editor': true } }), 'points');
  assert.ok(main.startsWith('<main class="points"><div class="empty">No open points. Reviewers have nothing outstanding.</div>'));
  assert.deepStrictEqual(main.match(/<section class="group[^"]*" data-id="([a-z-]+)"/g), ['<section class="group is-done" data-id="checkout"', '<section class="group is-done" data-id="menu-editor"'], 'last resolved first');
  assert.ok(main.includes('<details class="fold" data-key="pt:menu-editor" open><summary>1 resolved</summary>'));
  assert.ok(main.includes('<details class="fold" data-key="pt:checkout"><summary>2 resolved</summary>'));
  assert.ok(!main.includes('<span class="meta">2 open</span>'));
  const filtered = mainOf(view.renderApp(demoState(), { ...BASE_OPTS(), view: 'points', filter: 'm3' }), 'points');
  assert.ok(filtered.includes('class="empty"') && !filtered.includes('<section class="group'));
});

test('pull requests: a filter drops unplanned work, the empty sentence where nothing is linked, fold remembers being open', () => {
  const m1 = mainOf(view.renderApp(demoState(), { ...BASE_OPTS(), view: 'prs', filter: 'm1', open: { 'pr:42': true } }), 'prs');
  assert.deepStrictEqual(m1.match(/data-pr="(\d+)"/g), ['data-pr="44"', 'data-pr="43"', 'data-pr="42"'], 'PR 41 only carries unplanned work');
  assert.ok(!m1.includes('Customer loyalty points'));
  assert.ok(m1.includes('<details class="fold" data-key="pr:42" open><summary>1 resolved</summary>'));
  const m2 = mainOf(view.renderApp(demoState(), { ...BASE_OPTS(), view: 'prs', filter: 'm2' }), 'prs');
  assert.strictEqual(m2, '<main class="prs"><div class="empty">No pull requests linked yet.</div></main>');
});

test('signals: a filter hides unplanned work and the calm counts follow it; rows without a pull request keep the plain label', () => {
  const m2 = mainOf(view.renderApp(demoState(), { ...BASE_OPTS(), view: 'signals', filter: 'm2' }), 'signals');
  assert.deepStrictEqual(m2.match(/data-kind="([a-z]+)"/g), ['data-kind="stale"']);
  assert.ok(!m2.includes('Customer loyalty points'));
  const m3 = mainOf(view.renderApp(demoState(), { ...BASE_OPTS(), view: 'signals', filter: 'm3' }), 'signals');
  assert.ok(m3.includes('<p class="big">Nothing needs you.</p>') && m3.includes('0 in progress, 1 open, 4 done.'));
  const plain = demoState();
  delete plain.data.items.find((it) => it.id === 'payment').prs;
  delete plain.data.unplanned[0].prs;
  const html = mainOf(view.renderApp(plain, { ...BASE_OPTS(), view: 'signals' }), 'signals');
  assert.ok(/<span class="label attention">blocked<\/span><span class="text">Card payment with Stripe<span class="note">Waiting for the Stripe sandbox account.<\/span>/.test(html));
  assert.ok(/<span class="label attention">Unplanned<\/span><span class="text">Customer loyalty points<\/span>/.test(html));
});

test('list: a filter narrows the rows and an empty milestone shows the empty sentence', () => {
  const m2 = mainOf(view.renderApp(demoState(), { ...BASE_OPTS(), view: 'list', filter: 'm2' }), 'list-view');
  assert.deepStrictEqual(m2.match(/<tr data-id="([a-z-]+)"/g).map((m) => m.slice(13, -1)), ['order-queue', 'printer', 'notifications']);
  const state = demoState();
  state.data.milestones.push({ id: 'm4', title: 'Later' });
  const m4 = mainOf(view.renderApp(state, { ...BASE_OPTS(), view: 'list', filter: 'm4' }), 'list-view');
  assert.strictEqual(m4, '<main class="list-view"><div class="empty">No items</div></main>');
});

test('list: every column sorts both ways, an unknown key keeps the default order', () => {
  const first = (sort) => {
    const html = view.renderApp(demoState(), { ...BASE_OPTS(), view: 'list', sort });
    return { id: html.match(/<tr data-id="([a-z-]+)"/)[1], head: (html.match(/<th class="c-[a-z]+" aria-sort="[a-z]+">/) || [''])[0] };
  };
  assert.deepStrictEqual(first({ key: 'status', dir: 'asc' }), { id: 'payment', head: '<th class="c-status" aria-sort="ascending">' });
  assert.deepStrictEqual(first({ key: 'status', dir: 'desc' }), { id: 'menu-editor', head: '<th class="c-status" aria-sort="descending">' });
  assert.strictEqual(first({ key: 'milestone', dir: 'desc' }).id, 'app-store', 'Launch first, open before done inside it');
  assert.strictEqual(first({ key: 'milestone', dir: 'asc' }).id, 'payment');
  assert.strictEqual(first({ key: 'pr', dir: 'desc' }).id, 'checkout');
  assert.strictEqual(first({ key: 'pr', dir: 'asc' }).id, 'order-queue', 'items without a pull request first');
  assert.strictEqual(first({ key: 'points', dir: 'desc' }).id, 'checkout');
  assert.strictEqual(first({ key: 'points', dir: 'asc' }).id, 'payment');
  assert.strictEqual(first({ key: 'title', dir: 'desc' }).id, 'legal');
  assert.strictEqual(first({ key: 'updated', dir: 'asc' }).id, 'printer', 'never updated sorts first');
  assert.deepStrictEqual(first({ key: 'nope', dir: 'desc' }), { id: 'payment', head: '' });
});

test('timeline: a filter drops the sync and unplanned rows; a quiet milestone shows the empty sentence', () => {
  const rows = view.computeTimeline(demoState(), { ...BASE_OPTS(), filter: 'm2' });
  const kinds = new Set(rows.map((r) => r.kind));
  assert.ok(kinds.has('status') && kinds.has('comment'));
  assert.ok(!kinds.has('sync') && !kinds.has('unplanned') && !kinds.has('point') && !kinds.has('question'));
  const state = demoState();
  state.data.milestones.push({ id: 'm4', title: 'Later' });
  const empty = mainOf(view.renderApp(state, { ...BASE_OPTS(), view: 'timeline', filter: 'm4' }), 'timeline');
  assert.strictEqual(empty, '<main class="timeline"><div class="empty">Nothing has happened yet.</div></main>');
});

test('timeline day headings: today, and the year for a date outside this one; a question without asked has no row', () => {
  const state = demoState();
  state.data.items.find((it) => it.id === 'landing-page').updated = '2026-09-10T09:15:00Z';
  state.data.items.find((it) => it.id === 'analytics').updated = '2025-12-24T11:00:00Z';
  delete state.data.items.find((it) => it.id === 'checkout').question.asked;
  const html = mainOf(view.renderApp(state, { ...BASE_OPTS(), view: 'timeline' }), 'timeline');
  assert.ok(html.startsWith('<main class="timeline"><section class="day"><h2>today</h2>'));
  assert.ok(/<span class="at">09:15 AM<\/span>/.test(html));
  assert.ok(/<h2>[^<]*2025<\/h2>/.test(html), 'a different year is spelled out');
  assert.ok(!html.includes('data-kind="question"'));
  assert.ok(!view.computeTimeline(state, BASE_OPTS()).some((r) => r.kind === 'question'));
});

test('questions: no options renders no buttons, a done item drops its question, the live page without the key is read-only', () => {
  const live = { ...demoState(), mode: 'live' };
  delete live.data.items.find((it) => it.id === 'checkout').question.options;
  const noOptions = mainOf(view.renderApp(live, { ...BASE_OPTS(), view: 'focus', canWrite: true }), 'focus');
  assert.ok(noOptions.includes('Pickup time in 15 or 30 minute steps?<div class="answers"></div>'));
  assert.ok(!noOptions.includes('data-action="answer"'));
  const readOnly = view.renderApp({ ...demoState(), mode: 'live' }, { ...BASE_OPTS(), view: 'focus' });
  assert.ok(!/<form|<input|data-action="answer"/.test(readOnly), 'no write path without the key');
  assert.ok(/class="waiting"[\s\S]*?<div class="hint">Read-only\. To write, open the link with the key\.<\/div>/.test(readOnly));
  const focus = mainOf(readOnly, 'focus');
  assert.ok(focus.includes('Pickup time in 15 or 30 minute steps?</div>'), 'the question in the thread brings no hint of its own');
  assert.strictEqual((focus.match(/Read-only\./g) || []).length, 3, 'one hint per open thread');
  const conv = mainOf(view.renderApp({ ...demoState(), mode: 'live' }, { ...BASE_OPTS(), view: 'conversations' }), 'conversations');
  assert.ok(conv.includes('Read-only.') && !conv.includes('data-key="conv:others"'));
  const done = demoState();
  done.data.items.find((it) => it.id === 'checkout').status = 'done';
  const gone = view.renderApp(done, { ...BASE_OPTS(), view: 'conversations' });
  assert.ok(!gone.includes('Pickup time in 15 or 30 minute steps?'));
});

test('an unknown milestone shows its id; points link to reviews and plain pull requests, and lose the link without a repository', () => {
  const state = demoState();
  const checkout = state.data.items.find((it) => it.id === 'checkout');
  checkout.milestone = 'm9';
  checkout.open_points[0].source = 'pr:44#review:7';
  checkout.open_points[1].source = 'pr:44';
  checkout.open_points.push({ text: 'Not from a pull request', source: 'note:1', opened: '2026-09-09T08:32:00Z', resolved: null });
  const focus = mainOf(view.renderApp(state, { ...BASE_OPTS(), view: 'focus' }), 'focus');
  assert.ok(focus.includes('<div class="sub"><span>m9</span>'));
  assert.ok(focus.includes('href="https://github.com/acme/abholbereit/pull/44#pullrequestreview-7"'));
  assert.ok(focus.includes('<a href="https://github.com/acme/abholbereit/pull/44">PR #44</a></span><span class="text">Add a test for the empty cart case</span>'));
  assert.ok(focus.includes('<span class="label"></span><span class="text">Not from a pull request</span>'));
  const list = mainOf(view.renderApp(state, { ...BASE_OPTS(), view: 'list' }), 'list-view');
  assert.ok(list.includes('<td class="c-milestone mono">m9</td>'));
  const noRepo = mainOf(view.renderApp({ ...state, repoUrl: null }, { ...BASE_OPTS(), view: 'focus' }), 'focus');
  assert.ok(noRepo.includes('<span class="label">PR #44</span>') && !noRepo.includes('href="https://github.com'));
  const noRepoList = mainOf(view.renderApp({ ...state, repoUrl: null }, { ...BASE_OPTS(), view: 'list' }), 'list-view');
  assert.ok(noRepoList.includes('<td class="c-pr mono">#44</td>'));
});

test('the view named in roadmap.json is the static default; unplanned pull requests alone keep the view in the row', () => {
  const state = demoState();
  state.data.view = 'board';
  const html = body(renderPage(state, { theme: 'neutral', lang: 'en', live: false, now: NOW }));
  assert.ok(html.includes('<main class="board">') && html.includes('data-view="board" aria-current="page">Board</a>'));
  assert.ok(body(renderPage(state, { theme: 'neutral', lang: 'en', live: false, now: NOW, view: 'list' })).includes('<main class="list-view">'), 'the option wins over the file');
  const unplannedOnly = demoState();
  unplannedOnly.data.items.forEach((it) => { delete it.prs; });
  assert.ok(view.availableViews(unplannedOnly.data).includes('prs'));
  assert.deepStrictEqual(view.availableViews(null), view.VIEWS);
});

test('an item with several pull requests keeps the "PRs #44, #45" subline (locale key must not be shadowed)', () => {
  const state = demoState();
  state.data.items.find((it) => it.id === 'checkout').prs = [44, 45];
  const html = view.renderApp(state, { ...BASE_OPTS(), view: 'board' });
  assert.ok(/PRs <a href="https:\/\/github.com\/acme\/abholbereit\/pull\/44">#44<\/a>, <a [^>]*>#45<\/a>/.test(html));
  assert.ok(!html.includes('undefined'));
  const focus = view.renderApp(state, { ...BASE_OPTS(), view: 'focus' });
  assert.ok(!focus.includes('undefined') && focus.includes('#45</a>'));
});

test('focus idle text follows the milestone filter', () => {
  const state = demoState();
  state.data.items.forEach((it) => { if (it.status === 'active' || it.status === 'blocked') it.status = 'todo'; });
  const launch = view.renderApp(state, { ...BASE_OPTS(), view: 'focus', filter: 'm3' });
  assert.ok(launch.includes('<b>App store listing</b>'), 'next up comes from the filtered milestone');
  const unfiltered = view.renderApp(state, { ...BASE_OPTS(), view: 'focus' });
  assert.ok(unfiltered.includes('<b>Checkout with pickup time</b>'), 'without a filter the current milestone leads');
});

test('timeline: rows without a parseable time are dropped, nothing else breaks', () => {
  const state = demoState();
  const checkout = state.data.items.find((it) => it.id === 'checkout');
  checkout.comments.push({ from: 'agent', text: 'no time', at: undefined });
  checkout.open_points.push({ text: 'bad date', source: 'pr:44', opened: 'not-a-date', resolved: null });
  const rows = view.computeTimeline(state, BASE_OPTS());
  assert.ok(!rows.some((r) => r.text.includes('no time') || r.text.includes('bad date')));
  assert.ok(rows.some((r) => r.kind === 'comment'), 'the dated comments stay');
  const html = mainOf(view.renderApp(state, { ...BASE_OPTS(), view: 'timeline' }), 'timeline');
  assert.ok(!/Invalid Date|NaN/.test(html));
});
