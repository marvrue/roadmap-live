'use strict';

// roadmap-live doctor: explains which GitHub credential and which provider
// would be used, and why, without starting a browser login.

const fs = require('fs');
const i18n = require('./i18n');
const { loadRoadmap, displayName } = require('./validate');
const { explainCredential } = require('./auth');
const { resolveProvider, PROVIDERS } = require('./providers');
const github = require('./github');
const { DEFAULT_THEME } = require('./render');

async function runDoctor(opts, env = process.env, deps = {}) {
  const log = deps.log || console.log;
  const result = loadRoadmap(opts.file);
  const roadmap = result.data;
  const t = i18n.cliT(roadmap, env);
  log(t('cli.doctor.title'));

  if (fs.existsSync(opts.file)) log(t('cli.doctor.roadmap', { file: displayName(opts.file) }));
  else log(t('cli.doctor.roadmapMissing', { file: displayName(opts.file) }));
  if (!result.ok && fs.existsSync(opts.file)) for (const err of result.errors) log(`  - ${err}`);

  const repo = github.resolveRepo({ flag: opts.repo, roadmap, env, exec: deps.exec });
  log(repo ? t('cli.doctor.repo', { repo: repo.repo, source: t(`cli.doctor.repoSource.${repo.source}`) }) : t('cli.doctor.repoNone'));

  const steps = explainCredential(env, deps.exec, t);
  const hit = steps.find((s) => s.ok);
  if (hit) {
    log(t('cli.doctor.credential', { name: hit.name }));
    log(t('cli.doctor.credentialWhy', { reason: hit.reason }));
    for (const s of steps) { if (s === hit) break; log(t('cli.doctor.skipped', { name: s.name, reason: s.reason })); }
  } else {
    log(t('cli.doctor.credentialNone'));
    for (const s of steps) log(t('cli.doctor.skipped', { name: s.name, reason: s.reason }));
    log(`  ${t('cli.auth.none')}`);
  }

  let chosen;
  try {
    chosen = resolveProvider({ env, name: opts.provider, exec: deps.exec, t });
  } catch (e) {
    log(`${t('cli.doctor.provider', { name: opts.provider || env.ROADMAP_PROVIDER })}`);
    log(`  ${e.message}`);
    chosen = null;
  }
  if (chosen && chosen.provider) {
    log(t('cli.doctor.provider', { name: t(`cli.provider.${chosen.provider.name}`) }));
    log(t('cli.doctor.providerWhy', { reason: chosen.reason }));
    for (const s of chosen.skipped) log(t('cli.doctor.skipped', { name: t(`cli.provider.${s.name}`), reason: s.reason }));
  }

  const lang = i18n.resolveLanguage({ roadmap, env });
  log(t('cli.doctor.language', { lang: lang.lang, source: t(`cli.doctor.languageSource.${lang.source}`) }));
  log(t('cli.doctor.theme', { theme: opts.theme || (roadmap && roadmap.theme) || DEFAULT_THEME }));
  void PROVIDERS;
  return 0;
}

module.exports = { runDoctor };
