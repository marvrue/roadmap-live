#!/usr/bin/env node
'use strict';

/*
 * roadmap-live
 *
 * Shows the state of a project's roadmap.json live in the browser.
 * Single file, no dependencies, Node >= 18.
 *
 *   node roadmap-live.js                 # ./roadmap.json, port 4242
 *   node roadmap-live.js path/to.json    # another file
 *   node roadmap-live.js --port 5000
 *   node roadmap-live.js --check         # validate only, exit code 0 or 1
 */

const fs = require('fs');
const path = require('path');
const http = require('http');

const DEFAULT_FILE = 'roadmap.json';
const DEFAULT_PORT = 4242;
const STATUSES = ['todo', 'active', 'done'];
const DEBOUNCE_MS = 100;
const POLL_MS = 2000;
const HEARTBEAT_MS = 25000;
const ISO_DATE = /^\d{4}-\d{2}-\d{2}(T\d{2}:\d{2}(:\d{2}(\.\d+)?)?(Z|[+-]\d{2}:?\d{2})?)?$/;

// ---------------------------------------------------------------------------
// CLI
// ---------------------------------------------------------------------------

const USAGE = `Usage: node roadmap-live.js [file] [--port <n>] [--check]

  file          path to roadmap.json (default: ./roadmap.json)
  --port <n>    HTTP port (default: ${DEFAULT_PORT})
  --check       validate the file and exit with 0 (ok) or 1 (problems)
  -h, --help    show this help`;

function parseArgs(argv) {
  const opts = { file: DEFAULT_FILE, port: String(DEFAULT_PORT), check: false, help: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--check') opts.check = true;
    else if (a === '-h' || a === '--help') opts.help = true;
    else if (a === '--port') opts.port = argv[++i];
    else if (a.startsWith('--port=')) opts.port = a.slice('--port='.length);
    else if (a.startsWith('-')) throw new Error(`unknown option: ${a}`);
    else opts.file = a;
  }
  const port = Number(opts.port);
  if (opts.port === undefined || !Number.isInteger(port) || port < 0 || port > 65535) {
    throw new Error(`invalid port: ${opts.port}`);
  }
  opts.port = port;
  opts.file = path.resolve(opts.file);
  return opts;
}

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------

function isObject(v) {
  return v !== null && typeof v === 'object' && !Array.isArray(v);
}

function isText(v) {
  return typeof v === 'string' && v.trim().length > 0;
}

function validate(data) {
  const errors = [];
  if (!isObject(data)) return ['root must be a JSON object'];

  if (!isText(data.project)) errors.push('"project" must be a non-empty string');

  const milestoneIds = new Set();
  if (!Array.isArray(data.milestones)) {
    errors.push('"milestones" must be an array');
  } else {
    data.milestones.forEach((m, i) => {
      const where = `milestones[${i}]`;
      if (!isObject(m)) return errors.push(`${where} must be an object`);
      if (!isText(m.id)) errors.push(`${where}.id must be a non-empty string`);
      else if (milestoneIds.has(m.id)) errors.push(`${where}.id "${m.id}" is used more than once`);
      else milestoneIds.add(m.id);
      if (!isText(m.title)) errors.push(`${where}.title must be a non-empty string`);
    });
  }

  const itemIds = new Set();
  if (!Array.isArray(data.items)) {
    errors.push('"items" must be an array');
  } else {
    data.items.forEach((it, i) => {
      const label = isObject(it) && isText(it.id) ? `items[${i}] ("${it.id}")` : `items[${i}]`;
      if (!isObject(it)) return errors.push(`${label} must be an object`);
      if (!isText(it.id)) errors.push(`${label}.id must be a non-empty string`);
      else if (itemIds.has(it.id)) errors.push(`${label}.id "${it.id}" is used more than once`);
      else itemIds.add(it.id);
      if (!isText(it.title)) errors.push(`${label}.title must be a non-empty string`);
      if (!isText(it.milestone)) {
        errors.push(`${label}.milestone must be a non-empty string`);
      } else if (Array.isArray(data.milestones) && !milestoneIds.has(it.milestone)) {
        errors.push(`${label}.milestone refers to unknown milestone "${it.milestone}"`);
      }
      if (!STATUSES.includes(it.status)) {
        errors.push(`${label}.status must be one of ${STATUSES.join(', ')} (got ${JSON.stringify(it.status)})`);
      }
      if (it.note !== undefined && typeof it.note !== 'string') {
        errors.push(`${label}.note must be a string`);
      }
      if (it.updated !== undefined) {
        if (typeof it.updated !== 'string' || !ISO_DATE.test(it.updated) || Number.isNaN(Date.parse(it.updated))) {
          errors.push(`${label}.updated must be an ISO 8601 date string (got ${JSON.stringify(it.updated)})`);
        }
      }
    });
  }
  return errors;
}

function loadRoadmap(file) {
  let raw;
  try {
    raw = fs.readFileSync(file, 'utf8');
  } catch (e) {
    const msg = e.code === 'ENOENT' ? `file not found: ${file}` : `cannot read file: ${e.message}`;
    return { ok: false, raw: null, data: null, errors: [msg] };
  }
  let data;
  try {
    data = JSON.parse(raw);
  } catch (e) {
    return { ok: false, raw, data: null, errors: [`invalid JSON: ${e.message}`] };
  }
  const errors = validate(data);
  return { ok: errors.length === 0, raw, data: errors.length ? null : data, errors };
}

function displayName(file) {
  const rel = path.relative(process.cwd(), file);
  return rel && !rel.startsWith('..') ? rel : file;
}

function runCheck(file) {
  const result = loadRoadmap(file);
  const name = displayName(file);
  if (result.ok) {
    const active = result.data.items.filter((it) => it.status === 'active').length;
    const done = result.data.items.filter((it) => it.status === 'done').length;
    console.log(
      `${name}: ok (${result.data.milestones.length} milestones, ${result.data.items.length} items, ` +
        `${done} done, ${active} active)`
    );
    if (active > 1) console.log(`note: ${active} items are active at the same time`);
    return 0;
  }
  console.error(`${name}: ${result.errors.length} problem${result.errors.length === 1 ? '' : 's'}`);
  for (const err of result.errors) console.error(`  - ${err}`);
  return 1;
}

// ---------------------------------------------------------------------------
// Store + file watching
// ---------------------------------------------------------------------------

function statKey(file) {
  try {
    const s = fs.statSync(file);
    return `${s.mtimeMs}:${s.size}:${s.ino}`;
  } catch {
    return 'missing';
  }
}

// fs.watch is unreliable across platforms and editors, so three mechanisms
// work together: fs.watch on the file (debounced), re-arming the watcher when
// the file is replaced by rename (atomic saves), and mtime polling as fallback.
function watchFile(file, onChange) {
  let timer = null;
  let watcher = null;
  let lastKey = statKey(file);

  const trigger = () => {
    clearTimeout(timer);
    timer = setTimeout(() => {
      lastKey = statKey(file);
      onChange();
    }, DEBOUNCE_MS);
  };

  const disarm = () => {
    if (!watcher) return;
    try { watcher.close(); } catch { /* ignore */ }
    watcher = null;
  };

  const arm = () => {
    disarm();
    try {
      watcher = fs.watch(file, { persistent: false }, (eventType) => {
        trigger();
        // The file was renamed or replaced: the watcher now points at the old
        // inode, so set it up again on the new file.
        if (eventType === 'rename') setTimeout(arm, DEBOUNCE_MS);
      });
      watcher.on('error', () => {
        disarm();
        setTimeout(arm, POLL_MS);
      });
    } catch {
      watcher = null; // missing file or fs.watch unsupported: polling covers it
    }
  };

  arm();
  const poll = setInterval(() => {
    if (statKey(file) !== lastKey) trigger();
    if (!watcher) arm();
  }, POLL_MS);

  return () => {
    clearInterval(poll);
    clearTimeout(timer);
    disarm();
  };
}

function createStore(file) {
  const state = { ok: false, data: null, error: null, updatedAt: null, file: displayName(file) };
  const listeners = new Set();
  let lastRaw;
  let lastOk;

  const snapshot = () => ({ ...state });

  const reload = () => {
    const result = loadRoadmap(file);
    if (result.raw === lastRaw && result.ok === lastOk) return; // no change
    lastRaw = result.raw;
    lastOk = result.ok;
    if (result.ok) {
      state.data = result.data;
      state.error = null;
      state.updatedAt = new Date().toISOString();
      const active = result.data.items.filter((it) => it.status === 'active').map((it) => it.id);
      log(`updated (${result.data.items.length} items, active: ${active.join(', ') || 'none'})`);
    } else {
      state.error = result.errors.join('\n');
      log(`invalid, keeping last valid state:\n  - ${result.errors.join('\n  - ')}`);
    }
    state.ok = result.ok;
    for (const fn of listeners) fn(snapshot());
  };

  reload();
  const stop = watchFile(file, reload);

  return {
    snapshot,
    subscribe: (fn) => { listeners.add(fn); return () => listeners.delete(fn); },
    stop,
  };
}

function log(msg) {
  const t = new Date().toTimeString().slice(0, 8);
  console.log(`[${t}] ${msg}`);
}

// ---------------------------------------------------------------------------
// HTTP server
// ---------------------------------------------------------------------------

function startServer(opts) {
  const store = createStore(opts.file);
  const clients = new Set();

  const sendEvent = (res, snap) => {
    res.write(`event: update\ndata: ${JSON.stringify(snap)}\n\n`);
  };

  store.subscribe((snap) => {
    for (const res of clients) sendEvent(res, snap);
  });

  const heartbeat = setInterval(() => {
    for (const res of clients) res.write(': ping\n\n');
  }, HEARTBEAT_MS);

  const server = http.createServer((req, res) => {
    const url = new URL(req.url, 'http://localhost');
    if (req.method !== 'GET' && req.method !== 'HEAD') {
      res.writeHead(405, { 'Content-Type': 'text/plain' });
      return res.end('method not allowed');
    }
    switch (url.pathname) {
      case '/':
        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' });
        return res.end(PAGE);
      case '/data':
        res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
        return res.end(JSON.stringify(store.snapshot()));
      case '/events':
        res.writeHead(200, {
          'Content-Type': 'text/event-stream; charset=utf-8',
          'Cache-Control': 'no-store',
          Connection: 'keep-alive',
        });
        res.write('retry: 1000\n\n');
        sendEvent(res, store.snapshot());
        clients.add(res);
        req.on('close', () => clients.delete(res));
        return undefined;
      default:
        res.writeHead(404, { 'Content-Type': 'text/plain' });
        return res.end('not found');
    }
  });

  server.on('error', (e) => {
    if (e.code === 'EADDRINUSE') {
      console.error(`roadmap-live: port ${opts.port} is already in use, try --port <number>`);
    } else {
      console.error(`roadmap-live: ${e.message}`);
    }
    process.exit(1);
  });

  server.listen(opts.port, '127.0.0.1', () => {
    const port = server.address().port;
    console.log(`roadmap-live: watching ${displayName(opts.file)}`);
    console.log(`  http://localhost:${port}`);
    console.log('  press Ctrl+C to stop');
  });

  let stopping = false;
  const shutdown = () => {
    if (stopping) return;
    stopping = true;
    console.log('\nroadmap-live: stopped');
    clearInterval(heartbeat);
    store.stop();
    for (const res of clients) res.end();
    clients.clear();
    server.close(() => process.exit(0));
    setTimeout(() => process.exit(0), 500).unref();
  };
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}

// ---------------------------------------------------------------------------
// Page (HTML, CSS, JS)
// ---------------------------------------------------------------------------

const PAGE = `<!doctype html>
<html lang="de">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>roadmap-live</title>
<style>
  :root {
    color-scheme: light dark;
    --bg: #f5f5f7;
    --surface: #ffffff;
    --border: #e1e1e6;
    --text: #1c1c21;
    --muted: #6e6e7a;
    --track: #e4e4e9;
    --accent: #2f6bff;
    --accent-soft: rgba(47, 107, 255, 0.14);
    --accent-tint: rgba(47, 107, 255, 0.06);
    --danger: #c62828;
    --danger-text: #ffffff;
    --shadow: 0 1px 2px rgba(0, 0, 0, 0.05);
  }
  @media (prefers-color-scheme: dark) {
    :root {
      --bg: #121215;
      --surface: #1b1b20;
      --border: #2a2a31;
      --text: #ececf1;
      --muted: #8f8f9c;
      --track: #2a2a31;
      --accent: #5b8dff;
      --accent-soft: rgba(91, 141, 255, 0.18);
      --accent-tint: rgba(91, 141, 255, 0.08);
      --danger: #b71c1c;
      --shadow: 0 1px 2px rgba(0, 0, 0, 0.4);
    }
  }
  * { box-sizing: border-box; }
  html, body { margin: 0; }
  body {
    background: var(--bg);
    color: var(--text);
    font: 14px/1.45 -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
    padding: 0 24px 40px;
  }
  .banner {
    background: var(--danger);
    color: var(--danger-text);
    margin: 0 -24px 8px;
    padding: 10px 24px;
    font-size: 13px;
    white-space: pre-line;
  }
  .banner strong { font-weight: 600; }

  .top {
    display: flex;
    align-items: baseline;
    justify-content: space-between;
    gap: 16px;
    flex-wrap: wrap;
    padding: 22px 0 14px;
  }
  .top h1 { font-size: 20px; font-weight: 600; margin: 0; letter-spacing: -0.01em; }
  .status { display: flex; align-items: center; gap: 14px; color: var(--muted); font-size: 12px; }
  .conn { display: inline-flex; align-items: center; gap: 6px; }
  .conn i { width: 8px; height: 8px; border-radius: 50%; background: var(--muted); display: inline-block; }
  .conn.on i { background: #2e9e5b; }
  .conn.off i { background: var(--danger); }

  .progress { display: flex; align-items: flex-start; gap: 18px; flex-wrap: wrap; margin-bottom: 26px; }
  .segments { display: flex; gap: 3px; flex: 1 1 320px; min-width: 0; }
  .seg { flex: 1 1 0; min-width: 64px; }
  .track { height: 10px; background: var(--track); overflow: hidden; }
  .seg:first-child .track { border-radius: 5px 0 0 5px; }
  .seg:last-child .track { border-radius: 0 5px 5px 0; }
  .seg:only-child .track { border-radius: 5px; }
  .fill { height: 100%; background: var(--accent); transition: width 0.4s ease; }
  .seg.is-done .fill { opacity: 0.7; }
  .seg.is-current .track { box-shadow: 0 0 0 1.5px var(--accent); }
  .label {
    display: flex; align-items: center; gap: 6px; flex-wrap: wrap;
    margin-top: 7px; font-size: 12px; color: var(--muted); line-height: 1.3;
  }
  .label .name { color: var(--text); font-weight: 500; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; max-width: 100%; }
  .seg.is-current .label .name { color: var(--accent); }
  .seg.is-done .label .name { color: var(--muted); font-weight: 400; }
  .label svg { width: 12px; height: 12px; color: var(--accent); flex: none; }
  .total { font-size: 13px; color: var(--muted); white-space: nowrap; padding-top: 0; font-variant-numeric: tabular-nums; }
  .total b { color: var(--text); font-weight: 600; }

  .board { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 16px; }
  .col { background: transparent; border: 1px solid var(--border); border-radius: 10px; padding: 12px; min-height: 160px; }
  .col.active { border-color: var(--accent); background: var(--accent-tint); }
  .col header { display: flex; align-items: baseline; gap: 8px; margin-bottom: 10px; }
  .col h2 { font-size: 13px; font-weight: 600; margin: 0; text-transform: uppercase; letter-spacing: 0.06em; }
  .col .count { font-size: 12px; color: var(--muted); font-variant-numeric: tabular-nums; }
  .col .hint { font-size: 11px; color: var(--muted); margin-left: auto; }
  .col .hint[hidden] { display: none; }
  .cards { display: flex; flex-direction: column; gap: 8px; }
  .empty { color: var(--muted); font-size: 12px; padding: 10px 4px; }

  .card {
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: 8px;
    padding: 10px 12px;
    box-shadow: var(--shadow);
    transition: transform 0.35s cubic-bezier(0.2, 0.7, 0.2, 1), opacity 0.35s ease;
    will-change: transform;
  }
  .card.enter { animation: enter 0.35s ease; }
  @keyframes enter { from { opacity: 0; transform: translateY(4px); } to { opacity: 1; transform: none; } }
  .card .title { font-weight: 500; overflow-wrap: anywhere; }
  .card .meta { display: flex; align-items: center; gap: 8px; margin-top: 6px; font-size: 11px; color: var(--muted); flex-wrap: wrap; }
  .card .tag {
    border: 1px solid var(--border); border-radius: 4px; padding: 1px 6px;
    color: var(--muted); max-width: 100%; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
  }
  .card .note { margin: 6px 0 0; color: var(--muted); font-size: 13px; overflow-wrap: anywhere; }
  .col.active .card { border-color: var(--accent); animation: pulse 2.6s ease-in-out infinite; }
  .col.active .card.enter { animation: enter 0.35s ease, pulse 2.6s ease-in-out 0.35s infinite; }
  .col.done .card .title { color: var(--muted); }
  @keyframes pulse {
    0%, 100% { box-shadow: 0 0 0 0 rgba(47, 107, 255, 0); }
    50% { box-shadow: 0 0 0 4px var(--accent-soft); }
  }
  @media (prefers-reduced-motion: reduce) {
    .card, .fill { transition: none; }
    .col.active .card, .card.enter { animation: none; }
  }
  @media (max-width: 760px) {
    body { padding: 0 16px 32px; }
    .banner { margin: 0 -16px 8px; padding: 10px 16px; }
    .board { grid-template-columns: 1fr; }
    .col { min-height: 0; }
  }
</style>
</head>
<body>
<div id="banner" class="banner" hidden></div>
<header class="top">
  <h1 id="project">roadmap-live</h1>
  <div class="status">
    <span id="updated"></span>
    <span id="conn" class="conn off"><i></i><span>getrennt</span></span>
  </div>
</header>
<section class="progress">
  <div id="segments" class="segments"></div>
  <div id="total" class="total"></div>
</section>
<main class="board">
  <section class="col todo" data-status="todo">
    <header><h2>Todo</h2><span class="count">0</span></header>
    <div class="cards"></div>
  </section>
  <section class="col active" data-status="active">
    <header><h2>Active</h2><span class="count">0</span><span class="hint" hidden></span></header>
    <div class="cards"></div>
  </section>
  <section class="col done" data-status="done">
    <header><h2>Done</h2><span class="count">0</span></header>
    <div class="cards"></div>
  </section>
</main>
<script>
(function () {
  'use strict';
  var T = {
    connected: 'verbunden',
    disconnected: 'getrennt',
    noData: 'noch keine gültigen Daten',
    updated: 'aktualisiert ',
    justNow: 'gerade eben',
    empty: 'keine Items',
    parallel: function (n) { return n + ' Items parallel aktiv'; },
    invalid: function (file) { return file + ' ist ungültig, der letzte gültige Stand wird angezeigt.'; }
  };
  var CHECK = '<svg viewBox="0 0 16 16" aria-label="fertig"><path d="M3 8.5l3 3 7-7" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>';

  var $ = function (sel) { return document.querySelector(sel); };
  var el = function (tag, cls, text) {
    var e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text !== undefined) e.textContent = text;
    return e;
  };

  var snap = null;

  function plural(n, one, many) { return n + ' ' + (n === 1 ? one : many); }

  // Relative time, coarse: "gerade eben", "vor 4 Min", "vor 2 Std", "vor 3 Tagen"
  function rel(iso) {
    var t = Date.parse(iso);
    if (isNaN(t)) return '';
    var s = Math.round((Date.now() - t) / 1000);
    if (s < 45) return T.justNow;
    var m = Math.round(s / 60);
    if (m < 60) return 'vor ' + m + ' Min';
    var h = Math.round(m / 60);
    if (h < 24) return 'vor ' + h + ' Std';
    var d = Math.round(h / 24);
    return 'vor ' + plural(d, 'Tag', 'Tagen');
  }

  // Relative time, fine: "vor 12 Sekunden", then coarse
  function relFine(iso) {
    var t = Date.parse(iso);
    if (isNaN(t)) return '';
    var s = Math.max(0, Math.round((Date.now() - t) / 1000));
    if (s < 60) return 'vor ' + plural(s, 'Sekunde', 'Sekunden');
    return rel(iso);
  }

  function setConnected(on) {
    var c = $('#conn');
    c.className = 'conn ' + (on ? 'on' : 'off');
    c.lastChild.textContent = on ? T.connected : T.disconnected;
  }

  function tick() {
    if (!snap) return;
    $('#updated').textContent = snap.updatedAt ? T.updated + relFine(snap.updatedAt) : T.noData;
    var times = document.querySelectorAll('.time[data-updated]');
    for (var i = 0; i < times.length; i++) {
      times[i].textContent = rel(times[i].getAttribute('data-updated'));
    }
  }

  function renderBanner() {
    var b = $('#banner');
    if (snap.error) {
      b.textContent = '';
      b.appendChild(el('strong', null, T.invalid(snap.file || 'roadmap.json')));
      b.appendChild(document.createTextNode('\\n' + snap.error));
      b.hidden = false;
    } else {
      b.hidden = true;
    }
  }

  function milestoneStats(data) {
    var stats = data.milestones.map(function (m) {
      var items = data.items.filter(function (it) { return it.milestone === m.id; });
      var done = items.filter(function (it) { return it.status === 'done'; }).length;
      return { m: m, total: items.length, done: done, complete: items.length > 0 && done === items.length };
    });
    var current = null;
    for (var i = 0; i < stats.length; i++) {
      if (stats[i].total > 0 && !stats[i].complete) { current = stats[i]; break; }
    }
    return { stats: stats, current: current };
  }

  function renderProgress(data) {
    var info = milestoneStats(data);
    var wrap = $('#segments');
    wrap.textContent = '';
    info.stats.forEach(function (s) {
      var seg = el('div', 'seg' + (s.complete ? ' is-done' : '') + (s === info.current ? ' is-current' : ''));
      seg.style.flexGrow = String(Math.max(s.total, 1));
      var track = el('div', 'track');
      var fill = el('div', 'fill');
      fill.style.width = (s.total ? (100 * s.done / s.total) : 0) + '%';
      track.appendChild(fill);
      seg.appendChild(track);
      var label = el('div', 'label');
      label.appendChild(el('span', 'name', s.m.title));
      label.appendChild(el('span', 'count', s.done + '/' + s.total));
      if (s.complete) {
        var check = el('span');
        check.innerHTML = CHECK;
        label.appendChild(check.firstChild);
      }
      seg.appendChild(label);
      wrap.appendChild(seg);
    });
    var total = data.items.length;
    var done = data.items.filter(function (it) { return it.status === 'done'; }).length;
    var pct = total ? Math.round(100 * done / total) : 0;
    var t = $('#total');
    t.textContent = '';
    t.appendChild(el('b', null, done + '/' + total));
    t.appendChild(document.createTextNode(' \\u00b7 ' + pct + ' %'));
  }

  // Todo/Active: milestone order. Done: most recently updated first, then milestone order.
  function sortItems(items, order, status) {
    return items.slice().sort(function (a, b) {
      if (status === 'done') {
        var ta = Date.parse(a.updated) || 0, tb = Date.parse(b.updated) || 0;
        if (ta !== tb) return tb - ta;
      }
      return (order[a.milestone] || 0) - (order[b.milestone] || 0);
    });
  }

  function card(it, titles) {
    var c = el('article', 'card');
    c.setAttribute('data-id', it.id);
    c.appendChild(el('div', 'title', it.title));
    var meta = el('div', 'meta');
    meta.appendChild(el('span', 'tag', titles[it.milestone] || it.milestone));
    if (it.updated) {
      var time = el('span', 'time', rel(it.updated));
      time.setAttribute('data-updated', it.updated);
      time.title = new Date(it.updated).toLocaleString();
      meta.appendChild(time);
    }
    c.appendChild(meta);
    if (it.note) c.appendChild(el('p', 'note', it.note));
    return c;
  }

  function renderBoard(data) {
    var order = {}, titles = {};
    data.milestones.forEach(function (m, i) { order[m.id] = i; titles[m.id] = m.title; });

    // FLIP: remember where every card is, rebuild, then animate from old to new position.
    var before = {};
    var old = document.querySelectorAll('.card');
    for (var i = 0; i < old.length; i++) {
      before[old[i].getAttribute('data-id')] = old[i].getBoundingClientRect();
    }

    ['todo', 'active', 'done'].forEach(function (status) {
      var col = document.querySelector('.col[data-status="' + status + '"]');
      var items = sortItems(data.items.filter(function (it) { return it.status === status; }), order, status);
      col.querySelector('.count').textContent = String(items.length);
      var hint = col.querySelector('.hint');
      if (hint) {
        hint.hidden = items.length < 2;
        hint.textContent = items.length >= 2 ? T.parallel(items.length) : '';
      }
      var cards = col.querySelector('.cards');
      cards.textContent = '';
      if (!items.length) cards.appendChild(el('div', 'empty', T.empty));
      items.forEach(function (it) { cards.appendChild(card(it, titles)); });
    });

    var moved = [];
    var now = document.querySelectorAll('.card');
    for (var j = 0; j < now.length; j++) {
      var c = now[j];
      var prev = before[c.getAttribute('data-id')];
      if (!prev) { c.classList.add('enter'); continue; }
      var rect = c.getBoundingClientRect();
      var dx = prev.left - rect.left, dy = prev.top - rect.top;
      if (dx || dy) {
        c.style.transition = 'none';
        c.style.transform = 'translate(' + dx + 'px,' + dy + 'px)';
        moved.push(c);
      }
    }
    if (moved.length) {
      void document.body.offsetHeight; // force layout with the offset applied
      var released = false;
      var release = function () {
        if (released) return;
        released = true;
        moved.forEach(function (c) { c.style.transition = ''; c.style.transform = ''; });
      };
      requestAnimationFrame(release);
      setTimeout(release, 50); // rAF does not fire in hidden tabs
    }
  }

  function render(next) {
    snap = next;
    renderBanner();
    if (snap.data) {
      $('#project').textContent = snap.data.project;
      document.title = snap.data.project + ' \\u00b7 roadmap-live';
      renderProgress(snap.data);
      renderBoard(snap.data);
    }
    tick();
  }

  setInterval(tick, 1000);

  fetch('/data').then(function (r) { return r.json(); }).then(render).catch(function () {});

  var es = new EventSource('/events');
  es.onopen = function () { setConnected(true); };
  es.onerror = function () { setConnected(false); };
  es.addEventListener('update', function (e) {
    setConnected(true);
    render(JSON.parse(e.data));
  });
})();
</script>
</body>
</html>
`;

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

function main() {
  let opts;
  try {
    opts = parseArgs(process.argv.slice(2));
  } catch (e) {
    console.error(`roadmap-live: ${e.message}\n\n${USAGE}`);
    process.exit(2);
  }
  if (opts.help) {
    console.log(USAGE);
    return;
  }
  if (opts.check) {
    process.exit(runCheck(opts.file));
  }
  startServer(opts);
}

if (require.main === module) main();

module.exports = { validate, loadRoadmap, parseArgs };
