'use strict';

// No key, no CLI: sync writes everything the classifier would have seen into
// .roadmap-live/inbox.json and exits. The user's coding agent classifies the
// entries on its next run (rule in AGENTS.md), writes result.json and runs
// `roadmap-live sync --apply`.

module.exports = {
  name: 'agent',
  handoff: true,
  detect({ t }) {
    return { ok: true, reason: t('cli.why.fallback') };
  },
  async classify() {
    throw new Error('the agent provider does not classify directly; run roadmap-live sync --apply after your agent wrote .roadmap-live/result.json');
  },
};
