'use strict';

// The live server: serves the page, /data as JSON and /events as a
// Server-Sent Events stream that sends an event on every change.

const http = require('http');
const path = require('path');
const { createStore } = require('./store');
const { renderPage, repoUrl, resolveTheme, DEFAULT_THEME } = require('./render');
const i18n = require('./i18n');
const { displayName } = require('./validate');

const HEARTBEAT_MS = 25000;

function log(msg) {
  const t = new Date().toTimeString().slice(0, 8);
  console.log(`[${t}] ${msg}`);
}

function startServer(opts, env = process.env) {
  const t = i18n.cliT(null, env);
  const store = createStore(opts.file, { log, t });
  const clients = new Set();

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
    const theme = resolveTheme(themeName, baseDir) || resolveTheme(DEFAULT_THEME);
    return renderPage(snap, { themeCss: theme.css, lang, langFixed: snap.fixedLang, live: true });
  };

  const server = http.createServer((req, res) => {
    const url = new URL(req.url, 'http://localhost');
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
    console.log(`  http://localhost:${port}`);
    console.log(t('cli.server.stop'));
  });

  let stopping = false;
  const shutdown = () => {
    if (stopping) return;
    stopping = true;
    console.log(`\n${t('cli.server.stopped')}`);
    clearInterval(heartbeat);
    store.stop();
    for (const res of clients) res.end();
    clients.clear();
    server.close(() => process.exit(0));
    setTimeout(() => process.exit(0), 500).unref();
  };
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
  return server;
}

module.exports = { startServer };
