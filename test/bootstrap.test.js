'use strict';

const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');
const bootstrap = require('../src/bootstrap');
const { runInit } = require('../src/init');
const { parseArgs } = require('../src/cli');
const { validate } = require('../src/validate');
const { tmpDir, fakeExec, fakeGithubFetch, baseEnv } = require('./helpers');

function git(dir, ...args) {
  const r = spawnSync('git', args, { cwd: dir, encoding: 'utf8' });
  assert.strictEqual(r.status, 0, `git ${args.join(' ')}: ${r.stderr}`);
  return r.stdout.trim();
}

// A git repository with one commit per subject, oldest first.
function repo(subjects = ['first'], readme = null) {
  const dir = tmpDir();
  git(dir, 'init', '-q', '-b', 'main');
  git(dir, 'config', 'user.email', 'test@example.com');
  git(dir, 'config', 'user.name', 'test');
  git(dir, 'config', 'commit.gpgsign', 'false');
  subjects.forEach((subject, i) => {
    fs.writeFileSync(path.join(dir, `f${i}.txt`), `${i}\n`);
    git(dir, 'add', `f${i}.txt`);
    git(dir, 'commit', '-q', '-m', subject);
  });
  if (readme !== null) fs.writeFileSync(path.join(dir, 'README.md'), readme);
  return dir;
}

const DRAFT = {
  project: 'Abholbereit',
  milestones: [{ id: 'm1', title: 'Ordering flow' }, { id: 'm2', title: 'Kitchen' }],
  items: [
    { id: 'menu-editor', title: 'Menu editor', milestone: 'm1', status: 'done', note: 'Merged in #42' },
    { id: 'checkout', title: 'Checkout with pickup time', milestone: 'm1', status: 'active' },
    { id: 'kitchen-display', title: 'Kitchen display', milestone: 'm2', status: 'todo' },
  ],
};

// Records every prompt and answers in a code fence, the way CLI providers
// often do.
function draftProvider({ answer = DRAFT, prompts = [] } = {}) {
  return {
    name: 'fake',
    async classify(prompt, { system } = {}) {
      prompts.push({ prompt, system });
      return `\`\`\`json\n${JSON.stringify(answer)}\n\`\`\``;
    },
  };
}

// Counts calls; for the cases where the provider must not be asked.
function countingProvider(calls) {
  return { name: 'fake', async classify() { calls.n++; return JSON.stringify(DRAFT); } };
}

const read = (file) => JSON.parse(fs.readFileSync(file, 'utf8'));

test('validateDraft keeps agent statuses, one active item and known milestones', () => {
  const r = bootstrap.validateDraft({
    milestones: [{ id: 'm1', title: 'Start' }, { id: 'Not Kebab', title: 'Later' }, { title: '' }, { id: 3, title: 'Numeric id' }],
    items: [
      { id: 'a', title: 'A', milestone: 'm1', status: 'active' },
      { id: 'b', title: 'B', milestone: 'm1', status: 'active' },
      { id: 'c', title: 'C', milestone: 'm1', status: 'blocked', note: 42 },
      { id: 'Also Not Kebab', title: 'Über die Straße', milestone: 'Not Kebab', status: 'done', note: 'Shipped' },
      { id: 'a', title: 'Duplicate', milestone: 'm1', status: 'todo' },
      { id: 'x', title: 'Nowhere', milestone: 'm9', status: 'todo' },
      { id: 7, title: 'Seven', milestone: 'm3', status: 'todo' },
    ],
  }, { project: 'dir-name' });
  assert.strictEqual(r.ok, true, r.errors.join('; '));
  assert.deepStrictEqual(r.value, {
    project: 'dir-name',
    milestones: [{ id: 'm1', title: 'Start' }, { id: 'm2', title: 'Later' }, { id: 'm3', title: 'Numeric id' }],
    items: [
      { id: 'a', title: 'A', milestone: 'm1', status: 'active' },
      { id: 'b', title: 'B', milestone: 'm1', status: 'todo' },
      { id: 'c', title: 'C', milestone: 'm1', status: 'todo' },
      { id: 'uber-die-strasse', title: 'Über die Straße', milestone: 'm2', status: 'done', note: 'Shipped' },
      { id: 'seven', title: 'Seven', milestone: 'm3', status: 'todo' },
    ],
  });
  assert.deepStrictEqual(validate(r.value), []);
});

test('validateDraft fails on wrong shapes and on answers with nothing usable', () => {
  assert.strictEqual(bootstrap.validateDraft([]).ok, false);
  assert.strictEqual(bootstrap.validateDraft(null).ok, false);
  assert.strictEqual(bootstrap.validateDraft({ milestones: 'no', items: [] }).ok, false);
  assert.strictEqual(bootstrap.validateDraft({ milestones: [{ id: 'm1', title: 'x' }], items: [] }).ok, false);
  assert.strictEqual(bootstrap.validateDraft({ milestones: [{ id: 'm1', title: 'x' }], items: [{ id: 'a', title: 'A', milestone: 'nope', status: 'todo' }] }).ok, false);
});

test('slug turns titles into ids', () => {
  assert.strictEqual(bootstrap.slug('Straße & Über-Uns!'), 'strasse-uber-uns');
  assert.strictEqual(bootstrap.slug('  Checkout with pickup time  '), 'checkout-with-pickup-time');
  assert.strictEqual(bootstrap.slug('!!!'), '');
  assert.ok(bootstrap.slug('word '.repeat(40)).length <= 60);
  assert.ok(!bootstrap.slug('word '.repeat(40)).endsWith('-'));
});

test('README headings skip fenced blocks and go three levels deep', () => {
  const dir = tmpDir();
  fs.writeFileSync(path.join(dir, 'README.md'), [
    '# Abholbereit', '', 'Intro', '', '## Ordering flow', '', '```sh', '# not a heading', '```', '', '### Kitchen display ###', '#### Too deep', '',
  ].join('\n'));
  assert.deepStrictEqual(bootstrap.readmeHeadings(dir), [
    { level: 1, text: 'Abholbereit' },
    { level: 2, text: 'Ordering flow' },
    { level: 3, text: 'Kitchen display' },
  ]);
  assert.deepStrictEqual(bootstrap.readmeHeadings(tmpDir()), []);
});

test('the prompt lists every source and names the language', () => {
  const prompt = bootstrap.buildPrompt({
    lang: 'de',
    sources: {
      project: 'abholbereit',
      commits: [{ date: '2026-09-01', subject: 'Add menu editor' }],
      headings: [{ level: 2, text: 'Ordering flow' }],
      prs: [
        { number: 42, title: 'Menu editor', state: 'closed', merged: true, draft: false },
        { number: 44, title: 'Checkout', state: 'open', merged: false, draft: true },
      ],
    },
  });
  assert.ok(prompt.includes('Directory name: abholbereit'));
  assert.ok(prompt.includes('- 2026-09-01 Add menu editor'));
  assert.ok(prompt.includes('- ## Ordering flow'));
  assert.ok(prompt.includes('- #42 [merged] Menu editor'));
  assert.ok(prompt.includes('- #44 [open, draft] Checkout'));
  assert.ok(prompt.includes('in German'));
  assert.ok(prompt.includes('"id": "menu-editor"'), 'schema example');
  const empty = bootstrap.buildPrompt({ sources: { project: 'x', commits: [], headings: [], prs: [] } });
  assert.strictEqual(empty.split('(none)').length - 1, 3);
});

test('init drafts the first roadmap from git history and the README', async () => {
  const dir = repo(['Add menu editor', 'Start checkout'], '# Abholbereit\n\n## Ordering flow\n');
  const file = path.join(dir, 'roadmap.json');
  const prompts = [];
  const lines = [];
  const code = await runInit({ file }, baseEnv, { log: (s) => lines.push(s), exec: fakeExec(), provider: draftProvider({ prompts }) });
  assert.strictEqual(code, 0);
  assert.deepStrictEqual(read(file), DRAFT);
  assert.deepStrictEqual(validate(read(file)), []);
  assert.strictEqual(prompts.length, 1);
  assert.strictEqual(prompts[0].system, bootstrap.SYSTEM);
  assert.ok(prompts[0].prompt.includes('Start checkout'));
  assert.ok(prompts[0].prompt.includes('- ## Ordering flow'));
  assert.ok(lines.some((l) => l.includes('commits: 2')), lines.join('\n'));
  assert.ok(lines.some((l) => l.includes('milestones: 2, items: 3')), lines.join('\n'));
  assert.ok(fs.existsSync(path.join(dir, 'AGENTS.md')));
  assert.ok(fs.existsSync(path.join(dir, '.github', 'workflows', 'roadmap.yml')));
});

test('init reads pull request titles without the per-PR review and comment calls', async () => {
  const dir = repo();
  const prompts = [];
  const calls = [];
  await runInit({ file: path.join(dir, 'roadmap.json'), repo: 'acme/abholbereit' }, baseEnv, {
    log: () => {}, exec: fakeExec(), credential: { token: 't' }, fetchFn: fakeGithubFetch({ calls }), provider: draftProvider({ prompts }),
  });
  assert.ok(calls.length > 0);
  assert.ok(calls.every((u) => new URL(u).pathname === '/repos/acme/abholbereit/pulls'), calls.join('\n'));
  assert.ok(prompts[0].prompt.includes('#42 [merged]'), prompts[0].prompt);
});

test('a GitHub error or rate limit only narrows the draft, and init does not wait', async () => {
  for (const response of [
    () => new Response(JSON.stringify({ message: 'Not Found' }), { status: 404, headers: { 'content-type': 'application/json' } }),
    () => new Response('{}', { status: 429, headers: { 'retry-after': '60' } }),
  ]) {
    const dir = repo();
    const file = path.join(dir, 'roadmap.json');
    const prompts = [];
    const lines = [];
    const started = Date.now();
    await runInit({ file, repo: 'acme/private' }, baseEnv, {
      log: (s) => lines.push(s), exec: fakeExec(), credential: null, fetchFn: async () => response(), provider: draftProvider({ prompts }),
    });
    assert.ok(Date.now() - started < 5000, 'no waiting on a rate limit');
    assert.ok(lines.some((l) => l.startsWith('Could not read pull requests')), lines.join('\n'));
    assert.strictEqual(prompts.length, 1, 'still drafted from git history');
    assert.deepStrictEqual(read(file), DRAFT);
  }
});

test('without a provider init writes the empty skeleton and says why', async () => {
  const dir = repo();
  const file = path.join(dir, 'roadmap.json');
  const lines = [];
  await runInit({ file }, baseEnv, { log: (s) => lines.push(s), exec: fakeExec([]) });
  assert.deepStrictEqual(read(file), bootstrap.skeleton(path.basename(dir)));
  assert.ok(lines.some((l) => l.startsWith('No provider')), lines.join('\n'));
});

test('with nothing to draft from, the provider is not asked', async () => {
  const dir = tmpDir();
  const file = path.join(dir, 'roadmap.json');
  const calls = { n: 0 };
  const lines = [];
  await runInit({ file }, baseEnv, { log: (s) => lines.push(s), exec: fakeExec(), provider: countingProvider(calls) });
  assert.strictEqual(calls.n, 0);
  assert.deepStrictEqual(read(file), bootstrap.skeleton(path.basename(dir)));
  assert.ok(lines.some((l) => l.startsWith('Nothing to draft from')), lines.join('\n'));
});

test('a malformed answer is retried once, a provider error is not, and both fall back', async () => {
  let n = 0;
  const cases = [
    { provider: { name: 'fake', async classify() { n++; return 'no json here'; } }, calls: 2 },
    { provider: { name: 'fake', async classify() { n++; throw new Error('claude exited with 1'); } }, calls: 1 },
  ];
  for (const c of cases) {
    n = 0;
    const dir = repo();
    const file = path.join(dir, 'roadmap.json');
    const lines = [];
    await runInit({ file }, baseEnv, { log: (s) => lines.push(s), exec: fakeExec(), provider: c.provider });
    assert.strictEqual(n, c.calls);
    assert.deepStrictEqual(read(file), bootstrap.skeleton(path.basename(dir)));
    assert.ok(lines.some((l) => l.startsWith('Could not draft')), lines.join('\n'));
  }
});

test('--no-bootstrap writes exactly the old skeleton and asks nobody', async () => {
  const dir = repo(['Add menu editor']);
  const file = path.join(dir, 'roadmap.json');
  const calls = { n: 0 };
  await runInit({ file, noBootstrap: true }, baseEnv, { log: () => {}, exec: fakeExec(), provider: countingProvider(calls) });
  assert.strictEqual(calls.n, 0);
  const old = { project: path.basename(dir), milestones: [{ id: 'm1', title: 'MVP' }], items: [] };
  assert.strictEqual(fs.readFileSync(file, 'utf8'), `${JSON.stringify(old, null, 2)}\n`);
  assert.strictEqual(parseArgs(['init', '--no-bootstrap']).noBootstrap, true);
  assert.strictEqual(parseArgs(['init']).noBootstrap, false);
});

test('a second init keeps every file and does not ask the provider', async () => {
  const dir = repo();
  const file = path.join(dir, 'roadmap.json');
  await runInit({ file }, baseEnv, { log: () => {}, exec: fakeExec(), provider: draftProvider() });
  const before = fs.readFileSync(file, 'utf8');
  const calls = { n: 0 };
  const lines = [];
  await runInit({ file }, baseEnv, { log: (s) => lines.push(s), exec: fakeExec(), provider: countingProvider(calls) });
  assert.strictEqual(calls.n, 0);
  assert.strictEqual(fs.readFileSync(file, 'utf8'), before);
  assert.strictEqual(lines.filter((l) => l.startsWith('Kept')).length, 3, lines.join('\n'));
});
