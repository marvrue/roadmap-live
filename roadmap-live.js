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
const MAX_CHANGES = 40;
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

// Status changes between two valid states, newest first. On the first load
// there is no previous state, so the items' own "updated" timestamps seed
// the history.
function diffChanges(prev, next, at) {
  const changes = [];
  if (!prev) {
    for (const it of next.items) {
      if (it.updated && it.status !== 'todo') {
        changes.push({ at: new Date(it.updated).toISOString(), id: it.id, title: it.title, from: null, to: it.status });
      }
    }
    return changes.sort((a, b) => Date.parse(b.at) - Date.parse(a.at));
  }
  const before = new Map(prev.items.map((it) => [it.id, it]));
  for (const it of next.items) {
    const old = before.get(it.id);
    if (!old) changes.push({ at, id: it.id, title: it.title, from: null, to: it.status });
    else if (old.status !== it.status) changes.push({ at, id: it.id, title: it.title, from: old.status, to: it.status });
  }
  return changes;
}

function createStore(file) {
  const state = { ok: false, data: null, error: null, updatedAt: null, changes: [], file: displayName(file) };
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
      const now = new Date().toISOString();
      const changes = diffChanges(state.data, result.data, now);
      state.changes = changes.concat(state.changes).slice(0, MAX_CHANGES);
      state.data = result.data;
      state.error = null;
      state.updatedAt = now;
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

const LIGHT_VARS = `
    --bg: #f7f7f5;
    --surface: #ffffff;
    --line: #e3e3df;
    --line-strong: #c9c9c3;
    --text: #17171a;
    --muted: #71716f;
    --faint: #a3a3a0;
    --track: #e6e6e2;
    --accent: #128a5c;
    --accent-ink: #0d6b47;
    --accent-soft: rgba(18, 138, 92, 0.12);
    --accent-tint: rgba(18, 138, 92, 0.05);
    --danger: #b3261e;
    --on-danger: #ffffff;`;

const DARK_VARS = `
    --bg: #121214;
    --surface: #1a1a1d;
    --line: #2a2a2e;
    --line-strong: #3a3a40;
    --text: #ededea;
    --muted: #8f8f8c;
    --faint: #5f5f5d;
    --track: #29292d;
    --accent: #3ccf8e;
    --accent-ink: #5ee0a4;
    --accent-soft: rgba(60, 207, 142, 0.16);
    --accent-tint: rgba(60, 207, 142, 0.06);
    --danger: #a8231c;
    --on-danger: #ffffff;`;

const PAGE = `<!doctype html>
<html lang="de">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>roadmap-live</title>
<link id="favicon" rel="icon" href="data:,">
<style>
  :root { color-scheme: light dark; ${LIGHT_VARS} }
  @media (prefers-color-scheme: dark) { :root:not([data-theme="light"]) { ${DARK_VARS} } }
  :root[data-theme="dark"] { ${DARK_VARS} }
  :root[data-theme="light"] { color-scheme: light; }
  :root[data-theme="dark"] { color-scheme: dark; }

  * { box-sizing: border-box; }
  html, body { margin: 0; }
  body {
    background: var(--bg);
    color: var(--text);
    font: 14px/1.45 -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
    font-variant-numeric: tabular-nums;
    padding: 0 28px 48px;
    max-width: 1280px;
    margin: 0 auto;
  }
  button { font: inherit; color: inherit; background: none; border: 0; padding: 0; cursor: pointer; }
  :focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; border-radius: 3px; }
  [hidden] { display: none !important; }

  /* banner */
  .banner {
    background: var(--danger); color: var(--on-danger);
    margin: 0 -28px 8px; padding: 10px 28px; font-size: 13px; white-space: pre-line;
  }
  .banner strong { font-weight: 600; }

  /* header */
  .top { display: flex; align-items: baseline; justify-content: space-between; gap: 16px; flex-wrap: wrap; padding: 26px 0 18px; }
  .top h1 { font-size: 22px; font-weight: 600; margin: 0; letter-spacing: -0.02em; }
  .status { display: flex; align-items: center; gap: 14px; color: var(--muted); font-size: 12px; }
  .conn { display: inline-flex; align-items: center; gap: 6px; }
  .conn i { width: 7px; height: 7px; border-radius: 50%; background: var(--faint); }
  .conn.on i { background: var(--accent); }
  .conn.off i { background: var(--danger); }
  .theme { color: var(--muted); border-bottom: 1px dotted var(--line-strong); }
  .theme:hover { color: var(--text); }

  /* progress */
  .progress { display: flex; align-items: flex-start; gap: 20px; flex-wrap: wrap; margin-bottom: 22px; }
  .segments { display: flex; gap: 3px; flex: 1 1 360px; min-width: 0; }
  .seg { flex: 1 1 0; min-width: 72px; border-radius: 4px; padding: 0 0 2px; }
  .seg[role="button"] { cursor: pointer; }
  .track { height: 8px; background: var(--track); overflow: hidden; position: relative; }
  .seg:first-child .track { border-radius: 4px 0 0 4px; }
  .seg:last-child .track { border-radius: 0 4px 4px 0; }
  .seg:only-child .track { border-radius: 4px; }
  .fill { height: 100%; background: var(--accent); transition: width 0.5s cubic-bezier(0.2, 0.7, 0.2, 1); }
  .seg.is-done .fill { opacity: 0.55; }
  .seg.is-current .track { box-shadow: inset 0 0 0 1px var(--accent); }
  .seg.just-done .fill { animation: sweep 1.2s ease; }
  @keyframes sweep { 0% { filter: brightness(1); } 30% { filter: brightness(1.6); } 100% { filter: brightness(1); } }
  .seg .label { display: flex; align-items: center; gap: 6px; margin-top: 7px; font-size: 12px; color: var(--muted); line-height: 1.3; }
  .seg .name { color: var(--text); font-weight: 500; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .seg.is-current .name { color: var(--accent-ink); }
  .seg.is-done .name { color: var(--muted); font-weight: 400; }
  .seg svg { width: 12px; height: 12px; color: var(--accent); flex: none; }
  .seg:hover .name { text-decoration: underline; text-decoration-color: var(--line-strong); text-underline-offset: 3px; }
  .seg.is-filter .name { text-decoration: underline; text-decoration-color: var(--accent); text-underline-offset: 3px; }
  .total { text-align: right; line-height: 1.3; }
  .total .big { font-size: 15px; color: var(--muted); white-space: nowrap; }
  .total .big b { color: var(--text); font-weight: 600; }
  .total .today { font-size: 12px; color: var(--muted); }

  /* now + history */
  .live { display: grid; grid-template-columns: minmax(0, 3fr) minmax(240px, 2fr); gap: 16px; margin-bottom: 28px; }
  .now { border: 1px solid var(--line); border-radius: 10px; padding: 18px 20px; background: var(--surface); position: relative; }
  .now.has-active { border-color: var(--accent); background: var(--accent-tint); }
  .now .eyebrow { display: flex; align-items: center; gap: 8px; font-size: 12px; color: var(--muted); margin-bottom: 10px; }
  .now .dot { width: 8px; height: 8px; border-radius: 50%; background: var(--accent); }
  .now.has-active .dot { animation: breathe 2.2s ease-in-out infinite; }
  @keyframes breathe { 0%, 100% { box-shadow: 0 0 0 0 var(--accent-soft); } 50% { box-shadow: 0 0 0 6px var(--accent-soft); } }
  .now .item + .item { border-top: 1px solid var(--line); margin-top: 14px; padding-top: 14px; }
  .now .head { display: flex; align-items: baseline; justify-content: space-between; gap: 16px; }
  .now .title { font-size: 22px; font-weight: 600; letter-spacing: -0.02em; line-height: 1.2; overflow-wrap: anywhere; }
  .now .elapsed { font-size: 22px; font-weight: 500; color: var(--accent-ink); white-space: nowrap; letter-spacing: -0.01em; }
  .now .elapsed small { font-size: 12px; font-weight: 400; color: var(--muted); margin-right: 5px; letter-spacing: 0; }
  .now .sub { margin-top: 6px; color: var(--muted); font-size: 13px; display: flex; gap: 10px; flex-wrap: wrap; }
  .now .note { margin: 8px 0 0; font-size: 14px; color: var(--text); overflow-wrap: anywhere; max-width: 70ch; }
  .now .idle { font-size: 16px; color: var(--muted); }
  .now .idle b { color: var(--text); font-weight: 500; }
  .history { border: 1px solid var(--line); border-radius: 10px; padding: 14px 16px 8px; min-height: 0; }
  .history h2 { font-size: 12px; font-weight: 500; color: var(--muted); margin: 0 0 8px; }
  .history ul { list-style: none; margin: 0; padding: 0; max-height: 168px; overflow-y: auto; scrollbar-width: thin; scrollbar-color: var(--line-strong) transparent; }
  .history li { display: grid; grid-template-columns: 1fr auto; column-gap: 12px; padding: 5px 0; border-top: 1px solid var(--line); font-size: 13px; }
  .history li:first-child { border-top: 0; }
  .history .what { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .history .what em { font-style: normal; color: var(--muted); }
  .history .what.done em { color: var(--accent-ink); }
  .history .when { color: var(--faint); font-size: 12px; white-space: nowrap; }
  .history .none { color: var(--faint); font-size: 13px; padding: 4px 0 8px; }

  /* board */
  .filterbar { display: flex; align-items: center; gap: 10px; font-size: 13px; color: var(--muted); margin-bottom: 10px; }
  .filterbar button { color: var(--accent-ink); }
  .filterbar button:hover { text-decoration: underline; }
  .board { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 20px; }
  .col { min-width: 0; }
  .col > header { display: flex; align-items: baseline; gap: 8px; padding-bottom: 8px; border-bottom: 2px solid var(--line-strong); margin-bottom: 4px; }
  .col.active > header { border-bottom-color: var(--accent); }
  .col h2 { font-size: 14px; font-weight: 600; margin: 0; }
  .col .count { font-size: 13px; color: var(--muted); }
  .col .hint { font-size: 12px; color: var(--muted); margin-left: auto; }
  .cards { display: flex; flex-direction: column; }
  .empty { color: var(--faint); font-size: 13px; padding: 12px 0; }

  .card {
    position: relative;
    padding: 10px 10px 10px 14px;
    border-bottom: 1px solid var(--line);
    transition: transform 0.4s cubic-bezier(0.2, 0.7, 0.2, 1), opacity 0.3s ease, background-color 0.3s ease;
    will-change: transform;
  }
  .card::before { content: ""; position: absolute; left: 0; top: 10px; bottom: 10px; width: 3px; border-radius: 2px; background: var(--line-strong); }
  .card.enter { animation: enter 0.35s ease; }
  @keyframes enter { from { opacity: 0; transform: translateY(4px); } to { opacity: 1; transform: none; } }
  .card.flash { animation: flash 1.6s ease; }
  @keyframes flash { 0% { background: var(--accent-soft); } 100% { background: transparent; } }
  .card .title { font-weight: 500; overflow-wrap: anywhere; }
  .card .meta { display: flex; align-items: center; gap: 8px; margin-top: 4px; font-size: 12px; color: var(--muted); flex-wrap: wrap; }
  .card .tag { color: var(--muted); }
  .card .note { margin: 5px 0 0; color: var(--muted); font-size: 13px; overflow-wrap: anywhere; }
  .col.active .card { background: var(--accent-tint); border-radius: 8px; border-bottom: 0; margin-bottom: 6px; padding: 12px 12px 12px 16px; }
  .col.active .card::before { background: var(--accent); top: 12px; bottom: 12px; animation: pulse 2.2s ease-in-out infinite; }
  @keyframes pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.45; } }
  .col.done .card { padding-top: 7px; padding-bottom: 7px; }
  .col.done .card::before { background: var(--accent); opacity: 0.4; top: 7px; bottom: 7px; }
  .col.done .card .title { font-weight: 400; color: var(--muted); }
  .col.done .card .meta { margin-top: 1px; }
  .col.done .card .note { display: none; }

  @media (prefers-reduced-motion: reduce) {
    .card, .fill { transition: none; }
    .card.enter, .card.flash, .col.active .card::before, .now .dot, .seg.just-done .fill { animation: none; }
  }
  @media (max-width: 900px) {
    .live { grid-template-columns: 1fr; }
    .history ul { max-height: 120px; }
  }
  @media (max-width: 760px) {
    body { padding: 0 16px 32px; }
    .banner { margin: 0 -16px 8px; padding: 10px 16px; }
    .board { grid-template-columns: 1fr; }
    .now .title, .now .elapsed { font-size: 19px; }
    .total { text-align: left; }
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
    <button id="theme" class="theme" type="button" title="Farbschema wechseln">Auto</button>
  </div>
</header>
<section class="progress">
  <div id="segments" class="segments"></div>
  <div class="total"><div id="total" class="big"></div><div id="today" class="today"></div></div>
</section>
<section class="live">
  <div id="now" class="now"></div>
  <aside class="history">
    <h2>Verlauf</h2>
    <ul id="history"></ul>
  </aside>
</section>
<div id="filterbar" class="filterbar" hidden><span id="filtertext"></span><button id="clearfilter" type="button">alle anzeigen</button></div>
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
    inProgress: 'In Arbeit',
    inProgressN: function (n) { return n + ' Items parallel in Arbeit'; },
    since: 'seit',
    idle: 'Gerade ist nichts in Arbeit.',
    next: 'Als Nächstes: ',
    allDone: 'Alles erledigt.',
    parallel: function (n) { return n + ' parallel'; },
    todayDone: function (n) { return n === 1 ? '1 heute erledigt' : n + ' heute erledigt'; },
    onlyMilestone: function (t) { return 'Nur ' + t; },
    noHistory: 'Noch keine Änderungen.',
    change: { done: 'erledigt', active: 'begonnen', todo: 'zurückgestellt', added: 'neu' },
    theme: { auto: 'Auto', light: 'Hell', dark: 'Dunkel' },
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
  var prevStatus = null;      // item id -> status of the previous snapshot
  var prevComplete = null;    // milestone id -> complete? of the previous snapshot
  var filter = null;          // milestone id or null
  var unseen = false;         // changed while the tab was hidden

  function plural(n, one, many) { return n + ' ' + (n === 1 ? one : many); }
  function pad(n) { return (n < 10 ? '0' : '') + n; }

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

  function relFine(iso) {
    var t = Date.parse(iso);
    if (isNaN(t)) return '';
    var s = Math.max(0, Math.round((Date.now() - t) / 1000));
    if (s < 60) return 'vor ' + plural(s, 'Sekunde', 'Sekunden');
    return rel(iso);
  }

  function elapsed(iso) {
    var t = Date.parse(iso);
    if (isNaN(t)) return '';
    var s = Math.max(0, Math.floor((Date.now() - t) / 1000));
    var h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), sec = s % 60;
    return (h ? h + ':' + pad(m) : m) + ':' + pad(sec);
  }

  function isToday(iso) {
    var d = new Date(iso), n = new Date();
    return d.getFullYear() === n.getFullYear() && d.getMonth() === n.getMonth() && d.getDate() === n.getDate();
  }

  // ---- theme -------------------------------------------------------------
  var THEMES = ['auto', 'light', 'dark'];
  function applyTheme(t) {
    if (t === 'auto') document.documentElement.removeAttribute('data-theme');
    else document.documentElement.setAttribute('data-theme', t);
    $('#theme').textContent = T.theme[t];
    try { localStorage.setItem('roadmap-live-theme', t); } catch (e) { /* ignore */ }
  }
  var theme = 'auto';
  try { theme = localStorage.getItem('roadmap-live-theme') || 'auto'; } catch (e) { /* ignore */ }
  if (THEMES.indexOf(theme) < 0) theme = 'auto';
  applyTheme(theme);
  $('#theme').addEventListener('click', function () {
    theme = THEMES[(THEMES.indexOf(theme) + 1) % THEMES.length];
    applyTheme(theme);
  });

  // ---- favicon: a progress ring ------------------------------------------
  function drawFavicon(pct) {
    var c = document.createElement('canvas');
    c.width = c.height = 64;
    var ctx = c.getContext('2d');
    if (!ctx) return;
    var accent = getComputedStyle(document.documentElement).getPropertyValue('--accent').trim() || '#128a5c';
    ctx.lineWidth = 10;
    ctx.lineCap = 'round';
    ctx.strokeStyle = 'rgba(128,128,128,0.35)';
    ctx.beginPath(); ctx.arc(32, 32, 24, 0, Math.PI * 2); ctx.stroke();
    if (pct > 0) {
      ctx.strokeStyle = accent;
      ctx.beginPath(); ctx.arc(32, 32, 24, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * pct / 100); ctx.stroke();
    }
    $('#favicon').href = c.toDataURL('image/png');
  }

  function setTitle() {
    if (!snap || !snap.data) return;
    var items = snap.data.items;
    var done = items.filter(function (it) { return it.status === 'done'; }).length;
    var pct = items.length ? Math.round(100 * done / items.length) : 0;
    document.title = (unseen ? '\\u25cf ' : '') + pct + ' % \\u00b7 ' + snap.data.project;
  }
  document.addEventListener('visibilitychange', function () {
    if (document.visibilityState === 'visible') { unseen = false; setTitle(); }
  });

  function setConnected(on) {
    var c = $('#conn');
    c.className = 'conn ' + (on ? 'on' : 'off');
    c.lastChild.textContent = on ? T.connected : T.disconnected;
  }

  // ---- per-second updates ------------------------------------------------
  function tick() {
    if (!snap) return;
    $('#updated').textContent = snap.updatedAt ? T.updated + relFine(snap.updatedAt) : T.noData;
    var i, nodes;
    nodes = document.querySelectorAll('[data-updated]');
    for (i = 0; i < nodes.length; i++) nodes[i].textContent = rel(nodes[i].getAttribute('data-updated'));
    nodes = document.querySelectorAll('[data-since]');
    for (i = 0; i < nodes.length; i++) nodes[i].lastChild.textContent = elapsed(nodes[i].getAttribute('data-since'));
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

  // ---- progress bar ------------------------------------------------------
  function renderProgress(data) {
    var info = milestoneStats(data);
    var wrap = $('#segments');
    wrap.textContent = '';
    var nowComplete = {};
    info.stats.forEach(function (s) {
      nowComplete[s.m.id] = s.complete;
      var seg = el('div', 'seg' + (s.complete ? ' is-done' : '') + (s === info.current ? ' is-current' : '') + (filter === s.m.id ? ' is-filter' : ''));
      if (prevComplete && s.complete && !prevComplete[s.m.id]) seg.classList.add('just-done');
      seg.style.flexGrow = String(Math.max(s.total, 1));
      seg.setAttribute('role', 'button');
      seg.setAttribute('tabindex', '0');
      seg.setAttribute('aria-pressed', filter === s.m.id ? 'true' : 'false');
      seg.title = s.m.title + ': ' + s.done + ' von ' + s.total + ' erledigt';
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
      var toggle = function () { setFilter(filter === s.m.id ? null : s.m.id); };
      seg.addEventListener('click', toggle);
      seg.addEventListener('keydown', function (e) { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); toggle(); } });
      wrap.appendChild(seg);
    });
    prevComplete = nowComplete;

    var total = data.items.length;
    var done = data.items.filter(function (it) { return it.status === 'done'; }).length;
    var pct = total ? Math.round(100 * done / total) : 0;
    var t = $('#total');
    t.textContent = '';
    t.appendChild(el('b', null, done + '/' + total));
    t.appendChild(document.createTextNode(' \\u00b7 ' + pct + ' %'));
    var today = data.items.filter(function (it) { return it.status === 'done' && it.updated && isToday(it.updated); }).length;
    $('#today').textContent = today ? T.todayDone(today) : '';
    drawFavicon(pct);
  }

  // ---- "now" panel -------------------------------------------------------
  function renderNow(data, titles) {
    var box = $('#now');
    box.textContent = '';
    var active = data.items.filter(function (it) { return it.status === 'active'; });
    box.classList.toggle('has-active', active.length > 0);
    var eyebrow = el('div', 'eyebrow');
    eyebrow.appendChild(el('span', 'dot'));
    if (active.length) {
      eyebrow.appendChild(el('span', null, active.length === 1 ? T.inProgress : T.inProgressN(active.length)));
      box.appendChild(eyebrow);
      active.forEach(function (it) {
        var item = el('div', 'item');
        var head = el('div', 'head');
        head.appendChild(el('div', 'title', it.title));
        if (it.updated) {
          var e = el('div', 'elapsed');
          e.setAttribute('data-since', it.updated);
          e.appendChild(el('small', null, T.since));
          e.appendChild(document.createTextNode(elapsed(it.updated)));
          head.appendChild(e);
        }
        item.appendChild(head);
        var sub = el('div', 'sub');
        sub.appendChild(el('span', null, titles[it.milestone] || it.milestone));
        if (it.updated) {
          var when = el('span', null, rel(it.updated));
          when.setAttribute('data-updated', it.updated);
          sub.appendChild(when);
        }
        item.appendChild(sub);
        if (it.note) item.appendChild(el('p', 'note', it.note));
        box.appendChild(item);
      });
    } else {
      var info = milestoneStats(data);
      var next = null;
      if (info.current) {
        next = data.items.filter(function (it) { return it.status === 'todo' && it.milestone === info.current.m.id; })[0] || null;
      }
      eyebrow.appendChild(el('span', null, next ? T.idle : T.allDone));
      box.appendChild(eyebrow);
      var idle = el('div', 'idle');
      if (next) {
        idle.appendChild(document.createTextNode(T.next));
        idle.appendChild(el('b', null, next.title));
      } else if (data.items.length) {
        idle.textContent = data.milestones.length + ' ' + (data.milestones.length === 1 ? 'Meilenstein' : 'Meilensteine') + ', ' + data.items.length + ' Items.';
      } else {
        idle.textContent = T.empty;
      }
      box.appendChild(idle);
    }
  }

  // ---- history -----------------------------------------------------------
  function renderHistory(changes) {
    var list = $('#history');
    list.textContent = '';
    if (!changes || !changes.length) { list.appendChild(el('li', 'none', T.noHistory)); return; }
    changes.forEach(function (c) {
      var li = el('li');
      var kind = c.from === null && c.to !== 'done' && c.to !== 'active' ? 'added' : c.to;
      var what = el('span', 'what ' + kind);
      what.appendChild(document.createTextNode(c.title + ' '));
      what.appendChild(el('em', null, T.change[kind] || c.to));
      what.title = c.title + ': ' + (c.from || '\\u2013') + ' \\u2192 ' + c.to;
      var when = el('span', 'when', rel(c.at));
      when.setAttribute('data-updated', c.at);
      li.appendChild(what);
      li.appendChild(when);
      list.appendChild(li);
    });
  }

  // ---- board -------------------------------------------------------------
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

  function card(it, titles, changed) {
    var c = el('article', 'card' + (changed ? ' flash' : ''));
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
    if (it.note) {
      c.appendChild(el('p', 'note', it.note));
      if (it.status === 'done') c.title = it.note;
    }
    return c;
  }

  function renderBoard(data, titles, order) {
    // FLIP: remember where every card is, rebuild, then animate from old to new position.
    var before = {};
    var old = document.querySelectorAll('.card');
    for (var i = 0; i < old.length; i++) before[old[i].getAttribute('data-id')] = old[i].getBoundingClientRect();

    var visible = filter ? data.items.filter(function (it) { return it.milestone === filter; }) : data.items;
    ['todo', 'active', 'done'].forEach(function (status) {
      var col = document.querySelector('.col[data-status="' + status + '"]');
      var items = sortItems(visible.filter(function (it) { return it.status === status; }), order, status);
      col.querySelector('.count').textContent = String(items.length);
      var hint = col.querySelector('.hint');
      if (hint) { hint.hidden = items.length < 2; hint.textContent = items.length >= 2 ? T.parallel(items.length) : ''; }
      var cards = col.querySelector('.cards');
      cards.textContent = '';
      if (!items.length) cards.appendChild(el('div', 'empty', T.empty));
      items.forEach(function (it) {
        var changed = prevStatus && prevStatus[it.id] !== undefined && prevStatus[it.id] !== it.status;
        cards.appendChild(card(it, titles, changed));
      });
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

  function setFilter(id) {
    filter = id;
    if (snap && snap.data) render(snap);
  }
  $('#clearfilter').addEventListener('click', function () { setFilter(null); });
  document.addEventListener('keydown', function (e) { if (e.key === 'Escape' && filter) setFilter(null); });

  function renderFilterbar(titles) {
    var bar = $('#filterbar');
    if (filter && titles[filter]) {
      $('#filtertext').textContent = T.onlyMilestone(titles[filter]);
      bar.hidden = false;
    } else {
      if (filter) filter = null; // milestone disappeared
      bar.hidden = true;
    }
  }

  function render(next) {
    var isNew = snap !== next;
    snap = next;
    renderBanner();
    if (snap.data) {
      var order = {}, titles = {};
      snap.data.milestones.forEach(function (m, i) { order[m.id] = i; titles[m.id] = m.title; });
      $('#project').textContent = snap.data.project;
      renderProgress(snap.data);
      renderNow(snap.data, titles);
      renderHistory(snap.changes);
      renderFilterbar(titles);
      renderBoard(snap.data, titles, order);
      if (isNew) {
        var status = {};
        snap.data.items.forEach(function (it) { status[it.id] = it.status; });
        var changedAny = prevStatus !== null && snap.data.items.some(function (it) { return prevStatus[it.id] !== it.status; });
        if (changedAny && document.visibilityState === 'hidden') unseen = true;
        prevStatus = status;
      }
      setTitle();
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

module.exports = { validate, loadRoadmap, parseArgs, diffChanges };
