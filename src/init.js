'use strict';

// roadmap-live init: writes roadmap.json, copies AGENTS.md and writes the
// GitHub workflow file. Existing files are never overwritten.
//
// A missing roadmap.json is drafted from the repository first (bootstrap.js):
// commit subjects, README headings and pull request titles, through the same
// provider chain sync uses. When nothing can be drafted, the file is the empty
// skeleton it always was, and init says why. --no-bootstrap skips the draft.

const fs = require('fs');
const path = require('path');
const i18n = require('./i18n');
const { displayName, REPO_RE } = require('./validate');
const { resolveCredential } = require('./auth');
const { resolveProvider } = require('./providers');
const github = require('./github');
const bootstrap = require('./bootstrap');

const ROOT = path.join(__dirname, '..');

function writeIfMissing(file, content, t, log) {
  if (fs.existsSync(file)) {
    log(t('cli.init.exists', { file: displayName(file) }));
    return false;
  }
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, content);
  log(t('cli.init.wrote', { file: displayName(file) }));
  return true;
}

// Pull request titles for the draft. The repository comes from --repo or the
// git remote, not from GITHUB_REPOSITORY: init never runs in the Action, and a
// variable left over in a shell would name another project. A public
// repository answers without a token, so a missing credential only narrows the
// draft for private ones. A rate limit ends the read at once instead of
// waiting: init should not sit for minutes over a best-effort draft.
async function readPullRequests({ opts, env, dir, t, log, deps }) {
  const repo = typeof opts.repo === 'string' && REPO_RE.test(opts.repo) ? opts.repo : github.gitRemote(dir, deps.exec);
  if (!repo) return [];
  const cred = deps.credential !== undefined
    ? deps.credential
    : await resolveCredential({ env, exec: deps.exec, interactive: false, t });
  const client = github.createClient({
    token: cred ? cred.token : null,
    fetchFn: deps.fetchFn,
    baseUrl: deps.baseUrl,
    wait: () => Promise.reject(new Error('GitHub rate limit')),
  });
  try {
    return await github.fetchPullRequestList(client, repo, { max: bootstrap.MAX_PRS });
  } catch (e) {
    log(t('cli.init.noPrs', { reason: e.message }));
    return [];
  }
}

// The roadmap to write when none exists: a draft from the repository, or the
// empty skeleton with one line saying why there is no draft.
async function firstRoadmap({ opts, env, dir, project, t, log, deps }) {
  const empty = bootstrap.skeleton(project);
  if (opts.noBootstrap) return empty;

  const prs = await readPullRequests({ opts, env, dir, t, log, deps });
  const sources = await bootstrap.collectSources({ dir, exec: deps.gitExec, prs });
  if (!bootstrap.hasSources(sources)) {
    log(t('cli.init.noSources'));
    return empty;
  }
  log(t('cli.init.reading', { commits: sources.commits.length, prs: sources.prs.length, headings: sources.headings.length }));

  let provider = deps.provider || null;
  if (!provider) {
    try {
      provider = resolveProvider({ env, name: opts.provider, exec: deps.exec, t }).provider;
    } catch (e) {
      log(t('cli.init.failed', { reason: e.message }));
      return empty;
    }
  }
  // The agent provider hands work over through a file and cannot answer
  // directly. Its equivalent here is AGENTS.md, which init writes anyway.
  if (!provider || provider.handoff) {
    log(t('cli.init.noProvider'));
    return empty;
  }

  log(t('cli.init.drafting', { provider: provider.name }));
  const { lang } = i18n.resolveLanguage({ roadmap: null, env });
  const r = await bootstrap.draftRoadmap({ sources, provider, lang, env, log, providerOpts: deps.providerOpts });
  if (!r.ok) {
    log(t('cli.init.failed', { reason: r.malformed ? t('cli.sync.malformed') : r.reason }));
    return empty;
  }
  log(t('cli.init.drafted', { milestones: r.value.milestones.length, items: r.value.items.length }));
  return r.value;
}

async function runInit(opts, env = process.env, deps = {}) {
  const log = deps.log || console.log;
  const t = i18n.cliT(null, env);
  const dir = path.dirname(opts.file);
  const project = path.basename(path.resolve(dir));
  // An existing roadmap.json is kept, so there is nothing to draft for it.
  const roadmap = fs.existsSync(opts.file) ? null : await firstRoadmap({ opts, env, dir, project, t, log, deps });
  writeIfMissing(opts.file, `${JSON.stringify(roadmap || bootstrap.skeleton(project), null, 2)}\n`, t, log);
  writeIfMissing(path.join(dir, 'AGENTS.md'), fs.readFileSync(path.join(ROOT, 'AGENTS.md'), 'utf8'), t, log);
  writeIfMissing(path.join(dir, '.github', 'workflows', 'roadmap.yml'), fs.readFileSync(path.join(ROOT, 'examples', 'workflow.yml'), 'utf8'), t, log);
  log(t('cli.init.done'));
  return 0;
}

module.exports = { runInit, firstRoadmap };
