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

test('views: milestones is the default, board via opts, the header button cycles', () => {
  const t = i18n.translator('en');
  const base = { t, lang: 'en', now: NOW, filter: null, colorMode: 'system', showAllDone: false, changed: null };
  const ms = view.renderApp(demoState(), base);
  assert.ok(ms.includes('<main class="milestones">'));
  assert.ok(!ms.includes('<main class="board">'));
  assert.ok(ms.includes('data-action="view"') && ms.includes('>Milestones</button>'));
  assert.ok(/<section class="ms is-current" data-milestone="m1">[\s\S]*?<h2>Ordering flow<\/h2>/.test(ms));
  assert.ok(/<section class="ms" data-milestone="m3">/.test(ms), 'Launch has one open item, so it is neither current nor done');
  assert.ok(/<details class="ms-done" data-milestone="m3">[\s\S]*?<summary>4 done<\/summary>/.test(ms));
  assert.ok(/<span class="label status attention">blocked<\/span><span>Card payment with Stripe<\/span>/.test(ms));
  assert.ok(/<span class="label status">in progress<\/span><span>Checkout with pickup time<\/span>/.test(ms));
  const board = view.renderApp(demoState(), { ...base, view: 'board' });
  assert.ok(board.includes('<main class="board">') && board.includes('>Board</button>'));
  assert.ok(!board.includes('class="label status'), 'board keeps its columns without status labels');
  const filtered = view.renderApp(demoState(), { ...base, filter: 'm2' });
  assert.ok(filtered.includes('data-milestone="m2"') && !filtered.includes('data-milestone="m1"'));
  const stat = body(renderPage(demoState(), { theme: 'neutral', lang: 'en', live: false, now: NOW }));
  assert.ok(stat.includes('<main class="milestones">') && stat.includes('data-action="view"'));
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
