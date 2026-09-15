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
  assert.deepStrictEqual(appendComment(file, 'menu-editor', 'Finish the cart first', NOW), { ok: true });
  const raw = fs.readFileSync(file, 'utf8');
  assert.ok(raw.startsWith('{\n  "project"') && raw.endsWith('}\n'));
  const item = JSON.parse(raw).items[0];
  assert.deepStrictEqual(Object.keys(item), ['id', 'title', 'milestone', 'status', 'updated', 'comments']);
  assert.deepStrictEqual(item.comments, [{ from: 'human', text: 'Finish the cart first', at: NOW }]);
  appendComment(file, 'menu-editor', 'And the checkout after', NOW);
  assert.strictEqual(JSON.parse(fs.readFileSync(file, 'utf8')).items[0].comments.length, 2);
});

test('appendComment appends after existing comments without touching them', () => {
  const data = fixture('roadmap-base.json');
  data.items[0].comments = [
    { from: 'human', text: 'first', at: '2026-09-01T00:00:00Z' },
    { from: 'agent', text: 'second', at: '2026-09-01T00:01:00Z' },
  ];
  const file = roadmapFile(data);
  assert.deepStrictEqual(appendComment(file, 'menu-editor', 'third', NOW), { ok: true });
  const comments = JSON.parse(fs.readFileSync(file, 'utf8')).items[0].comments;
  assert.strictEqual(comments.length, 3);
  assert.deepStrictEqual(comments[0], { from: 'human', text: 'first', at: '2026-09-01T00:00:00Z' });
  assert.deepStrictEqual(comments[1], { from: 'agent', text: 'second', at: '2026-09-01T00:01:00Z' });
  assert.deepStrictEqual(comments[2], { from: 'human', text: 'third', at: NOW });
});

test('appendComment rejects empty text, unknown ids, long text and invalid files', () => {
  const file = roadmapFile();
  assert.strictEqual(appendComment(file, 'menu-editor', '   ', NOW).status, 400);
  assert.strictEqual(appendComment(file, 'menu-editor', 42, NOW).status, 400);
  assert.strictEqual(appendComment(file, 'nope', 'hi', NOW).status, 400);
  assert.strictEqual(appendComment(file, 'menu-editor', 'x'.repeat(2001), NOW).status, 413);
  fs.writeFileSync(file, '{ broken');
  assert.strictEqual(appendComment(file, 'menu-editor', 'hi', NOW).status, 409);
});

test('appendComment returns 500 and removes the temp file when the write fails', { skip: process.platform === 'win32' }, () => {
  const dir = tmpDir();
  const file = path.join(dir, 'roadmap.json');
  fs.writeFileSync(file, `${JSON.stringify(fixture('roadmap-base.json'), null, 2)}\n`);
  fs.chmodSync(dir, 0o500);
  try {
    const result = appendComment(file, 'menu-editor', 'Should not persist', NOW);
    assert.strictEqual(result.status, 500);
    assert.ok(result.error);
  } finally {
    fs.chmodSync(dir, 0o700);
    const leftovers = fs.readdirSync(dir).filter((f) => f.endsWith('.tmp'));
    assert.deepStrictEqual(leftovers, []);
  }
});

test('store snapshot carries git state and addComment notifies listeners', async () => {
  const file = roadmapFile();
  const store = createStore(file, { gitDir: path.dirname(file) });
  try {
    await new Promise((r) => setTimeout(r, 200));
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

const http = require('http');
const { startServer } = require('../src/server');

// Every test server runs with this write key; post() sends it unless told not to.
const KEY = 'test-key-1234';

function listen(file, opts = {}) {
  return new Promise((resolve) => {
    const server = startServer({ file, port: 0, theme: null, key: KEY, ...opts }, { LANG: 'C', PATH: process.env.PATH });
    server.once('listening', () => resolve({ server, port: server.address().port }));
  });
}

function post(port, body, raw = false, headers = {}, key = KEY) {
  return new Promise((resolve, reject) => {
    const data = raw ? body : JSON.stringify(body);
    const keyHeader = key === null ? {} : { 'x-roadmap-key': key };
    const req = http.request({ host: '127.0.0.1', port, path: '/comment', method: 'POST', headers: { 'content-type': 'application/json', ...keyHeader, ...headers } }, (res) => {
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

test('POST /comment delivers 413 reliably for oversized bodies', async () => {
  const file = roadmapFile();
  const { server, port } = await listen(file);
  try {
    for (let i = 0; i < 5; i++) {
      const r = await post(port, { id: 'checkout', text: 'x'.repeat(20000) });
      assert.strictEqual(r.status, 413);
      assert.ok(JSON.parse(r.body).error);
    }
  } finally {
    await new Promise((r) => server.close(r));
  }
});

test('POST /comment rejects foreign origins and accepts the server\'s own', async () => {
  const file = roadmapFile();
  const { server, port } = await listen(file);
  try {
    const foreign = await post(port, { id: 'checkout', text: 'from evil' }, false, { origin: 'https://evil.example' });
    assert.strictEqual(foreign.status, 403);
    const afterForeign = JSON.parse(fs.readFileSync(file, 'utf8')).items.find((it) => it.id === 'checkout');
    assert.ok(!afterForeign.comments || afterForeign.comments.length === 0);

    const ok = await post(port, { id: 'checkout', text: 'from self' }, false, { origin: `http://127.0.0.1:${port}` });
    assert.strictEqual(ok.status, 204);
  } finally {
    await new Promise((r) => server.close(r));
  }
});

test('POST /comment accepts loopback on any port and a Host-matching origin, forwarded setups', async () => {
  const file = roadmapFile();
  const { server, port } = await listen(file);
  try {
    // ssh -L / Codespaces / VS Code port forwarding: the browser's Origin
    // still names loopback, just not the port the server is bound to.
    const otherLoopbackPort = await post(port, { id: 'checkout', text: 'via forwarded port' }, false, { origin: 'http://localhost:9999' });
    assert.strictEqual(otherLoopbackPort.status, 204);

    // The origin's host matches the request's own Host header, even though
    // neither is loopback (a forwarded hostname).
    const matchingHost = await post(port, { id: 'checkout', text: 'via matching host' }, false, { origin: 'http://myhost.example:4242', host: 'myhost.example:4242' });
    assert.strictEqual(matchingHost.status, 204);

    const evil = await post(port, { id: 'checkout', text: 'from evil' }, false, { origin: 'https://evil.example' });
    assert.strictEqual(evil.status, 403);
    const item = JSON.parse(fs.readFileSync(file, 'utf8')).items.find((it) => it.id === 'checkout');
    assert.ok(!item.comments.some((c) => c.text === 'from evil'));
  } finally {
    await new Promise((r) => server.close(r));
  }
});

test('POST /comment rejects non-JSON content-type', async () => {
  const file = roadmapFile();
  const { server, port } = await listen(file);
  try {
    const r = await post(port, { id: 'checkout', text: 'x' }, false, { 'content-type': 'text/plain' });
    assert.strictEqual(r.status, 415);
  } finally {
    await new Promise((r) => server.close(r));
  }
});

function pagesFetch(state) {
  return async (url, init = {}) => {
    if (!url.includes('/pages')) return new Response('{}', { status: 404 });
    if (init.method === 'POST') { state.enabled = true; return new Response(JSON.stringify({ html_url: 'https://acme.github.io/abholbereit/' }), { status: 201 }); }
    return state.enabled ? new Response(JSON.stringify({ html_url: 'https://acme.github.io/abholbereit/' }), { status: 200 }) : new Response('{"message":"Not Found"}', { status: 404 });
  };
}

function listenWithPages(file, state) {
  return new Promise((resolve) => {
    const data = JSON.parse(fs.readFileSync(file, 'utf8'));
    data.sync = { repo: 'acme/abholbereit' };
    fs.writeFileSync(file, `${JSON.stringify(data, null, 2)}\n`);
    const server = startServer({ file, port: 0, theme: null, key: KEY }, { LANG: 'C', PATH: process.env.PATH }, { credential: { token: 't' }, fetchFn: pagesFetch(state) });
    server.once('listening', () => resolve({ server, port: server.address().port }));
  });
}

function getJson(port, p) {
  return new Promise((resolve, reject) => {
    http.get({ host: '127.0.0.1', port, path: p }, (res) => {
      let out = '';
      res.on('data', (d) => { out += d; });
      res.on('end', () => resolve(JSON.parse(out)));
    }).on('error', reject);
  });
}

test('share: pages status in the snapshot and POST /pages/enable turns it on', async () => {
  const file = roadmapFile();
  const state = { enabled: false };
  const { server, port } = await listenWithPages(file, state);
  try {
    await new Promise((r) => setTimeout(r, 100));
    let snap = await getJson(port, '/data');
    assert.deepStrictEqual(snap.pages, { enabled: false });
    assert.strictEqual(snap.shareUrl, null);
    const enable = (headers) => new Promise((resolve, reject) => {
      const req = http.request({ host: '127.0.0.1', port, path: '/pages/enable', method: 'POST', headers: { 'content-type': 'application/json', ...headers } }, (res) => resolve(res.statusCode));
      req.on('error', reject);
      req.end('{}');
    });
    assert.strictEqual(await enable({}), 401, 'turning Pages on needs the write key too');
    assert.strictEqual(await enable({ 'x-roadmap-key': KEY }), 204);
    snap = await getJson(port, '/data');
    assert.strictEqual(snap.shareUrl, 'https://acme.github.io/abholbereit/roadmap/');
    const page = await new Promise((resolve) => { http.get({ host: '127.0.0.1', port, path: '/' }, (res) => { let o = ''; res.on('data', (d) => { o += d; }); res.on('end', () => resolve(o)); }); });
    assert.ok(page.includes('data-action="share"'));
  } finally {
    await new Promise((r) => server.close(r));
  }
});

test('share: page_url in roadmap.json wins over the Pages address', async () => {
  const file = roadmapFile();
  const data = JSON.parse(fs.readFileSync(file, 'utf8'));
  data.page_url = 'https://roadmap.example.com/';
  fs.writeFileSync(file, `${JSON.stringify(data, null, 2)}\n`);
  const { server, port } = await listenWithPages(file, { enabled: true });
  try {
    await new Promise((r) => setTimeout(r, 100));
    assert.strictEqual((await getJson(port, '/data')).shareUrl, 'https://roadmap.example.com/');
  } finally {
    await new Promise((r) => server.close(r));
  }
});

test('the live page opens on the view named in ?view= before any script runs', async () => {
  const file = roadmapFile(fixture('demo-roadmap.json'));
  const { server, port } = await listen(file);
  const get = (p) => new Promise((resolve, reject) => {
    http.get({ host: '127.0.0.1', port, path: p }, (res) => {
      let o = '';
      res.on('data', (d) => { o += d; });
      res.on('end', () => resolve(o.split('<script id="roadmap-state"')[0]));
    }).on('error', reject);
  });
  try {
    assert.ok((await get('/?view=board')).includes('<main class="board">'));
    assert.ok((await get('/')).includes('<main class="milestones">'));
    assert.ok((await get('/?view=nope')).includes('<main class="milestones">'), 'an unknown name falls back to the first view');
  } finally {
    server.close();
  }
});
