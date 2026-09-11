# Feedback Channel Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let the human write comments and answer the agent's questions on the live page, stored in `roadmap.json`, with the git branch shown per item and in the header.

**Architecture:** Two optional item fields (`comments`, `question`) plus `branch` in `roadmap.json`, validated in `src/validate.js`. The live server gets `POST /comment` that appends a human comment with an atomic write, and a `git` block in every snapshot from a new `src/git-state.js`. The shared renderer `src/page/view.js` draws a "Waiting for you" block, expandable conversations per item and the git header; `src/page/page.js` sends comments through one function. The static page renders everything read-only.

**Tech Stack:** Node 18+, no dependencies, `node:test`, existing `src/page/view.js` UMD renderer, SSE.

**Spec:** `docs/superpowers/specs/2026-09-10-feedback-channel-design.md`

## Global Constraints

- Zero runtime dependencies. Node >= 18. CommonJS.
- `src/page/view.js` runs in Node and the browser: no Node APIs, ES2017 syntax, `var` style like the rest of the file.
- All UI strings come from `src/locales/en.json` and `src/locales/de.json`; both files must have identical key sets (`test/i18n.test.js` enforces it).
- `src/page/page.css` never contains a color or font name (`test/render.test.js` enforces it). One attention color, hairlines, two font weights, no cards.
- Sentence case, no exclamation marks in any UI text.
- `roadmap.json` is written with two-space indentation, existing key order, trailing newline. New item keys are appended at the end of the item.
- Sync (`src/apply.js`, `src/sync.js`) never touches `comments` or `question`.
- Render snapshots live in `test/snapshots/*.html`; regenerate with `UPDATE_SNAPSHOTS=1 node --test test/render.test.js` after a deliberate page change, and only then.
- Every commit message ends with `Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>`.
- Work on branch `feat/feedback-channel` (already exists, branched from `main`). PR #2 (`feat/theme-switch`) changes `src/server.js` `page()` and `src/render.js`; if it merges while this work is in progress, merge `main` into this branch before Task 3 and keep the `renderPage(snap, { theme, baseDir, ... })` form from PR #2.

---

## File map

| File | Responsibility in this plan |
|---|---|
| `src/validate.js` | accept and check `comments`, `question`, `branch` |
| `src/cli.js` | 200 KB size warning in `--check` |
| `src/git-state.js` (new) | `gitState(dir, exec)` → `{ branch, ahead, changed }` or `null` |
| `src/store.js` | `appendComment(file, id, text, now)`, git state in the snapshot |
| `src/server.js` | `POST /comment`, `close()` for tests |
| `src/apply.js` | `branch` from the PR when linking |
| `src/page/view.js` | waiting block, conversations, git header, branch subline, feed rows |
| `src/page/page.js` | expand toggle, `sendComment`, pending markers |
| `src/page/page.css` | styles for the above |
| `src/locales/{en,de}.json` | new strings |
| `AGENTS.md`, `README.md`, `DECISIONS.md` | rules and docs |
| `test/validate.test.js`, `test/git-state.test.js` (new), `test/server.test.js` (new), `test/apply.test.js`, `test/render.test.js`, `test/fixtures/demo-roadmap.json` | tests |

---

### Task 1: Validator accepts comments, question and branch

**Files:**
- Modify: `src/validate.js:111` (after `checkPrs(errors, it.prs, ...)`)
- Modify: `src/cli.js` (`runCheck`)
- Modify: `src/locales/en.json`, `src/locales/de.json` (key `cli.checkLarge`)
- Test: `test/validate.test.js`

**Interfaces:**
- Produces: `validate(data)` accepts `item.comments: [{from:'human'|'agent', text, at}]`, `item.question: {text, options?, asked}`, `item.branch: string`. Exports `LARGE_FILE_BYTES = 200 * 1024`.

- [ ] **Step 1: Write the failing tests**

Append to `test/validate.test.js`:

```js
test('comments, question and branch are valid when well formed', () => {
  const data = fixture('roadmap-base.json');
  data.items[0].branch = 'feat/listing';
  data.items[0].comments = [
    { from: 'human', text: 'Finish the cart first', at: '2026-09-11T08:10:00Z' },
    { from: 'agent', text: 'Ok, cart first.', at: '2026-09-11T08:32:00Z' },
  ];
  data.items[0].question = { text: 'Hold copies for 15 or 30 minutes?', options: ['15', '30'], asked: '2026-09-11T08:32:00Z' };
  data.items[1].question = { text: 'Which font?', asked: '2026-09-11T08:32:00Z' };
  assert.deepStrictEqual(validate(data), []);
});

test('rejects malformed comments, question and branch', () => {
  const data = fixture('roadmap-base.json');
  data.items[0].branch = '';
  data.items[0].comments = [
    { from: 'bot', text: 'x', at: '2026-09-11T08:10:00Z' },
    { from: 'human', text: '', at: '2026-09-11T08:10:00Z' },
    { from: 'human', text: 'ok', at: 'yesterday' },
    'not an object',
  ];
  data.items[1].question = { text: '', options: [], asked: 'nope' };
  data.items[2].question = { text: 'q', options: ['a', 'b', 'c', 'd', 'e'], asked: '2026-09-11T08:10:00Z' };
  data.items[3].question = 'just a string';
  const errors = validate(data);
  assert.ok(errors.some((e) => e.includes('branch must be a non-empty string')));
  assert.ok(errors.some((e) => e.includes('comments[0].from must be "human" or "agent"')));
  assert.ok(errors.some((e) => e.includes('comments[1].text must be a non-empty string')));
  assert.ok(errors.some((e) => e.includes('comments[2].at must be an ISO 8601')));
  assert.ok(errors.some((e) => e.includes('comments[3] must be an object')));
  assert.ok(errors.some((e) => e.includes('question.text must be a non-empty string')));
  assert.ok(errors.some((e) => e.includes('question.options must have 1 to 4 entries')));
  assert.ok(errors.some((e) => e.includes('question.asked must be an ISO 8601')));
  assert.ok(errors.some((e) => e.includes('items[2] ("payment").question.options must have 1 to 4 entries')));
  assert.ok(errors.some((e) => e.includes('items[3] ("order-queue").question must be an object')));
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `node --test test/validate.test.js`
Expected: the second new test FAILS (no errors are produced for the malformed fields yet).

- [ ] **Step 3: Implement validation**

In `src/validate.js`, add after `validateOpenPoints`:

```js
const COMMENT_AUTHORS = ['human', 'agent'];
const LARGE_FILE_BYTES = 200 * 1024;

function validateComments(errors, comments, where) {
  if (comments === undefined) return;
  if (!Array.isArray(comments)) return errors.push(`${where} must be an array`);
  comments.forEach((c, i) => {
    const w = `${where}[${i}]`;
    if (!isObject(c)) return errors.push(`${w} must be an object`);
    if (!COMMENT_AUTHORS.includes(c.from)) errors.push(`${w}.from must be "human" or "agent"`);
    if (!isText(c.text)) errors.push(`${w}.text must be a non-empty string`);
    checkDate(errors, c.at, `${w}.at`, false);
  });
}

function validateQuestion(errors, q, where) {
  if (q === undefined) return;
  if (!isObject(q)) return errors.push(`${where} must be an object`);
  if (!isText(q.text)) errors.push(`${where}.text must be a non-empty string`);
  if (q.options !== undefined) {
    if (!Array.isArray(q.options) || q.options.length < 1 || q.options.length > 4 || !q.options.every(isText)) {
      errors.push(`${where}.options must have 1 to 4 entries, each a non-empty string`);
    }
  }
  checkDate(errors, q.asked, `${where}.asked`, false);
}
```

In the items loop, after `validateOpenPoints(errors, it.open_points, ...)`:

```js
      if (it.branch !== undefined && !isText(it.branch)) errors.push(`${label}.branch must be a non-empty string`);
      validateComments(errors, it.comments, `${label}.comments`);
      validateQuestion(errors, it.question, `${label}.question`);
```

Add `LARGE_FILE_BYTES` and `COMMENT_AUTHORS` to `module.exports`.

- [ ] **Step 4: Size warning in `--check`**

In `src/cli.js`, import `LARGE_FILE_BYTES` from `./validate` and in `runCheck`, inside the `if (result.ok)` branch after the parallel note:

```js
    const bytes = Buffer.byteLength(result.raw, 'utf8');
    if (bytes > LARGE_FILE_BYTES) console.log(t('cli.checkLarge', { file: name, kb: Math.round(bytes / 1024) }));
```

Add to `src/locales/en.json` under `cli`, after `checkParallel`:

```json
    "checkLarge": "note: {file} is {kb} KB, trim old comments and notes so the agent reads less",
```

And to `src/locales/de.json`:

```json
    "checkLarge": "Hinweis: {file} ist {kb} KB groß, kürze alte Kommentare und Notizen, damit der Agent weniger liest",
```

Add a test to `test/validate.test.js` for the warning:

```js
test('--check warns above 200 KB', () => {
  const { runCheck } = require('../src/cli');
  const fs = require('fs');
  const path = require('path');
  const { tmpDir } = require('./helpers');
  const data = fixture('roadmap-base.json');
  data.items[0].comments = Array.from({ length: 3000 }, (_, i) => ({ from: 'human', text: `comment number ${i} with some padding text to make it long`, at: '2026-09-11T08:10:00Z' }));
  const file = path.join(tmpDir(), 'roadmap.json');
  fs.writeFileSync(file, JSON.stringify(data, null, 2));
  const logs = [];
  const orig = console.log;
  console.log = (l) => logs.push(l);
  try { assert.strictEqual(runCheck(file, { LANG: 'C' }), 0); } finally { console.log = orig; }
  assert.ok(logs.some((l) => l.includes('KB, trim old comments')));
});
```

- [ ] **Step 5: Run the tests**

Run: `npm test`
Expected: all pass, including `test/i18n.test.js` (both locales have `cli.checkLarge`).

- [ ] **Step 6: Commit**

```bash
git add src/validate.js src/cli.js src/locales/en.json src/locales/de.json test/validate.test.js
git commit -m "Validate comments, question and branch on items; warn on large files

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 2: Git state module

**Files:**
- Create: `src/git-state.js`
- Test: `test/git-state.test.js`

**Interfaces:**
- Produces: `gitState(dir, exec = spawnSync)` → `{ branch: string, ahead: number|null, changed: number }` or `null` when `dir` is not inside a git repository or git is missing. `branch` is `'HEAD'` when detached.

- [ ] **Step 1: Write the failing test**

Create `test/git-state.test.js`:

```js
'use strict';

const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');
const { gitState } = require('../src/git-state');
const { tmpDir } = require('./helpers');

function git(dir, ...args) {
  const r = spawnSync('git', args, { cwd: dir, encoding: 'utf8' });
  assert.strictEqual(r.status, 0, `git ${args.join(' ')}: ${r.stderr}`);
  return r.stdout.trim();
}

function repo() {
  const dir = tmpDir();
  git(dir, 'init', '-q', '-b', 'main');
  git(dir, 'config', 'user.email', 'test@example.com');
  git(dir, 'config', 'user.name', 'test');
  fs.writeFileSync(path.join(dir, 'a.txt'), 'a\n');
  git(dir, 'add', 'a.txt');
  git(dir, 'commit', '-q', '-m', 'first');
  return dir;
}

test('branch, commits ahead of main and changed files', () => {
  const dir = repo();
  assert.deepStrictEqual(gitState(dir), { branch: 'main', ahead: 0, changed: 0 });
  git(dir, 'checkout', '-q', '-b', 'feat/x');
  fs.writeFileSync(path.join(dir, 'b.txt'), 'b\n');
  git(dir, 'add', 'b.txt');
  git(dir, 'commit', '-q', '-m', 'second');
  fs.writeFileSync(path.join(dir, 'a.txt'), 'changed\n');
  fs.writeFileSync(path.join(dir, 'c.txt'), 'new\n');
  assert.deepStrictEqual(gitState(dir), { branch: 'feat/x', ahead: 1, changed: 2 });
});

test('ahead is null without a main branch, HEAD when detached', () => {
  const dir = tmpDir();
  git(dir, 'init', '-q', '-b', 'trunk');
  git(dir, 'config', 'user.email', 'test@example.com');
  git(dir, 'config', 'user.name', 'test');
  fs.writeFileSync(path.join(dir, 'a.txt'), 'a\n');
  git(dir, 'add', 'a.txt');
  git(dir, 'commit', '-q', '-m', 'first');
  assert.deepStrictEqual(gitState(dir), { branch: 'trunk', ahead: null, changed: 0 });
  git(dir, 'checkout', '-q', '--detach');
  assert.strictEqual(gitState(dir).branch, 'HEAD');
});

test('null outside a repository or without git', () => {
  assert.strictEqual(gitState(tmpDir()), null);
  assert.strictEqual(gitState(process.cwd(), () => { throw new Error('ENOENT'); }), null);
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `node --test test/git-state.test.js`
Expected: FAIL with "Cannot find module '../src/git-state'".

- [ ] **Step 3: Implement**

Create `src/git-state.js`:

```js
'use strict';

// Where the working copy is: branch, commits ahead of main, changed files.
// Shown in the header of the live page. Never throws; null outside git.

const { spawnSync } = require('child_process');

const TIMEOUT_MS = 2000;

function gitState(dir, exec = spawnSync) {
  const run = (args) => {
    try {
      const r = exec('git', args, { cwd: dir, encoding: 'utf8', timeout: TIMEOUT_MS, stdio: ['ignore', 'pipe', 'ignore'] });
      return r && r.status === 0 ? String(r.stdout).trim() : null;
    } catch {
      return null;
    }
  };
  const branch = run(['branch', '--show-current']);
  if (branch === null) return null;
  const aheadRaw = run(['rev-list', '--count', 'main..HEAD']);
  const ahead = aheadRaw !== null && /^\d+$/.test(aheadRaw) ? Number(aheadRaw) : null;
  const status = run(['status', '--porcelain']);
  const changed = status === null ? 0 : status.split('\n').filter(Boolean).length;
  return { branch: branch || 'HEAD', ahead, changed };
}

module.exports = { gitState };
```

Note: `git branch --show-current` exits 0 with empty output when detached, and non-zero outside a repository.

- [ ] **Step 4: Run the test**

Run: `node --test test/git-state.test.js`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add src/git-state.js test/git-state.test.js
git commit -m "Add git-state: branch, commits ahead of main, changed files

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 3: Store appends comments atomically and carries git state

**Files:**
- Modify: `src/store.js` (`createStore`, new `appendComment`)
- Test: `test/server.test.js` (new, store part)

**Interfaces:**
- Consumes: `gitState(dir)` from Task 2.
- Produces: `appendComment(file, id, text, now)` → `{ ok: true }` or `{ ok: false, status: 400|409|413, error }`. `createStore(file, { log, t, gitDir })` snapshots gain `git: {branch, ahead, changed} | null`; store gains `refreshGit()` and `addComment(id, text)`.

- [ ] **Step 1: Write the failing tests**

Create `test/server.test.js` (the server tests come in Task 4; start with the store):

```js
'use strict';

const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const { appendComment, createStore } = require('../src/store');
const { fixture, tmpDir } = require('./helpers');

const NOW = '2026-09-11T08:10:00.000Z';

function roadmapFile(data = fixture('roadmap-base.json')) {
  const file = path.join(tmpDir(), 'roadmap.json');
  fs.writeFileSync(file, `${JSON.stringify(data, null, 2)}\n`);
  return file;
}

test('appendComment adds a human comment, keeps key order and indentation', () => {
  const file = roadmapFile();
  assert.deepStrictEqual(appendComment(file, 'listing-editor', 'Finish the cart first', NOW), { ok: true });
  const raw = fs.readFileSync(file, 'utf8');
  assert.ok(raw.startsWith('{\n  "project"') && raw.endsWith('}\n'));
  const item = JSON.parse(raw).items[0];
  assert.deepStrictEqual(Object.keys(item), ['id', 'title', 'milestone', 'status', 'updated', 'comments']);
  assert.deepStrictEqual(item.comments, [{ from: 'human', text: 'Finish the cart first', at: NOW }]);
  appendComment(file, 'listing-editor', 'And the checkout after', NOW);
  assert.strictEqual(JSON.parse(fs.readFileSync(file, 'utf8')).items[0].comments.length, 2);
});

test('appendComment rejects empty text, unknown ids, long text and invalid files', () => {
  const file = roadmapFile();
  assert.strictEqual(appendComment(file, 'listing-editor', '   ', NOW).status, 400);
  assert.strictEqual(appendComment(file, 'listing-editor', 42, NOW).status, 400);
  assert.strictEqual(appendComment(file, 'nope', 'hi', NOW).status, 400);
  assert.strictEqual(appendComment(file, 'listing-editor', 'x'.repeat(2001), NOW).status, 413);
  fs.writeFileSync(file, '{ broken');
  assert.strictEqual(appendComment(file, 'listing-editor', 'hi', NOW).status, 409);
});

test('store snapshot carries git state and addComment notifies listeners', async () => {
  const file = roadmapFile();
  const store = createStore(file, { gitDir: path.dirname(file) });
  try {
    assert.strictEqual(store.snapshot().git, null, 'temp dir is not a git repo');
    const seen = [];
    store.subscribe((snap) => seen.push(snap));
    assert.deepStrictEqual(store.addComment('checkout', 'Please debounce'), { ok: true });
    await new Promise((r) => setTimeout(r, 50));
    const last = seen[seen.length - 1];
    assert.strictEqual(last.data.items[1].comments[0].text, 'Please debounce');
  } finally {
    store.stop();
  }
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `node --test test/server.test.js`
Expected: FAIL, `appendComment` is not a function.

- [ ] **Step 3: Implement `appendComment` and git state in the store**

In `src/store.js`, add imports and constants at the top:

```js
const path = require('path');
const { loadRoadmap, displayName, isText } = require('./validate');
const { gitState } = require('./git-state');

const MAX_COMMENT_CHARS = 2000;
const GIT_POLL_MS = 5000;
```

(keep the existing `fs` import and other constants.) Add after `diffChanges`:

```js
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
  fs.writeFileSync(tmp, `${JSON.stringify(result.data, null, 2)}\n`);
  fs.renameSync(tmp, file);
  return { ok: true };
}
```

Change `createStore` to accept `gitDir` and keep git state:

```js
function createStore(file, { log = () => {}, t = (k) => k, gitDir = path.dirname(file) } = {}) {
  const state = { mode: 'live', ok: false, data: null, error: null, updatedAt: null, changes: [], file: displayName(file), git: null };
```

Add inside `createStore`, before `reload();`:

```js
  const notify = () => { for (const fn of listeners) fn(snapshot()); };

  const refreshGit = () => {
    const next = gitState(gitDir);
    if (JSON.stringify(next) === JSON.stringify(state.git)) return false;
    state.git = next;
    return true;
  };
```

In `reload`, replace the final `for (const fn of listeners) fn(snapshot());` with:

```js
    refreshGit();
    notify();
```

After `const stop = watchFile(file, reload);` add:

```js
  refreshGit();
  const gitTimer = setInterval(() => { if (refreshGit()) notify(); }, GIT_POLL_MS);
  gitTimer.unref();
```

Change the returned object:

```js
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
```

Export `appendComment` and `MAX_COMMENT_CHARS` in `module.exports`. Remove the now unused `isText` import if you did not use it.

- [ ] **Step 4: Run the tests**

Run: `node --test test/server.test.js`
Expected: PASS (3 tests). Then `npm test` to confirm nothing else broke.

- [ ] **Step 5: Commit**

```bash
git add src/store.js test/server.test.js
git commit -m "Store: append human comments atomically, carry git state in snapshots

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 4: Server route POST /comment and a testable close()

**Files:**
- Modify: `src/server.js`
- Test: `test/server.test.js`

**Interfaces:**
- Consumes: `store.addComment(id, text)` from Task 3.
- Produces: `startServer(opts, env)` returns the `http.Server` with `server.close()` working without `process.exit` (shutdown on signals still exits). `POST /comment` with JSON `{id, text}` → 204, or 400/409/413 with `{ "error": "..." }`.

- [ ] **Step 1: Write the failing tests**

Append to `test/server.test.js`:

```js
const http = require('http');
const { startServer } = require('../src/server');

function listen(file) {
  return new Promise((resolve) => {
    const server = startServer({ file, port: 0, theme: null }, { LANG: 'C', PATH: process.env.PATH });
    server.once('listening', () => resolve({ server, port: server.address().port }));
  });
}

function post(port, body, raw = false) {
  return new Promise((resolve, reject) => {
    const data = raw ? body : JSON.stringify(body);
    const req = http.request({ host: '127.0.0.1', port, path: '/comment', method: 'POST', headers: { 'content-type': 'application/json' } }, (res) => {
      let out = '';
      res.on('data', (d) => { out += d; });
      res.on('end', () => resolve({ status: res.statusCode, body: out }));
    });
    req.on('error', reject);
    req.end(data);
  });
}

function nextEvent(port) {
  return new Promise((resolve, reject) => {
    const req = http.get({ host: '127.0.0.1', port, path: '/events' }, (res) => {
      let buf = '';
      res.on('data', (d) => {
        buf += d;
        const m = /event: update\ndata: (.*)\n\n/g;
        let last = null, x;
        while ((x = m.exec(buf))) last = x[1];
        if (last && buf.split('event: update').length > 2) { req.destroy(); resolve(JSON.parse(last)); }
      });
    });
    req.on('error', (e) => { if (e.code !== 'ECONNRESET') reject(e); });
  });
}

test('POST /comment appends and the SSE stream receives the new snapshot', async () => {
  const file = roadmapFile();
  const { server, port } = await listen(file);
  try {
    const waiting = nextEvent(port);
    const r = await post(port, { id: 'checkout', text: 'Please debounce the buttons' });
    assert.strictEqual(r.status, 204);
    const snap = await waiting;
    const item = snap.data.items.find((it) => it.id === 'checkout');
    assert.strictEqual(item.comments[0].from, 'human');
    assert.strictEqual(item.comments[0].text, 'Please debounce the buttons');
    assert.ok('git' in snap);
  } finally {
    await new Promise((r) => server.close(r));
  }
});

test('POST /comment rejects bad input', async () => {
  const file = roadmapFile();
  const { server, port } = await listen(file);
  try {
    assert.strictEqual((await post(port, { id: 'checkout', text: '' })).status, 400);
    assert.strictEqual((await post(port, { id: 'nope', text: 'x' })).status, 400);
    assert.strictEqual((await post(port, 'not json', true)).status, 400);
    assert.strictEqual((await post(port, { id: 'checkout', text: 'x'.repeat(2001) })).status, 413);
    fs.writeFileSync(file, '{ broken');
    await new Promise((r) => setTimeout(r, 300));
    assert.strictEqual((await post(port, { id: 'checkout', text: 'x' })).status, 409);
  } finally {
    await new Promise((r) => server.close(r));
  }
});

test('concurrent posts do not lose comments', async () => {
  const file = roadmapFile();
  const { server, port } = await listen(file);
  try {
    await Promise.all([1, 2, 3, 4, 5].map((n) => post(port, { id: 'checkout', text: `comment ${n}` })));
    const item = JSON.parse(fs.readFileSync(file, 'utf8')).items.find((it) => it.id === 'checkout');
    assert.strictEqual(item.comments.length, 5);
  } finally {
    await new Promise((r) => server.close(r));
  }
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `node --test test/server.test.js`
Expected: the three new tests FAIL (405 for POST, or the server does not close).

- [ ] **Step 3: Implement the route and close()**

In `src/server.js`, replace the method check block:

```js
    if (req.method === 'POST' && url.pathname === '/comment') return handleComment(req, res);
    if (req.method !== 'GET' && req.method !== 'HEAD') {
```

Add before `const server = http.createServer(...)`:

```js
  const MAX_BODY = 16 * 1024;
  const json = (res, status, body) => {
    res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
    res.end(body === undefined ? '' : JSON.stringify(body));
  };

  const handleComment = (req, res) => {
    let raw = '';
    req.on('data', (d) => {
      raw += d;
      if (raw.length > MAX_BODY) { json(res, 413, { error: 'body too large' }); req.destroy(); }
    });
    req.on('end', () => {
      if (res.writableEnded) return;
      let body;
      try { body = JSON.parse(raw); } catch { return json(res, 400, { error: 'invalid JSON' }); }
      if (!body || typeof body !== 'object' || typeof body.id !== 'string') return json(res, 400, { error: 'id must be a string' });
      const r = store.addComment(body.id, body.text);
      if (!r.ok) return json(res, r.status, { error: r.error });
      res.writeHead(204, { 'Cache-Control': 'no-store' });
      res.end();
    });
  };
```

Replace the shutdown block at the end of `startServer` with:

```js
  const stopAll = () => {
    clearInterval(heartbeat);
    store.stop();
    for (const res of clients) res.end();
    clients.clear();
  };
  const originalClose = server.close.bind(server);
  server.close = (cb) => { stopAll(); return originalClose(cb); };

  let stopping = false;
  const shutdown = () => {
    if (stopping) return;
    stopping = true;
    console.log(`\n${t('cli.server.stopped')}`);
    server.close(() => process.exit(0));
    setTimeout(() => process.exit(0), 500).unref();
  };
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
  return server;
```

Also make the `server.on('error')` handler not exit when `opts.port === 0` is impossible to collide; leave it as is. In `createStore(opts.file, { log, t })` pass `gitDir: path.dirname(opts.file)` (it is the default, so no change needed, but state it).

- [ ] **Step 4: Run the tests**

Run: `node --test test/server.test.js`
Expected: PASS (6 tests). Then `npm test`.

- [ ] **Step 5: Commit**

```bash
git add src/server.js test/server.test.js
git commit -m "Server: POST /comment, closable in tests

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 5: Sync records the pull request branch

**Files:**
- Modify: `src/apply.js:60-68`
- Test: `test/apply.test.js`

**Interfaces:**
- Consumes: normalized PR objects from `src/github.js` already carry `branch` (`pr.head.ref`).
- Produces: `applyClassification` sets `item.branch = pr.branch` when linking a PR and `item.branch` is unset.

- [ ] **Step 1: Write the failing test**

Append to `test/apply.test.js`:

```js
test('linking a PR records its branch unless the agent already set one', () => {
  const roadmap = fixture('roadmap-base.json');
  const pr = { ...prs()[44], branch: 'feat/checkout' };
  applyClassification(roadmap, pr, fixture('classify/pr-44.json'));
  assert.strictEqual(roadmap.items.find((it) => it.id === 'checkout').branch, 'feat/checkout');
  const again = fixture('roadmap-base.json');
  again.items[1].branch = 'agent/checkout';
  applyClassification(again, pr, fixture('classify/pr-44.json'));
  assert.strictEqual(again.items[1].branch, 'agent/checkout');
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `node --test test/apply.test.js`
Expected: FAIL, `branch` is undefined.

- [ ] **Step 3: Implement**

In `src/apply.js`, inside the `for (const id of matchedIds)` loop, right after the `prs` handling (after the `else if (item.prs === undefined) { item.prs = prs; }` block):

```js
    if (!item.branch && typeof pr.branch === 'string' && pr.branch) item.branch = pr.branch;
```

Update the comment at the top of the file: sync touches `status, updated, prs, branch, open_points, unplanned, sync`.

- [ ] **Step 4: Run the tests**

Run: `npm test`
Expected: PASS. The sync end-to-end test in `test/sync.test.js` asserts `Object.keys(by('listing-editor'))` equals `['id','title','milestone','status','updated','prs']`; update that expectation to `['id','title','milestone','status','updated','prs','branch']` because the fixture PR 42 has `head.ref`.

- [ ] **Step 5: Commit**

```bash
git add src/apply.js test/apply.test.js test/sync.test.js
git commit -m "Sync: record the pull request branch on the item

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 6: Locales, demo fixture and CSS for the new blocks

**Files:**
- Modify: `src/locales/en.json`, `src/locales/de.json`
- Modify: `test/fixtures/demo-roadmap.json`
- Modify: `src/page/page.css`

**Interfaces:**
- Produces: locale keys used by Task 7: `page.waiting.title`, `page.waiting.hint`, `page.comments.count`, `page.comments.placeholder`, `page.comments.send`, `page.comments.sent`, `page.comments.you`, `page.comments.agent`, `page.comments.show`, `page.comments.hide`, `page.feed.agent`, `page.git.ahead`, `page.git.changed`.

- [ ] **Step 1: Add the strings**

In `src/locales/en.json` under `page`, after `"unplannedTitle"`:

```json
    "waiting": { "title": "Waiting for you", "hint": "Answering works on the live page" },
    "comments": {
      "count": { "one": "1 comment", "other": "{n} comments" },
      "placeholder": "Tell the agent something…",
      "send": "Send",
      "sent": "sent",
      "you": "you",
      "agent": "agent",
      "show": "show",
      "hide": "hide"
    },
    "git": {
      "ahead": { "one": "1 ahead of main", "other": "{n} ahead of main" },
      "changed": { "one": "1 changed", "other": "{n} changed" }
    }
```

and inside the existing `"feed"` object add `"agent": "agent"`.

In `src/locales/de.json`:

```json
    "waiting": { "title": "Wartet auf dich", "hint": "Antworten geht auf der Live-Seite" },
    "comments": {
      "count": { "one": "1 Kommentar", "other": "{n} Kommentare" },
      "placeholder": "Dem Agenten etwas sagen…",
      "send": "Senden",
      "sent": "gesendet",
      "you": "du",
      "agent": "Agent",
      "show": "anzeigen",
      "hide": "ausblenden"
    },
    "git": {
      "ahead": { "one": "1 vor main", "other": "{n} vor main" },
      "changed": { "one": "1 geändert", "other": "{n} geändert" }
    }
```

and `"agent": "Agent"` inside `"feed"`.

- [ ] **Step 2: Extend the demo fixture**

In `test/fixtures/demo-roadmap.json`:
- `checkout`: add `"branch": "feat/checkout"` after `"updated"`, and after `"open_points"` add
  ```json
  "comments": [
    { "from": "human", "text": "Finish the cart first, the checkout can wait", "at": "2026-09-09T09:30:00Z" },
    { "from": "agent", "text": "Ok, cart first, checkout after that.", "at": "2026-09-09T09:41:00Z" }
  ],
  "question": { "text": "Hold copies for 15 or 30 minutes?", "options": ["15", "30"], "asked": "2026-09-09T09:41:00Z" }
  ```
- `order-queue`: add `"comments": [ { "from": "human", "text": "Is this still needed for the launch?", "at": "2026-09-08T12:00:00Z" } ]`.
- `listing-editor` (done): add `"branch": "feat/listing-editor"` and `"comments": [ { "from": "agent", "text": "Images are resized on upload now.", "at": "2026-09-08T14:00:00Z" } ]`.

Run `node roadmap-live.js --check test/fixtures/demo-roadmap.json` and expect `ok`.

- [ ] **Step 3: Add the CSS**

Append to `src/page/page.css` before the `@media (prefers-reduced-motion: reduce)` block:

```css
/* waiting for you */
.waiting { margin-bottom: 32px; }
.waiting h2 { margin-bottom: 4px; color: var(--attention); }
.waiting li { display: grid; grid-template-columns: 7.5em minmax(0, 1fr); column-gap: 16px; padding: 10px 0; border-top: 1px solid var(--line); }
.waiting li:last-child { border-bottom: 1px solid var(--line); }
.waiting .q { overflow-wrap: anywhere; }
.waiting .answers { display: flex; gap: 10px; flex-wrap: wrap; align-items: baseline; margin-top: 6px; }
.waiting .answers button { font-family: var(--font-mono); font-size: 12px; border-bottom: 1px solid var(--line-strong); }
.waiting .answers button:hover { border-bottom-color: var(--text); }
.waiting .hint { font-family: var(--font-mono); font-size: 12px; color: var(--text-3); margin-top: 6px; }

/* comments */
.item .toggle { font-family: var(--font-mono); font-size: 12px; color: var(--text-3); border-bottom: 1px solid var(--line); }
.item .toggle:hover { color: var(--text); border-bottom-color: var(--line-strong); }
.conv { margin-top: 8px; border-top: 1px solid var(--line); }
.conv li { display: grid; grid-template-columns: 4em minmax(0, 1fr) auto; column-gap: 12px; padding: 6px 0; border-bottom: 1px solid var(--line); font-size: 13px; }
.conv li.agent .text { color: var(--text-2); }
.conv .text { overflow-wrap: anywhere; }
.conv .when { font-family: var(--font-mono); font-size: 12px; color: var(--text-3); }
.comment-form { display: flex; gap: 10px; align-items: baseline; margin-top: 8px; }
.comment-form input { flex: 1 1 auto; min-width: 0; font: inherit; color: var(--text); background: var(--surface); border: 0; border-bottom: 1px solid var(--line-strong); padding: 6px 0; border-radius: 0; }
.comment-form input::placeholder { color: var(--text-3); }
.comment-form input:focus { outline: none; border-bottom-color: var(--text); }
.comment-form button { font-family: var(--font-mono); font-size: 12px; color: var(--text-2); border-bottom: 1px solid var(--line-strong); }
.col.done .conv, .col.done .comment-form { display: none; }
```

Inside the existing `@media (max-width: 760px)` block add:

```css
  .waiting li { grid-template-columns: 1fr; row-gap: 4px; }
  .conv li { grid-template-columns: 4em minmax(0, 1fr); }
  .conv .when { grid-column: 2; }
```

- [ ] **Step 4: Run the tests**

Run: `npm test`
Expected: `test/i18n.test.js` passes (key sets equal); render snapshot tests FAIL because the fixture changed. Do not update snapshots yet; Task 7 changes the markup.

- [ ] **Step 5: Commit**

```bash
git add src/locales/en.json src/locales/de.json test/fixtures/demo-roadmap.json src/page/page.css
git commit -m "Strings, demo data and styles for comments, questions and git state

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 7: View renders the waiting block, conversations, git header and feed rows

**Files:**
- Modify: `src/page/view.js` (`renderHeader`, `computeFeed`, `renderItem`, `renderApp`, new `renderWaiting`, `renderConversation`)
- Test: `test/render.test.js`

**Interfaces:**
- Consumes: locale keys from Task 6; `state.git` from Task 3.
- Produces: `opts.expanded` (object of item id → true), `opts.pending` (array of `{id, text, at}`), and these DOM hooks used by Task 8: `[data-action="expand"][data-id]`, `[data-action="answer"][data-id][data-text]`, `form.comment-form[data-id]` with `input[name="text"]`.

- [ ] **Step 1: Write the failing tests**

Append to `test/render.test.js`:

```js
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
```

- [ ] **Step 2: Run to verify they fail**

Run: `node --test test/render.test.js`
Expected: the four new tests FAIL.

- [ ] **Step 3: Implement in `src/page/view.js`**

Add helpers after `openPoints`:

```js
  function openItem(it) {
    return it.status !== 'done';
  }

  function commentsOf(it, opts) {
    var list = (it.comments || []).slice();
    (opts.pending || []).forEach(function (p) {
      if (p.id === it.id) list.push({ from: 'human', text: p.text, at: p.at, pending: true });
    });
    return list;
  }
```

In `computeFeed`, inside `data.items.forEach`, after the `openPoints(it).forEach(...)` block:

```js
      (it.comments || []).forEach(function (c) {
        if (c.from === 'agent' && openItem(it)) {
          rest.push({ kind: 'comment', at: c.at, pr: null, label: t('page.feed.agent'), text: it.title + ': ' + c.text, id: it.id });
        }
      });
```

In `renderHeader`, inside the `if (state.mode === 'live')` branch, after the `updated` span:

```js
      if (state.git && state.git.branch) {
        var g = [esc(state.git.branch)];
        if (state.git.ahead) g.push(esc(t('page.git.ahead', { n: state.git.ahead })));
        if (state.git.changed) g.push(esc(t('page.git.changed', { n: state.git.changed })));
        parts.push('<span class="sep">&middot;</span><span class="git">' + g.join(' &middot; ') + '</span>');
      }
```

Add `renderWaiting` after `renderFeed`:

```js
  function renderWaiting(state, opts) {
    var t = opts.t;
    var asking = state.data.items.filter(function (it) { return it.question && it.question.text && openItem(it); });
    if (!asking.length) return '';
    var rows = asking.map(function (it) {
      var q = it.question;
      var out = '<li><span class="label attention">' + esc(it.title) + '</span><div class="q">' + esc(q.text);
      if (state.mode === 'live') {
        out += '<div class="answers">';
        (q.options || []).forEach(function (o) {
          out += '<button type="button" data-action="answer" data-id="' + esc(it.id) + '" data-text="' + esc(o) + '">' + esc(o) + '</button>';
        });
        out += '</div>' + renderCommentForm(it, t);
      } else {
        out += '<div class="hint">' + esc(t('page.waiting.hint')) + '</div>';
      }
      return out + '</div></li>';
    });
    return '<section class="waiting"><h2 class="section">' + esc(t('page.waiting.title')) + '</h2><ul>' + rows.join('') + '</ul></section>';
  }

  function renderCommentForm(it, t) {
    return '<form class="comment-form" data-id="' + esc(it.id) + '"><input name="text" type="text" maxlength="2000" autocomplete="off" placeholder="' + esc(t('page.comments.placeholder')) + '"><button type="submit">' + esc(t('page.comments.send')) + '</button></form>';
  }

  function renderConversation(state, opts, it) {
    var t = opts.t;
    var list = commentsOf(it, opts);
    var items = list.map(function (c) {
      var who = c.from === 'agent' ? t('page.comments.agent') : t('page.comments.you');
      var when = c.pending ? esc(t('page.comments.sent')) : time(c.at, opts.now, opts.lang);
      return '<li class="' + esc(c.from) + '"><span class="label">' + esc(who) + '</span><span class="text">' + esc(c.text) + '</span><span class="when">' + when + '</span></li>';
    });
    var out = items.length ? '<ul class="conv">' + items.join('') + '</ul>' : '';
    if (state.mode === 'live') out += renderCommentForm(it, t);
    return out;
  }
```

In `renderItem`, before the `return`:

```js
    var comments = commentsOf(it, opts);
    var expanded = opts.expanded && opts.expanded[it.id];
    if (it.branch) sub.push('<span>' + esc(it.branch) + '</span>');
    if (openItem(it) && (comments.length || state.mode === 'live')) {
      var label = comments.length ? t('page.comments.count', { n: comments.length }) : t('page.comments.placeholder');
      sub.push('<button type="button" class="toggle" data-action="expand" data-id="' + esc(it.id) + '" aria-expanded="' + (expanded ? 'true' : 'false') + '">' + esc(label) + ' &middot; ' + esc(t(expanded ? 'page.comments.hide' : 'page.comments.show')) + '</button>');
    } else if (comments.length) {
      sub.push('<span>' + esc(t('page.comments.count', { n: comments.length })) + '</span>');
    }
    var thread = expanded && openItem(it) ? renderConversation(state, opts, it) : '';
```

and change the `return` to append `thread` after the `sub` div:

```js
      (sub.length ? '<div class="sub">' + sub.join('') + '</div>' : '') + thread + '</article>';
```

Move the `if (it.branch)` push so it sits directly after the PR push (before the open points count) so the subline reads `PR #44 · feat/checkout · 2 open points`.

In `renderApp`, after `out += renderFeed(state, opts);` add `out += renderWaiting(state, opts);`.

- [ ] **Step 4: Run the render tests and regenerate snapshots**

Run: `node --test test/render.test.js`
Expected: the four new tests PASS; the six snapshot tests FAIL because the markup changed. Then:

```bash
UPDATE_SNAPSHOTS=1 node --test test/render.test.js
npm test
```

Expected: all PASS.

- [ ] **Step 5: Commit**

```bash
git add src/page/view.js test/render.test.js test/snapshots
git commit -m "Page: waiting-for-you block, conversations per item, git state in the header

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 8: Browser behaviour: expand, answer, send, pending markers

**Files:**
- Modify: `src/page/page.js`

**Interfaces:**
- Consumes: DOM hooks from Task 7, `POST /comment` from Task 4.
- Produces: `window.RoadmapPage.sendComment(id, text)` returning a Promise; `opts.expanded` and `opts.pending` passed to the renderer.

- [ ] **Step 1: Implement state and the send function**

In `src/page/page.js`, after `var showAllDone = false;` add:

```js
  var expanded = {};     // item id -> true
  var pending = [];      // comments sent but not yet in a snapshot
```

Change `opts(changed)` to include them:

```js
    return { t: t, lang: lang, now: Date.now(), filter: filter, colorMode: colorMode, theme: theme, showAllDone: showAllDone, changed: changed || null, expanded: expanded, pending: pending };
```

(If Task 7 of the theme toggle is not merged yet, omit `theme: theme`.)

Add after the `tick` interval:

```js
  // ---- comments ---------------------------------------------------------------
  function sendComment(id, text) {
    text = String(text || '').trim();
    if (!id || !text) return Promise.resolve(false);
    var entry = { id: id, text: text, at: new Date().toISOString() };
    pending.push(entry);
    expanded[id] = true;
    render();
    return fetch('/comment', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ id: id, text: text }) })
      .then(function (r) {
        if (!r.ok) { pending = pending.filter(function (p) { return p !== entry; }); render(); }
        return r.ok;
      })
      .catch(function () { pending = pending.filter(function (p) { return p !== entry; }); render(); return false; });
  }

  // Drop pending entries once the snapshot contains them.
  function settlePending() {
    if (!pending.length || !state.data) return;
    pending = pending.filter(function (p) {
      var it = state.data.items.filter(function (x) { return x.id === p.id; })[0];
      return !(it && (it.comments || []).some(function (c) { return c.from === 'human' && c.text === p.text; }));
    });
  }
```

- [ ] **Step 2: Wire the events**

In the click handler, add branches:

```js
    else if (action === 'expand') { var id = el.getAttribute('data-id'); if (expanded[id]) delete expanded[id]; else expanded[id] = true; render(); }
    else if (action === 'answer') sendComment(el.getAttribute('data-id'), el.getAttribute('data-text'));
```

After the click handler add:

```js
  app.addEventListener('submit', function (e) {
    var form = e.target.closest('form.comment-form');
    if (!form) return;
    e.preventDefault();
    var input = form.querySelector('input[name="text"]');
    sendComment(form.getAttribute('data-id'), input.value);
    input.value = '';
  });
```

In `render()`, keep focus and the typed text across re-renders: before `app.innerHTML = ...`:

```js
    var focused = document.activeElement;
    var keep = focused && focused.matches && focused.matches('.comment-form input') ? { id: focused.closest('form').getAttribute('data-id'), value: focused.value, pos: focused.selectionStart } : null;
```

and after the FLIP block, before `setTitle()`:

```js
    if (keep) {
      var again = app.querySelector('form.comment-form[data-id="' + keep.id.replace(/"/g, '\\"') + '"] input');
      if (again) { again.value = keep.value; again.focus(); try { again.setSelectionRange(keep.pos, keep.pos); } catch (err) { /* ignore */ } }
    }
```

In `setState`, call `settlePending();` right after `state = next;` (and after the theme lines if present). Add `sendComment: sendComment` to the `window.RoadmapPage` object.

- [ ] **Step 3: Check it in a browser**

Start `node roadmap-live.js --port 4343 test/fixtures/demo-roadmap.json` on a copy of the fixture in a temp directory (so the fixture is not modified), open `http://localhost:4343/?lang=en`, and verify:
- "Waiting for you" shows the checkout question with buttons 15 and 30; clicking 15 adds the human comment `15` to the checkout conversation with the marker "sent", which turns into a relative time as soon as the next snapshot arrives.
- Expanding "Checkout with reserved copies" shows the two existing comments and the field; typing a sentence and pressing Enter adds it; the field stays focused across the live update.
- The header shows the temp directory's git state, or nothing if it is not a repository.
- No console errors. Check at 380 px width too.

Stop the server afterwards.

- [ ] **Step 4: Run the whole suite**

Run: `npm test`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/page/page.js
git commit -m "Page: send comments and answers from the live page, keep the field focused across updates

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 9: Agent rules and docs

**Files:**
- Modify: `AGENTS.md`, `README.md`, `DECISIONS.md`, `roadmap.json`

- [ ] **Step 1: AGENTS.md**

Insert after the section "## Fields written by sync":

```markdown
## Comments and questions

The human can write to you from the page. Each item may have `comments` (a conversation) and you may set a `question`.

- Before you start an item and after every change, read the `comments` of open items (`todo`, `active`, `blocked`). Reply to every `human` comment without a later `agent` reply: append `{ "from": "agent", "text": "one sentence", "at": "<now>" }`, then act on it.
- When you need a decision, set `"question": { "text": "...", "options": ["a", "b"], "asked": "<now>" }` (2 to 4 options when possible), and continue with another item. When a `human` comment answers it, remove `question` and act.
- When you set an item to `active`, set `"branch"` to the git branch you work on.
- Never edit or delete existing comments. Keep your replies to one sentence.
```

In the "## Format" list add: `- \`comments\`, \`question\` and \`branch\` are optional, see above.`

- [ ] **Step 2: README.md**

After the section "What "Since you last looked" shows" add:

```markdown
## Talking back to the agent

On the live page every open item can be expanded to a short conversation. Write one sentence ("finish the cart first", "add an item for vouchers") and the agent reads it on its next run, answers in one sentence and acts. When the agent needs a decision it parks a question; those show up in "Waiting for you" above the board with the possible answers as buttons. Everything is stored in `roadmap.json`, so the shared page shows the same conversations, read-only.

The header of the live page also shows where the working copy is: the branch, how many commits it is ahead of `main`, and how many files are changed.
```

In the data format section add `"branch": "feat/listing-editor"`, a `comments` array and a `question` object to the example, and one bullet: `- The human writes \`comments\` from the page; the agent answers there, sets and clears \`question\` and records \`branch\`.`

- [ ] **Step 3: DECISIONS.md**

Under "## Data model and rules" append:

```markdown
- **Comments live in `roadmap.json`, next to the item, not in a second file.** One source of truth; the shared page needs nothing extra, and the write conflict between server and agent is handled by re-reading before an atomic temp-and-rename write.
- **Answers to the agent's questions are ordinary human comments.** One data path, and the record of what was asked and answered stays in one place.
- **No new status for "needs a decision".** The `question` field carries it, so the agent's `todo | active | done` and sync's `blocked` stay untouched.
- **Done items' conversations are not rendered and not covered by the agent rule.** Keeps the board quiet and bounds what the agent has to read.
- **`--check` warns above 200 KB instead of failing.** Growth is a smell, not an error; the number is far above any roadmap seen so far.
- **The git header uses `main` as the base and hides "ahead" when there is no `main`.** Guessing the default branch would need a remote query; `main` covers the common case silently.
```

- [ ] **Step 4: Roadmap item**

In `roadmap.json`, under milestone `m3`, add:

```json
    {
      "id": "feedback-channel",
      "title": "Comments and questions between human and agent on the page",
      "milestone": "m3",
      "status": "done",
      "note": "Live page writes to roadmap.json, static page shows read-only.",
      "updated": "<now, ISO 8601>"
    }
```

Run `node roadmap-live.js --check`.

- [ ] **Step 5: Commit**

```bash
git add AGENTS.md README.md DECISIONS.md roadmap.json
git commit -m "Docs: agent rules for comments and questions, README section, decisions

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 10: Hands-on check with a real agent, then the pull request

**Files:** none new.

- [ ] **Step 1: End-to-end with an agent**

Copy this repository's `roadmap.json` to a temp git repository together with `AGENTS.md`, start the live server there, write a comment on an open item and a question-less item, then run Claude Code (`claude -p`, binary path in the memory note) with the prompt "Read AGENTS.md and handle the comments in roadmap.json, then run node <path>/roadmap-live.js --check". Watch the agent's reply appear on the page without a reload. Note what happened in the PR description.

- [ ] **Step 2: All six theme and mode combinations at 1180 px and 380 px**

Render the demo fixture with `--theme` and `--mode` for each combination, open them, look for anything generic or misaligned in the new blocks, fix, regenerate snapshots if markup changed.

- [ ] **Step 3: Push and open the PR**

```bash
npm test
git push -u origin feat/feedback-channel
gh pr create -R marvrue/roadmap-live --base main --head feat/feedback-channel --title "Feedback channel: comments and questions between human and agent" --body-file <summary written from this plan; end with the attribution line>
```

Wait for the `ci` and `roadmap` workflows and report their result.
