'use strict';

const { test } = require('node:test');
const assert = require('node:assert');
const { pagesStatus, enablePages } = require('../src/pages');

const respond = (body, status = 200) => new Response(JSON.stringify(body), { status });

test('pagesStatus: off, on, unknown', async () => {
  assert.deepStrictEqual(await pagesStatus({ repo: 'a/b', token: 't', fetchFn: async () => respond({ message: 'Not Found' }, 404) }), { enabled: false });
  assert.deepStrictEqual(await pagesStatus({ repo: 'a/b', token: 't', fetchFn: async () => respond({ html_url: 'https://a.github.io/b/' }) }), { enabled: true, url: 'https://a.github.io/b/roadmap/' });
  assert.deepStrictEqual(await pagesStatus({ repo: 'a/b', token: 't', fetchFn: async () => respond({ html_url: 'https://a.github.io/b' }) }), { enabled: true, url: 'https://a.github.io/b/roadmap/' });
  assert.strictEqual(await pagesStatus({ repo: 'a/b', token: 't', fetchFn: async () => respond({}, 500) }), null);
  assert.strictEqual(await pagesStatus({ repo: 'a/b', token: 't', fetchFn: async () => { throw new Error('down'); } }), null);
  assert.strictEqual(await pagesStatus({ repo: null, token: 't' }), null);
  assert.strictEqual(await pagesStatus({ repo: 'a/b', token: '' }), null);
});

test('enablePages posts the source and returns the new status', async () => {
  const calls = [];
  const fetchFn = async (url, init) => {
    calls.push({ url, method: init.method, body: init.body });
    return respond({ html_url: 'https://a.github.io/b/' }, 201);
  };
  const r = await enablePages({ repo: 'a/b', token: 't', fetchFn });
  assert.deepStrictEqual(r, { enabled: true, url: 'https://a.github.io/b/roadmap/' });
  assert.strictEqual(calls[0].method, 'POST');
  assert.ok(calls[0].url.endsWith('/repos/a/b/pages'));
  assert.deepStrictEqual(JSON.parse(calls[0].body), { source: { branch: 'main', path: '/' } });
  await assert.rejects(() => enablePages({ repo: 'a/b', token: 't', fetchFn: async () => respond({ message: 'Resource not accessible by integration' }, 403) }), /Resource not accessible/);
  const already = await enablePages({ repo: 'a/b', token: 't', fetchFn: async (url, init) => (init.method === 'POST' ? respond({}, 409) : respond({ html_url: 'https://a.github.io/b/' })) });
  assert.strictEqual(already.enabled, true);
});
