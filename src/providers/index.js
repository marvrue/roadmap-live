'use strict';

// Provider chain. Order matters: the first available provider wins unless
// --provider or ROADMAP_PROVIDER names one. Adding a provider is one file
// with name, detect() and classify(); see CONTRIBUTING.md.

const i18n = require('../i18n');

const PROVIDERS = [
  require('./anthropic'),
  require('./claude-cli'),
  require('./codex-cli'),
  require('./gemini-cli'),
  require('./agent'),
];

function byName(name) {
  return PROVIDERS.find((p) => p.name === name) || null;
}

// Returns { provider, reason, skipped: [{ name, reason }] } or throws when a
// named provider is unknown or unavailable.
function resolveProvider({ env = process.env, name = null, exec, t } = {}) {
  t = t || i18n.cliT(null, env);
  const wanted = name || env.ROADMAP_PROVIDER || null;
  const why = name ? t('cli.why.flag') : t('cli.why.envProvider');
  if (wanted) {
    const p = byName(wanted);
    if (!p) throw new Error(t('cli.provider.unknown', { name: wanted }));
    const d = p.detect({ env, exec, t });
    if (!d.ok) throw new Error(t('cli.provider.notAvailable', { name: wanted, reason: d.reason }));
    return { provider: p, reason: why, skipped: [] };
  }
  const skipped = [];
  for (const p of PROVIDERS) {
    const d = p.detect({ env, exec, t });
    if (d.ok) return { provider: p, reason: d.reason, skipped };
    skipped.push({ name: p.name, reason: d.reason });
  }
  return { provider: null, reason: null, skipped };
}

module.exports = { PROVIDERS, byName, resolveProvider };
