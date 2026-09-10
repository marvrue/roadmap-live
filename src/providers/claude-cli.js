'use strict';

// Claude Code CLI: `claude -p --output-format json` with the prompt on stdin.
// Uses the user's subscription, no API key needed.

const { detectBinary, runBinary } = require('./cli-base');

module.exports = {
  name: 'claude-cli',
  binary: 'claude',
  detect({ exec, t }) {
    const ok = detectBinary('claude', exec);
    return { ok, reason: t(ok ? 'cli.why.onPath' : 'cli.why.notOnPath', { name: 'claude' }) };
  },
  async classify(prompt, { env = process.env, system, spawnFn } = {}) {
    const full = system ? `${system}\n\n${prompt}` : prompt;
    // CLAUDECODE is unset so the CLI also works when sync runs inside a
    // Claude Code session.
    const childEnv = { ...env };
    delete childEnv.CLAUDECODE;
    const out = await runBinary('claude', ['-p', '--output-format', 'json'], full, { env: childEnv, spawnFn });
    try {
      const parsed = JSON.parse(out);
      if (parsed && typeof parsed.result === 'string') return parsed.result;
      if (Array.isArray(parsed)) {
        const last = parsed.filter((m) => m && typeof m.result === 'string').pop();
        if (last) return last.result;
      }
    } catch { /* fall through: raw stdout */ }
    return out;
  },
};
