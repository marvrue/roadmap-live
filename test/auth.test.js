'use strict';

const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const auth = require('../src/auth');
const { tmpDir, fakeExec, baseEnv } = require('./helpers');

test('GITHUB_TOKEN wins over gh and the stored token', async () => {
  const dir = tmpDir();
  auth.writeStored({ ROADMAP_LIVE_CONFIG_DIR: dir }, { token: 'stored' });
  const env = { ...baseEnv, GITHUB_TOKEN: 'env-token', ROADMAP_LIVE_CONFIG_DIR: dir };
  const r = await auth.resolveCredential({ env, exec: fakeExec([], { gh: 'gh-token\n' }), interactive: false });
  assert.strictEqual(r.token, 'env-token');
  assert.strictEqual(r.source, 'env');
});

test('gh auth token is second', async () => {
  const dir = tmpDir();
  auth.writeStored({ ROADMAP_LIVE_CONFIG_DIR: dir }, { token: 'stored' });
  const env = { ...baseEnv, ROADMAP_LIVE_CONFIG_DIR: dir };
  const r = await auth.resolveCredential({ env, exec: fakeExec([], { gh: 'gh-token\n' }), interactive: false });
  assert.strictEqual(r.token, 'gh-token');
  assert.strictEqual(r.source, 'gh');
});

test('stored token is third and the file has mode 600', async () => {
  const dir = tmpDir();
  const env = { ...baseEnv, ROADMAP_LIVE_CONFIG_DIR: dir };
  const file = auth.writeStored(env, { token: 'stored' });
  if (process.platform !== 'win32') assert.strictEqual(fs.statSync(file).mode & 0o777, 0o600);
  const r = await auth.resolveCredential({ env, exec: fakeExec([]), interactive: false });
  assert.strictEqual(r.token, 'stored');
  assert.strictEqual(r.source, 'stored');
  assert.strictEqual(path.dirname(file), dir);
});

test('nothing found returns null without a client id', async () => {
  const env = { ...baseEnv, ROADMAP_LIVE_CONFIG_DIR: tmpDir() };
  const r = await auth.resolveCredential({ env, exec: fakeExec([]), interactive: true });
  assert.strictEqual(r, null);
});

test('device flow prints the code, polls, stores the token', async () => {
  const dir = tmpDir();
  const env = { ...baseEnv, ROADMAP_LIVE_CONFIG_DIR: dir, ROADMAP_GITHUB_CLIENT_ID: 'abc123' };
  const lines = [];
  let polls = 0;
  const fetchFn = async (url, init) => {
    const body = JSON.parse(init.body);
    if (url.includes('/device/code')) {
      assert.strictEqual(body.client_id, 'abc123');
      assert.strictEqual(body.scope, 'public_repo');
      return new Response(JSON.stringify({ device_code: 'dc', user_code: 'ABCD-1234', verification_uri: 'https://github.com/login/device', interval: 0, expires_in: 60 }));
    }
    polls++;
    if (polls < 3) return new Response(JSON.stringify({ error: 'authorization_pending' }));
    return new Response(JSON.stringify({ access_token: 'gho_new', token_type: 'bearer' }));
  };
  const r = await auth.resolveCredential({ env, exec: fakeExec([]), interactive: true, publicOnly: true, fetchFn, out: (l) => lines.push(l), wait: async () => {} });
  assert.strictEqual(r.token, 'gho_new');
  assert.strictEqual(r.source, 'device');
  assert.ok(lines[0].includes('ABCD-1234'));
  assert.ok(lines[0].includes('github.com/login/device'));
  assert.strictEqual(auth.readStored(env).token, 'gho_new');
  assert.strictEqual(auth.deleteStored(env), true);
  assert.strictEqual(auth.readStored(env), null);
});

test('explainCredential reports every step', () => {
  const env = { ...baseEnv, ROADMAP_LIVE_CONFIG_DIR: tmpDir() };
  const steps = auth.explainCredential(env, fakeExec([]));
  assert.strictEqual(steps.length, 3);
  assert.ok(steps.every((s) => s.ok === false));
});
