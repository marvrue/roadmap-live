'use strict';

// The live server: serves the page, /data as JSON and /events as a
// Server-Sent Events stream that sends an event on every change.

const http = require('http');
const path = require('path');
const crypto = require('crypto');
const { createStore } = require('./store');
const { renderPage, repoUrl, resolveTheme, DEFAULT_THEME } = require('./render');
const i18n = require('./i18n');
const { displayName } = require('./validate');

const HEARTBEAT_MS = 25000;
const LOOPBACK_HOSTS = new Set(['localhost', '127.0.0.1', '[::1]']);

// Accepts a request whose Origin is loopback (any port: covers forwarded
// setups like `ssh -L`, Codespaces, VS Code port forwarding) or matches the
// request's own Host header. Rejects everything else, including a malformed
// Origin.
function originAllowed(origin, host) {
  let o;
  try {
    o = new URL(origin);
  } catch {
    return false;
  }
  if (LOOPBACK_HOSTS.has(o.hostname)) return true;
  return !!host && o.host.toLowerCase() === String(host).toLowerCase();
}

function log(msg) {
  const t = new Date().toTimeString().slice(0, 8);
  console.log(`[${t}] ${msg}`);
}

// The write key. The page at its plain address is read-only; the address
// with ?key=<key> lets the browser write. The page stores the key and sends
// it as the X-Roadmap-Key header; the server never puts it into a response.
function generateKey() {
  return crypto.randomBytes(24).toString('base64url');
}

function keyMatches(given, expected) {
  if (typeof given !== 'string' || typeof expected !== 'string' || !given || !expected) return false;
  const a = Buffer.from(given);
  const b = Buffer.from(expected);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

function startServer(opts, env = process.env) {
  const t = i18n.cliT(null, env);
  const store = createStore(opts.file, { log, t });
  const clients = new Set();
  const key = opts.key || env.ROADMAP_KEY || generateKey();

  const withLinks = (snap) => {
    const repo = snap.data && snap.data.sync && snap.data.sync.repo;
    const url = repoUrl(repo);
    const { lang, source } = i18n.resolveLanguage({ roadmap: snap.data, env });
    return {
      ...snap,
      repoUrl: url,
      roadmapUrl: url ? `${url}/blob/HEAD/${path.basename(opts.file)}` : null,
      fixedLang: source === 'roadmap' || source === 'env' ? lang : null,
    };
  };

  const sendEvent = (res, snap) => {
    res.write(`event: update\ndata: ${JSON.stringify(withLinks(snap))}\n\n`);
  };

  store.subscribe((snap) => {
    for (const res of clients) sendEvent(res, snap);
  });

  const heartbeat = setInterval(() => {
    for (const res of clients) res.write(': ping\n\n');
  }, HEARTBEAT_MS);

  const page = () => {
    const snap = withLinks(store.snapshot());
    const { lang } = i18n.resolveLanguage({ roadmap: snap.data, env });
    const baseDir = path.dirname(opts.file);
    const themeName = opts.theme || (snap.data && snap.data.theme) || DEFAULT_THEME;
    const theme = resolveTheme(themeName, baseDir) ? themeName : DEFAULT_THEME;
    return renderPage(snap, { theme, baseDir, lang, langFixed: snap.fixedLang, live: true });
  };

  const MAX_BODY = 16 * 1024;
  const json = (res, status, body) => {
    res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
    res.end(body === undefined ? '' : JSON.stringify(body));
  };

  const handleComment = (req, res) => {
    const contentType = (req.headers['content-type'] || '').split(';')[0].trim().toLowerCase();
    if (contentType !== 'application/json') return json(res, 415, { error: 'content-type must be application/json' });
    const origin = req.headers.origin;
    if (origin && !originAllowed(origin, req.headers.host)) return json(res, 403, { error: 'forbidden origin' });
    if (!keyMatches(req.headers['x-roadmap-key'], key)) return json(res, 401, { error: 'missing or wrong key; open the write address shown in the terminal' });
    const chunks = [];
    let size = 0;
    let overLimit = false;
    req.on('data', (d) => {
      if (overLimit) return;
      chunks.push(d);
      size += d.length;
      if (size > MAX_BODY) {
        overLimit = true;
        json(res, 413, { error: 'body too large' });
      }
    });
    req.on('end', () => {
      if (res.writableEnded) return;
      let body;
      try { body = JSON.parse(Buffer.concat(chunks).toString('utf8')); } catch { return json(res, 400, { error: 'invalid JSON' }); }
      if (!body || typeof body !== 'object' || typeof body.id !== 'string') return json(res, 400, { error: 'id must be a string' });
      const r = store.addComment(body.id, body.text);
      if (!r.ok) return json(res, r.status, { error: r.error });
      res.writeHead(204, { 'Cache-Control': 'no-store' });
      res.end();
    });
  };

  const server = http.createServer((req, res) => {
    const url = new URL(req.url, 'http://localhost');
    if (req.method === 'POST' && url.pathname === '/comment') return handleComment(req, res);
    if (req.method !== 'GET' && req.method !== 'HEAD') {
      res.writeHead(405, { 'Content-Type': 'text/plain' });
      return res.end('method not allowed');
    }
    switch (url.pathname) {
      case '/':
        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' });
        return res.end(page());
      case '/data':
        res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
        return res.end(JSON.stringify(withLinks(store.snapshot())));
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
    if (e.code === 'EADDRINUSE') console.error(t('cli.server.portInUse', { port: opts.port }));
    else console.error(`roadmap-live: ${e.message}`);
    process.exit(1);
  });

  server.listen(opts.port, '127.0.0.1', () => {
    const port = server.address().port;
    console.log(t('cli.server.watching', { file: displayName(opts.file) }));
    console.log(t('cli.server.readUrl', { url: `http://localhost:${port}` }));
    console.log(t('cli.server.writeUrl', { url: `http://localhost:${port}/?key=${encodeURIComponent(key)}` }));
    console.log(t('cli.server.stop'));
  });

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
}

module.exports = { startServer, generateKey, keyMatches, originAllowed };
