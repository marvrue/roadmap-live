'use strict';

// File watching and the in-memory state of the live server.

const fs = require('fs');
const path = require('path');
const { loadRoadmap, displayName } = require('./validate');
const { gitState } = require('./git-state');

const DEBOUNCE_MS = 100;
const POLL_MS = 2000;
const MAX_CHANGES = 40;
const MAX_COMMENT_CHARS = 2000;
const GIT_POLL_MS = 5000;

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

// Appends a human comment to an item. Re-reads the file so a concurrent
// change by the agent is not lost, then writes atomically (temp + rename).
function appendComment(file, id, text, now = new Date().toISOString()) {
  if (typeof text !== 'string' || !text.trim()) return { ok: false, status: 400, error: 'text must be a non-empty string' };
  if (text.length > MAX_COMMENT_CHARS) return { ok: false, status: 413, error: `text must be at most ${MAX_COMMENT_CHARS} characters` };
  const result = loadRoadmap(file);
  if (!result.ok) return { ok: false, status: 409, error: result.errors.join('; ') };
  const item = result.data.items.find((it) => it.id === id);
  if (!item) return { ok: false, status: 400, error: `unknown item: ${id}` };
  if (!Array.isArray(item.comments)) item.comments = [];
  item.comments.push({ from: 'human', text: text.trim(), at: now });
  const tmp = `${file}.${process.pid}.tmp`;
  try {
    fs.writeFileSync(tmp, `${JSON.stringify(result.data, null, 2)}\n`);
    fs.renameSync(tmp, file);
  } catch (e) {
    try { fs.unlinkSync(tmp); } catch { /* ignore */ }
    return { ok: false, status: 500, error: e.message };
  }
  return { ok: true };
}

function createStore(file, { log = () => {}, t = (k) => k, gitDir = path.dirname(file) } = {}) {
  const state = { mode: 'live', ok: false, data: null, error: null, updatedAt: null, changes: [], file: displayName(file), git: null };
  const listeners = new Set();
  let lastRaw;
  let lastOk;

  const snapshot = () => ({ ...state });

  const notify = () => { for (const fn of listeners) fn(snapshot()); };

  // Async (execFile, not spawnSync) so a slow git call never blocks the
  // event loop. Guarded against overlapping runs with inFlight.
  let gitInFlight = false;
  const refreshGit = async () => {
    if (gitInFlight) return false;
    gitInFlight = true;
    try {
      const next = await gitState(gitDir);
      if (JSON.stringify(next) === JSON.stringify(state.git)) return false;
      state.git = next;
      return true;
    } finally {
      gitInFlight = false;
    }
  };

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
    // The snapshot goes out with the previous git value; a changed git state
    // triggers its own notify once the (async) refresh resolves.
    notify();
    refreshGit().then((changed) => { if (changed) notify(); });
  };

  reload();
  const stop = watchFile(file, reload);

  const gitTimer = setInterval(() => { refreshGit().then((changed) => { if (changed) notify(); }); }, GIT_POLL_MS);
  gitTimer.unref();

  return {
    snapshot,
    subscribe: (fn) => { listeners.add(fn); return () => listeners.delete(fn); },
    addComment: (id, text) => {
      const r = appendComment(file, id, text);
      if (r.ok) reload();
      return r;
    },
    refreshGit,
    stop: () => { clearInterval(gitTimer); stop(); },
  };
}

module.exports = { watchFile, diffChanges, createStore, statKey, appendComment, MAX_COMMENT_CHARS };
