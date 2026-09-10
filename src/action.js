'use strict';

// GitHub Action entry: runs sync (anthropic provider) and render, then
// commits roadmap.json, the rendered page and CHANGELOG.md if anything
// changed. Inputs arrive as INPUT_* environment variables.

const path = require('path');
const { spawnSync } = require('child_process');
const i18n = require('./i18n');
const { runSync } = require('./sync');
const { runRender } = require('./render');
const { createClient } = require('./github');
const { loadRoadmap } = require('./validate');

function input(env, name, fallback) {
  const v = env[`INPUT_${name.toUpperCase()}`];
  return v === undefined || v === '' ? fallback : v;
}

function git(args, opts = {}) {
  const r = spawnSync('git', args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], ...opts });
  return { status: r.status, stdout: (r.stdout || '').trim(), stderr: (r.stderr || '').trim() };
}

function fail(msg) {
  console.error(`::error::${msg}`);
  return 1;
}

async function runAction(env = process.env) {
  const t = i18n.cliT(null, env);
  const apiKey = input(env, 'anthropic_api_key', '');
  const token = input(env, 'github_token', env.GITHUB_TOKEN || '');
  const roadmapPath = path.resolve(input(env, 'roadmap_path', 'roadmap.json'));
  const outputPath = path.resolve(input(env, 'output_path', path.join('roadmap', 'index.html')));
  const commit = input(env, 'commit', 'true') !== 'false';
  const repo = env.GITHUB_REPOSITORY;
  const dir = path.dirname(roadmapPath);

  const childEnv = { ...env, GITHUB_TOKEN: token };
  if (apiKey) childEnv.ANTHROPIC_API_KEY = apiKey;

  // Fail early with a readable message when the token lacks permissions.
  if (repo && token) {
    const client = createClient({ token });
    try {
      await client.get(`/repos/${repo}/pulls?per_page=1&state=all`);
    } catch (e) {
      if (e.status === 403 || e.status === 401) return fail(t('cli.action.noPullsPermission'));
      throw e;
    }
  }
  if (commit) {
    const dry = git(['push', '--dry-run'], { cwd: dir });
    if (dry.status !== 0 && /403|permission|denied|not permitted/i.test(dry.stderr)) return fail(t('cli.action.noWritePermission'));
  }

  if (!apiKey) {
    console.log(`::warning::${t('cli.action.noKey')}`);
  } else {
    const code = await runSync({ file: roadmapPath, repo: null, dryRun: false, apply: false, provider: 'anthropic' }, childEnv);
    if (code !== 0) return code;
  }

  const rendered = runRender({ file: roadmapPath, out: outputPath, theme: null, mode: null }, childEnv);
  if (rendered !== 0) return rendered;

  if (!commit) return 0;
  const files = [roadmapPath, outputPath, path.join(dir, 'CHANGELOG.md')].map((f) => path.relative(process.cwd(), f));
  git(['add', '--', ...files.filter((f) => require('fs').existsSync(f))]);
  const status = git(['status', '--porcelain', '--', ...files]);
  if (!status.stdout) {
    console.log(t('cli.action.nothingToCommit'));
    return 0;
  }
  git(['config', 'user.name', 'github-actions[bot]']);
  git(['config', 'user.email', '41898282+github-actions[bot]@users.noreply.github.com']);
  const c = git(['commit', '-m', t('cli.action.commitMessage')]);
  if (c.status !== 0) return fail(c.stderr || c.stdout);
  const p = git(['push']);
  if (p.status !== 0) return fail(/403|permission|denied/i.test(p.stderr) ? t('cli.action.noWritePermission') : p.stderr);
  console.log(t('cli.action.committed', { files: files.join(', ') }));
  void loadRoadmap;
  return 0;
}

if (require.main === module) {
  runAction().then((code) => process.exit(code)).catch((e) => {
    console.error(`::error::${e && e.message ? e.message : e}`);
    process.exit(1);
  });
}

module.exports = { runAction, input };
