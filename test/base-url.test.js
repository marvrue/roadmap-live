'use strict';

// The page can live under any base address: the hosted service serves it at
// a path like /p/<id>/ and the page must call its routes relative to that.

process.env.TZ = 'UTC';

const { test } = require('node:test');
const assert = require('node:assert');
const path = require('path');
const fs = require('fs');
const { renderPage, staticState } = require('../src/render');
const { fixture, FIXTURES } = require('./helpers');

const NOW = Date.parse('2026-09-10T12:00:00Z');
const demoFile = path.join(FIXTURES, 'demo-roadmap.json');
const demoState = () => staticState(demoFile, fixture('demo-roadmap.json'), { now: NOW });

test('the page carries a base path for its own routes; default is the root', () => {
  const root = renderPage(demoState(), { theme: 'neutral', lang: 'en', live: true, now: NOW });
  assert.ok(root.includes('"base":"/"'), 'default base is /');
  const hosted = renderPage(demoState(), { theme: 'neutral', lang: 'en', live: true, now: NOW, basePath: '/p/abc' });
  assert.ok(hosted.includes('"base":"/p/abc/"'), 'base path always ends with a slash');
  const same = renderPage(demoState(), { theme: 'neutral', lang: 'en', live: true, now: NOW, basePath: '/p/abc/' });
  assert.ok(same.includes('"base":"/p/abc/"'));
  assert.throws(() => renderPage(demoState(), { theme: 'neutral', lang: 'en', basePath: 'p/abc' }), /basePath/);
  assert.throws(() => renderPage(demoState(), { theme: 'neutral', lang: 'en', basePath: 'https://x/p/' }), /basePath/);
  assert.throws(() => renderPage(demoState(), { theme: 'neutral', lang: 'en', basePath: '//x/p/' }), /basePath/);
});

test('the page scripts build every request from the base, never from a fixed root path', () => {
  const dir = path.join(__dirname, '..', 'src', 'page');
  const src = fs.readFileSync(path.join(dir, 'live.js'), 'utf8') + fs.readFileSync(path.join(dir, 'page.js'), 'utf8');
  assert.ok(!/(fetch|EventSource)\(\s*'\//.test(src), 'no request to a literal /path');
  assert.ok(/'data'/.test(src) && /'events'/.test(src) && /'comment'/.test(src), 'routes are relative names joined to the base');
});
