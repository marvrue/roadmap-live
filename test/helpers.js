'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const assert = require('assert');

const FIXTURES = path.join(__dirname, 'fixtures');
const SNAPSHOTS = path.join(__dirname, 'snapshots');

function fixture(rel) {
  return JSON.parse(fs.readFileSync(path.join(FIXTURES, rel), 'utf8'));
}

function tmpDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'roadmap-live-test-'));
}

// A fetch that serves the recorded GitHub fixtures for acme/abholbereit.
// Supports pagination for /pulls (two pages) so the Link handling is covered.
function fakeGithubFetch({ calls = [] } = {}) {
  const base = 'https://api.github.com';
  const pulls = fixture('github/pulls.json');
  const respond = (body, headers = {}, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json', ...headers } });
  return async (url) => {
    calls.push(url);
    const u = new URL(url);
    const p = u.pathname;
    if (p === '/repos/acme/abholbereit/pulls') {
      const page = Number(u.searchParams.get('page') || '1');
      if (page === 1) return respond(pulls.slice(0, 2), { link: `<${base}${p}?state=all&sort=updated&direction=desc&per_page=100&page=2>; rel="next"` });
      return respond(pulls.slice(2));
    }
    let m = /^\/repos\/acme\/abholbereit\/pulls\/(\d+)\/reviews$/.exec(p);
    if (m) return respond(fixture(`github/pr-${m[1]}-reviews.json`));
    m = /^\/repos\/acme\/abholbereit\/issues\/(\d+)\/comments$/.exec(p);
    if (m) return respond(fixture(`github/pr-${m[1]}-comments.json`));
    m = /^\/repos\/acme\/abholbereit\/pulls\/(\d+)\/comments$/.exec(p);
    if (m) return respond(fixture(`github/pr-${m[1]}-review-comments.json`));
    return respond({ message: 'Not Found' }, {}, 404);
  };
}

// A provider that answers with the recorded classification for the PR named
// in the prompt.
function fakeProvider({ log = [] } = {}) {
  return {
    name: 'fake',
    detect: () => ({ ok: true, reason: 'test' }),
    async classify(prompt) {
      const m = /Pull request #(\d+):/.exec(prompt);
      log.push(Number(m[1]));
      return `Here you go:\n\`\`\`json\n${JSON.stringify(fixture(`classify/pr-${m[1]}.json`))}\n\`\`\``;
    },
  };
}

function assertSnapshot(name, content) {
  const file = path.join(SNAPSHOTS, name);
  if (process.env.UPDATE_SNAPSHOTS || !fs.existsSync(file)) {
    fs.mkdirSync(SNAPSHOTS, { recursive: true });
    fs.writeFileSync(file, content);
    return;
  }
  const expected = fs.readFileSync(file, 'utf8');
  assert.strictEqual(content, expected, `snapshot ${name} differs (run with UPDATE_SNAPSHOTS=1 after a deliberate change)`);
}

// spawnSync stand-in: `available` lists binaries that answer --version.
function fakeExec(available = [], outputs = {}) {
  return (bin, args) => {
    if (bin === 'gh' && args[0] === 'auth') {
      return outputs.gh !== undefined ? { status: 0, stdout: outputs.gh } : { status: 1, stdout: '' };
    }
    if (bin === 'git') return outputs.git !== undefined ? { status: 0, stdout: outputs.git } : { status: 1, stdout: '' };
    return available.includes(bin) ? { status: 0, stdout: '1.0.0' } : { status: 1, stdout: '' };
  };
}

const baseEnv = { PATH: process.env.PATH, HOME: process.env.HOME, LANG: 'C' };

module.exports = { fixture, tmpDir, fakeGithubFetch, fakeProvider, assertSnapshot, fakeExec, baseEnv, FIXTURES };
