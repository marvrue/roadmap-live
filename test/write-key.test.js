'use strict';

// The write key: the live page is readable at its plain address and writable
// only with the key from the terminal. The hosted page uses the same rule.

const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const http = require('http');
const path = require('path');
const { startServer, generateKey, keyMatches } = require('../src/server');
const { parseArgs } = require('../src/cli');
const { renderPage, staticState } = require('../src/render');
const { fixture, tmpDir, FIXTURES } = require('./helpers');

const NOW = Date.parse('2026-09-10T12:00:00Z');

function roadmapFile(data = fixture('roadmap-base.json')) {
  const file = path.join(tmpDir(), 'roadmap.json');
  fs.writeFileSync(file, `${JSON.stringify(data, null, 2)}\n`);
  return file;
}

function listen(opts = {}, env = {}) {
  const lines = [];
  const orig = console.log;
  console.log = (l) => lines.push(String(l));
  return new Promise((resolve) => {
    const server = startServer({ file: roadmapFile(), port: 0, theme: null, ...opts }, { LANG: 'C', PATH: process.env.PATH, ...env });
    server.once('listening', () => {
      console.log = orig;
      resolve({ server, port: server.address().port, lines });
    });
  });
}

function request(port, { method = 'GET', pathname = '/', headers = {}, body } = {}) {
  return new Promise((resolve, reject) => {
    const req = http.request({ host: '127.0.0.1', port, path: pathname, method, headers }, (res) => {
      let out = '';
      res.on('data', (d) => { out += d; });
      res.on('end', () => resolve({ status: res.statusCode, body: out }));
    });
    req.on('error', reject);
    req.end(body);
  });
}

function comment(port, key) {
  const headers = { 'content-type': 'application/json' };
  if (key !== null) headers['x-roadmap-key'] = key;
  return request(port, { method: 'POST', pathname: '/comment', headers, body: JSON.stringify({ id: 'checkout', text: 'hello' }) });
}

test('generateKey makes a long random URL-safe key; keyMatches compares safely', () => {
  const a = generateKey();
  const b = generateKey();
  assert.ok(/^[A-Za-z0-9_-]{20,}$/.test(a));
  assert.notStrictEqual(a, b);
  assert.ok(keyMatches(a, a));
  assert.ok(!keyMatches(a, b));
  assert.ok(!keyMatches(undefined, a));
  assert.ok(!keyMatches('', ''));
  assert.ok(!keyMatches(a, `${a}x`));
});

test('--key and ROADMAP_KEY set the key, otherwise one is generated', async () => {
  assert.strictEqual(parseArgs(['--key', 'abc']).key, 'abc');
  assert.strictEqual(parseArgs([]).key, null);
  assert.throws(() => parseArgs(['--key']), /--key needs a value/);

  const flag = await listen({ key: 'from-flag' }, { ROADMAP_KEY: 'from-env' });
  try {
    assert.strictEqual((await comment(flag.port, 'from-flag')).status, 204);
    assert.strictEqual((await comment(flag.port, 'from-env')).status, 401);
  } finally { flag.server.close(); }

  const env = await listen({}, { ROADMAP_KEY: 'from-env' });
  try {
    assert.strictEqual((await comment(env.port, 'from-env')).status, 204);
  } finally { env.server.close(); }

  const generated = await listen({});
  try {
    const writeLine = generated.lines.find((l) => l.includes('?key='));
    assert.ok(writeLine, 'the terminal shows the write address');
    const key = /\?key=([A-Za-z0-9_-]+)/.exec(writeLine)[1];
    assert.ok(key.length >= 20);
    assert.strictEqual((await comment(generated.port, key)).status, 204);
  } finally { generated.server.close(); }
});

test('the terminal shows a read address and a write address with the key', async () => {
  const { server, port, lines } = await listen({ key: 'k-123' });
  try {
    assert.ok(lines.some((l) => l.includes(`http://localhost:${port}`) && !l.includes('?key=')), 'read address');
    assert.ok(lines.some((l) => l.includes(`http://localhost:${port}/?key=k-123`)), 'write address');
  } finally { server.close(); }
});

test('POST /comment needs the key: 401 without it or with a wrong one, 204 with it', async () => {
  const { server, port } = await listen({ key: 'secret-key' });
  try {
    assert.strictEqual((await comment(port, null)).status, 401);
    assert.strictEqual((await comment(port, 'wrong')).status, 401);
    assert.strictEqual((await comment(port, 'secret-key')).status, 204);
    const withOrigin = await request(port, { method: 'POST', pathname: '/comment', headers: { 'content-type': 'application/json', origin: 'https://evil.example', 'x-roadmap-key': 'secret-key' }, body: JSON.stringify({ id: 'checkout', text: 'x' }) });
    assert.strictEqual(withOrigin.status, 403, 'the origin check stays');
  } finally { server.close(); }
});

test('the page, the data and the event stream never contain the key', async () => {
  const { server, port } = await listen({ key: 'never-shown-9f8e7d' });
  try {
    const page = await request(port, { pathname: '/' });
    assert.strictEqual(page.status, 200);
    assert.ok(!page.body.includes('never-shown-9f8e7d'));
    const data = await request(port, { pathname: '/data' });
    assert.ok(!data.body.includes('never-shown-9f8e7d'));
    const withKey = await request(port, { pathname: '/?key=never-shown-9f8e7d' });
    assert.ok(!withKey.body.includes('never-shown-9f8e7d'), 'not even when the write address is requested');
    const events = await new Promise((resolve, reject) => {
      const req = http.get({ host: '127.0.0.1', port, path: '/events' }, (res) => {
        let buf = '';
        res.on('data', (d) => { buf += d; if (buf.includes('\n\n')) { req.destroy(); resolve(buf); } });
      });
      req.on('error', (e) => { if (e.code !== 'ECONNRESET') reject(e); });
    });
    assert.ok(!events.includes('never-shown-9f8e7d'));
  } finally { server.close(); }
});

test('the rendered page offers writing only when told the viewer holds the key', () => {
  const demo = () => staticState(path.join(FIXTURES, 'demo-roadmap.json'), fixture('demo-roadmap.json'), { now: NOW });
  const body = (html) => html.split('<script id="roadmap-state"')[0];
  const readOnly = body(renderPage({ ...demo(), mode: 'live' }, { theme: 'neutral', lang: 'en', live: true, now: NOW }));
  assert.ok(!/<form|<input|data-action="answer"/.test(readOnly), 'live page without key has no fields and no answer buttons');
  assert.ok(readOnly.includes('link with the key'), 'and says how to get them');
  const writable = body(renderPage({ ...demo(), mode: 'live' }, { theme: 'neutral', lang: 'en', live: true, now: NOW, canWrite: true }));
  assert.ok(writable.includes('<form class="comment-form" data-id="checkout"'));
  assert.ok(writable.includes('data-action="answer" data-id="checkout" data-text="15"'));
  assert.ok(!writable.includes('link with the key'));
  const stat = body(renderPage(demo(), { theme: 'neutral', lang: 'en', live: false, now: NOW, canWrite: true }));
  assert.ok(!/<form|<input/.test(stat), 'the static page never writes, key or not');
  assert.ok(stat.includes('Answering works on the live page'));
});

test('the page script sends the key as a header and takes it from the address once', () => {
  const src = fs.readFileSync(path.join(__dirname, '..', 'src', 'page', 'page.js'), 'utf8');
  assert.ok(src.includes("'x-roadmap-key'"));
  assert.ok(src.includes("get('key')"));
  assert.ok(src.includes('replaceState'), 'the key leaves the address bar');
});
