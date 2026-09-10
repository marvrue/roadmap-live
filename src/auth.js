'use strict';

// GitHub credentials, resolved in this order and stopping at the first hit:
//   1. GITHUB_TOKEN
//   2. GitHub CLI: gh auth token
//   3. a token stored by `roadmap-live auth` (OAuth device flow)
//   4. nothing: one sentence with the options, exit 1
//
// The device flow needs a public OAuth app. Its client id ships in the code
// (GITHUB_OAUTH_CLIENT_ID) and can be overridden with ROADMAP_GITHUB_CLIENT_ID.

const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');
const i18n = require('./i18n');

// Public OAuth app for roadmap-live. Device flow needs no client secret.
// Register one at https://github.com/settings/applications/new with
// "Enable Device Flow" and put its client id here.
const GITHUB_OAUTH_CLIENT_ID = '';
const DEVICE_CODE_URL = 'https://github.com/login/device/code';
const TOKEN_URL = 'https://github.com/login/oauth/access_token';
const DETECT_TIMEOUT_MS = 2000;

function configDir(env = process.env) {
  if (env.ROADMAP_LIVE_CONFIG_DIR) return env.ROADMAP_LIVE_CONFIG_DIR;
  const base = env.XDG_CONFIG_HOME || path.join(os.homedir(), '.config');
  return path.join(base, 'roadmap-live');
}

function credentialsPath(env) {
  return path.join(configDir(env), 'credentials.json');
}

function readStored(env) {
  try {
    const data = JSON.parse(fs.readFileSync(credentialsPath(env), 'utf8'));
    return data && data.github && typeof data.github.token === 'string' && data.github.token ? data.github : null;
  } catch {
    return null;
  }
}

function writeStored(env, github) {
  const file = credentialsPath(env);
  fs.mkdirSync(path.dirname(file), { recursive: true, mode: 0o700 });
  fs.writeFileSync(file, `${JSON.stringify({ github }, null, 2)}\n`, { mode: 0o600 });
  try { fs.chmodSync(file, 0o600); } catch { /* ignore */ }
  return file;
}

function deleteStored(env) {
  try {
    fs.unlinkSync(credentialsPath(env));
    return true;
  } catch {
    return false;
  }
}

function ghToken(exec = spawnSync) {
  try {
    const r = exec('gh', ['auth', 'token'], { encoding: 'utf8', timeout: DETECT_TIMEOUT_MS, stdio: ['ignore', 'pipe', 'ignore'] });
    if (r.status === 0 && r.stdout && r.stdout.trim()) return r.stdout.trim();
  } catch { /* not installed */ }
  return null;
}

function clientId(env) {
  return env.ROADMAP_GITHUB_CLIENT_ID || GITHUB_OAUTH_CLIENT_ID || null;
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// OAuth device flow. Prints the code and URL, polls until the user confirms.
async function deviceFlow({ env = process.env, fetchFn = globalThis.fetch, out = console.log, publicOnly = false, wait = sleep, t } = {}) {
  const id = clientId(env);
  if (!id) throw Object.assign(new Error('no client id'), { code: 'NO_CLIENT_ID' });
  const scope = publicOnly ? 'public_repo' : 'repo';
  const start = await fetchFn(DEVICE_CODE_URL, {
    method: 'POST',
    headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
    body: JSON.stringify({ client_id: id, scope }),
  });
  if (!start.ok) throw new Error(`GitHub device code request failed: ${start.status}`);
  const dc = await start.json();
  out(t('cli.auth.openUrl', { url: dc.verification_uri || 'https://github.com/login/device', code: dc.user_code }));
  out(t('cli.auth.waiting'));
  let interval = (dc.interval || 5) * 1000;
  const deadline = Date.now() + (dc.expires_in || 900) * 1000;
  while (Date.now() < deadline) {
    await wait(interval);
    const res = await fetchFn(TOKEN_URL, {
      method: 'POST',
      headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
      body: JSON.stringify({ client_id: id, device_code: dc.device_code, grant_type: 'urn:ietf:params:oauth:grant-type:device_code' }),
    });
    const body = await res.json();
    if (body.access_token) {
      const file = writeStored(env, { token: body.access_token, scope, created: new Date().toISOString() });
      return { token: body.access_token, file };
    }
    if (body.error === 'authorization_pending') continue;
    if (body.error === 'slow_down') { interval += 5000; continue; }
    if (body.error === 'expired_token') throw Object.assign(new Error('expired'), { code: 'EXPIRED' });
    if (body.error === 'access_denied') throw Object.assign(new Error('denied'), { code: 'DENIED' });
    throw new Error(`GitHub device flow failed: ${body.error || res.status}`);
  }
  throw Object.assign(new Error('expired'), { code: 'EXPIRED' });
}

// Returns { token, source, reason } or null. With interactive: false the
// device flow is not started (doctor uses this).
async function resolveCredential({ env = process.env, exec = spawnSync, interactive = true, publicOnly = false, fetchFn, out, t } = {}) {
  t = t || i18n.cliT(null, env);
  if (env.GITHUB_TOKEN) return { token: env.GITHUB_TOKEN, source: 'env', name: t('cli.auth.envToken'), reason: t('cli.why.envSet', { name: 'GITHUB_TOKEN' }) };
  const gh = ghToken(exec);
  if (gh) return { token: gh, source: 'gh', name: t('cli.auth.ghCli'), reason: t('cli.why.ghLoggedIn') };
  const stored = readStored(env);
  if (stored) return { token: stored.token, source: 'stored', name: t('cli.auth.stored', { path: credentialsPath(env) }), reason: t('cli.why.storedToken') };
  if (interactive && clientId(env)) {
    const r = await deviceFlow({ env, fetchFn, out, publicOnly, t });
    return { token: r.token, source: 'device', name: t('cli.auth.deviceFlow'), reason: t('cli.why.fallback') };
  }
  return null;
}

// Why the chain stopped where it did, for doctor.
function explainCredential(env = process.env, exec = spawnSync, t) {
  t = t || i18n.cliT(null, env);
  const steps = [];
  steps.push({ name: t('cli.auth.envToken'), ok: !!env.GITHUB_TOKEN, reason: t(env.GITHUB_TOKEN ? 'cli.why.envSet' : 'cli.why.envUnset', { name: 'GITHUB_TOKEN' }) });
  const gh = !!ghToken(exec);
  steps.push({ name: t('cli.auth.ghCli'), ok: gh, reason: t(gh ? 'cli.why.ghLoggedIn' : 'cli.why.ghNotLoggedIn') });
  const stored = !!readStored(env);
  steps.push({ name: t('cli.auth.stored', { path: credentialsPath(env) }), ok: stored, reason: t(stored ? 'cli.why.storedToken' : 'cli.why.noStoredToken') });
  return steps;
}

async function runAuth(opts, env = process.env) {
  const t = i18n.cliT(null, env);
  if (opts.logout) {
    console.log(t(deleteStored(env) ? 'cli.auth.loggedOut' : 'cli.auth.nothingToLogout'));
    return 0;
  }
  try {
    const r = await deviceFlow({ env, publicOnly: opts.public, t });
    console.log(t('cli.auth.success', { path: r.file }));
    return 0;
  } catch (e) {
    if (e.code === 'NO_CLIENT_ID') console.error(t('cli.auth.noClientId'));
    else if (e.code === 'EXPIRED') console.error(t('cli.auth.expired'));
    else if (e.code === 'DENIED') console.error(t('cli.auth.denied'));
    else console.error(`roadmap-live: ${e.message}`);
    return 1;
  }
}

module.exports = { resolveCredential, explainCredential, deviceFlow, runAuth, credentialsPath, configDir, readStored, writeStored, deleteStored, ghToken, clientId, GITHUB_OAUTH_CLIENT_ID };
