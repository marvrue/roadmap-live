'use strict';

// File watching and the in-memory state of the live server.

const fs = require('fs');
const { loadRoadmap, displayName } = require('./validate');

const DEBOUNCE_MS = 100;
const POLL_MS = 2000;
const MAX_CHANGES = 40;

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

function createStore(file, { log = () => {}, t = (k) => k } = {}) {
  const state = { mode: 'live', ok: false, data: null, error: null, updatedAt: null, changes: [], file: displayName(file) };
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
      log(t('cli.server.updated', { items: result.data.items.length, active: active.join(', ') || t('cli.server.none') }));
    } else {
      state.error = result.errors.join('\n');
      log(`${t('cli.server.invalid')}\n  - ${result.errors.join('\n  - ')}`);
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

module.exports = { watchFile, diffChanges, createStore, statKey };
