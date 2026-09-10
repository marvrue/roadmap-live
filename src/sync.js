'use strict';

// roadmap-live sync: reads new pull request activity from GitHub, classifies
// it against the items through the provider chain, applies the rules and
// writes roadmap.json plus CHANGELOG.md. Nothing is written before every
// classification is applied in memory, so the file is never half updated.

const fs = require('fs');
const path = require('path');
const i18n = require('./i18n');
const { loadRoadmap, displayName } = require('./validate');
const { resolveCredential } = require('./auth');
const { resolveProvider } = require('./providers');
const github = require('./github');
const { classifyPr, buildPrompt, validateClassification, SCHEMA_EXAMPLE } = require('./classify');
const { applyClassification } = require('./apply');

const INBOX_DIR = '.roadmap-live';
const INBOX_FILE = 'inbox.json';
const PENDING_FILE = 'pending.json';
const RESULT_FILE = 'result.json';

function writeJson(file, value) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`);
}

function readJson(file) {
  try { return JSON.parse(fs.readFileSync(file, 'utf8')); } catch { return null; }
}

function changelogLines(changes, t, lang) {
  return changes
    .filter((c) => c.kind === 'status')
    .map((c) => t('cli.changelog.line', { date: i18n.formatDate(c.at, lang, { year: 'numeric', month: '2-digit', day: '2-digit' }), title: c.title, from: c.from, to: c.to, url: c.url || `#${c.pr}` }));
}

function appendChangelog(file, lines, t) {
  if (!lines.length) return false;
  let existing = '';
  try { existing = fs.readFileSync(file, 'utf8'); } catch { existing = ''; }
  const head = existing ? existing.replace(/\s*$/, '\n') : t('cli.changelog.header');
  fs.writeFileSync(file, `${head}${lines.join('\n')}\n`);
  return true;
}

function describeChange(c, t) {
  switch (c.kind) {
    case 'status': return t('cli.sync.change.status', { title: c.title, from: c.from, to: c.to, number: c.pr });
    case 'pr': return t('cli.sync.change.pr', { title: c.title, number: c.pr });
    case 'open_point': return `${t('cli.sync.change.openPoint', { title: c.title, number: c.pr })}: ${c.text}`;
    case 'resolved': return t('cli.sync.change.resolved', { title: c.title, number: c.pr });
    case 'unplanned': return t('cli.sync.change.unplanned', { title: c.title, number: c.pr });
    case 'unplanned_removed': return t('cli.sync.change.unplannedRemoved', { title: c.title, number: c.pr });
    default: return JSON.stringify(c);
  }
}

// Applies classifications to a copy of the roadmap and returns the result.
function applyAll(roadmap, prs, results, { repo, lastRun }) {
  const next = JSON.parse(JSON.stringify(roadmap));
  const changes = [];
  for (const pr of prs) {
    const result = results[pr.number];
    if (!result) continue;
    for (const c of applyClassification(next, pr, result)) changes.push(c);
  }
  if (!next.sync) next.sync = {};
  next.sync.last_run = lastRun;
  next.sync.repo = repo;
  return { next, changes };
}

function writeRoadmap(file, data) {
  fs.writeFileSync(file, `${JSON.stringify(data, null, 2)}\n`);
}

// Last run to store: the run start, or the earliest updated_at of a PR that
// could not be classified so it is fetched again next time.
function nextLastRun(runStart, failed) {
  if (!failed.length) return runStart;
  const earliest = failed.map((pr) => Date.parse(pr.updated_at)).filter((x) => !Number.isNaN(x)).sort()[0];
  return earliest ? new Date(earliest - 1000).toISOString() : runStart;
}

function finish({ opts, roadmap, prs, results, failed, repo, runStart, t, lang, log, dir }) {
  const lastRun = nextLastRun(runStart, failed);
  const { next, changes } = applyAll(roadmap, prs, results, { repo, lastRun });
  if (changes.length) {
    log(t('cli.sync.planned'));
    for (const c of changes) log(`  - ${describeChange(c, t)}`);
  } else {
    log(t('cli.sync.noChanges'));
  }
  if (opts.dryRun) {
    log(t('cli.sync.dryRun'));
    return 0;
  }
  writeRoadmap(opts.file, next);
  const changelog = path.join(dir, 'CHANGELOG.md');
  const wroteLog = appendChangelog(changelog, changelogLines(changes, t, lang), t);
  log(wroteLog ? t('cli.sync.wrote', { file: displayName(opts.file), changelog: displayName(changelog) }) : t('cli.sync.wroteRoadmap', { file: displayName(opts.file) }));
  return 0;
}

// --apply: take .roadmap-live/result.json written by the coding agent.
function applyFromInbox({ opts, roadmap, t, lang, log, dir }) {
  const pending = readJson(path.join(dir, INBOX_DIR, PENDING_FILE));
  const resultFile = path.join(dir, INBOX_DIR, RESULT_FILE);
  const raw = readJson(resultFile);
  if (!raw) { log(t('cli.sync.noInbox')); return 1; }
  if (!pending || !Array.isArray(pending.prs)) { log(t('cli.sync.noPending')); return 1; }
  const map = raw.results && typeof raw.results === 'object' ? raw.results : raw;
  const itemIds = roadmap.items.map((it) => it.id);
  const results = {};
  const failed = [];
  for (const pr of pending.prs) {
    const entry = map[String(pr.number)];
    const checked = validateClassification(entry, itemIds);
    if (checked.ok) results[pr.number] = checked.value;
    else { failed.push(pr); log(t('cli.sync.skipped', { number: pr.number, reason: checked.errors.join('; ') || 'missing' })); }
  }
  log(t('cli.sync.applied', { n: Object.keys(results).length }));
  const code = finish({ opts, roadmap, prs: pending.prs, results, failed, repo: pending.repo, runStart: pending.run_start, t, lang, log, dir });
  if (code === 0 && !opts.dryRun) {
    for (const f of [INBOX_FILE, PENDING_FILE, RESULT_FILE]) {
      try { fs.unlinkSync(path.join(dir, INBOX_DIR, f)); } catch { /* ignore */ }
    }
  }
  return code;
}

function writeInbox({ dir, roadmap, prs, repo, runStart, lang, t, log }) {
  const titles = {};
  roadmap.milestones.forEach((m) => { titles[m.id] = m.title; });
  const inbox = {
    version: 1,
    created: runStart,
    repo,
    language: lang,
    instructions: 'Classify every pull request in "prs" against "items". For each PR write one object in the shape of "schema" and store them in .roadmap-live/result.json as an object keyed by PR number (for example {"42": {...}}). Then delete this file and run: roadmap-live sync --apply',
    schema: SCHEMA_EXAMPLE,
    items: roadmap.items.map((it) => ({ id: it.id, title: it.title, milestone: titles[it.milestone] || it.milestone, status: it.status })),
    prs: prs.map((pr) => ({ number: pr.number, prompt: buildPrompt({ roadmap, pr, lang }) })),
  };
  writeJson(path.join(dir, INBOX_DIR, INBOX_FILE), inbox);
  writeJson(path.join(dir, INBOX_DIR, PENDING_FILE), { version: 1, repo, run_start: runStart, prs });
  log(t('cli.sync.agentHandoff', { n: prs.length }));
}

async function runSync(opts, env = process.env, deps = {}) {
  const log = deps.log || console.log;
  const result = loadRoadmap(opts.file);
  const t = i18n.cliT(result.data, env);
  if (!result.ok) {
    console.error(t('cli.invalidFile', { file: displayName(opts.file) }));
    for (const err of result.errors) console.error(`  - ${err}`);
    return 1;
  }
  const roadmap = result.data;
  const { lang } = i18n.resolveLanguage({ roadmap, env });
  const dir = path.dirname(opts.file);

  if (opts.apply) return applyFromInbox({ opts, roadmap, t, lang, log, dir });

  const repoInfo = github.resolveRepo({ flag: opts.repo, roadmap, env, cwd: dir, exec: deps.exec });
  if (!repoInfo) { console.error(t('cli.doctor.repoNone')); return 1; }
  const repo = repoInfo.repo;

  const cred = deps.credential || await resolveCredential({ env, exec: deps.exec, interactive: true, fetchFn: deps.fetchFn, out: log, t });
  if (!cred) { console.error(t('cli.auth.none')); return 1; }

  let chosen;
  try {
    chosen = resolveProvider({ env, name: opts.provider, exec: deps.exec, t });
  } catch (e) {
    console.error(`roadmap-live: ${e.message}`);
    return 1;
  }
  const provider = deps.provider || chosen.provider;

  const runStart = new Date(deps.now || Date.now()).toISOString();
  const since = (roadmap.sync && roadmap.sync.last_run) || github.firstRunSince(deps.now || Date.now());
  log(t('cli.sync.repo', { repo, since: roadmap.sync && roadmap.sync.last_run ? i18n.formatDate(since, lang, { dateStyle: 'medium', timeStyle: 'short' }) : t('cli.sync.firstRun') }));
  log(t('cli.sync.fetching'));
  const client = github.createClient({ token: cred.token, fetchFn: deps.fetchFn, baseUrl: deps.baseUrl, wait: deps.wait, log, t });
  const prs = await github.fetchPullRequests(client, repo, since);
  if (!prs.length) {
    log(t('cli.sync.noActivity'));
    return 0;
  }
  log(t('cli.sync.prs', { n: prs.length }));

  if (provider.handoff) {
    if (opts.dryRun) {
      log(t('cli.sync.agentHandoff', { n: prs.length }));
      log(t('cli.sync.dryRun'));
      return 0;
    }
    writeInbox({ dir, roadmap, prs, repo, runStart, lang, t, log });
    return 0;
  }

  const results = {};
  const failed = [];
  for (const pr of prs) {
    log(t('cli.sync.classifying', { number: pr.number, title: pr.title, provider: provider.name }));
    const r = await classifyPr({ roadmap, pr, provider, lang, env, log, providerOpts: deps.providerOpts });
    if (r.ok) results[pr.number] = r.value;
    else {
      failed.push(pr);
      log(t('cli.sync.skipped', { number: pr.number, reason: r.malformed ? t('cli.sync.malformed') : r.reason }));
    }
  }
  return finish({ opts, roadmap, prs, results, failed, repo, runStart, t, lang, log, dir });
}

module.exports = { runSync, applyAll, changelogLines, appendChangelog, describeChange, nextLastRun, writeInbox, applyFromInbox, INBOX_DIR, INBOX_FILE, PENDING_FILE, RESULT_FILE };
