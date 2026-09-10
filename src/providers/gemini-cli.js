'use strict';

// Google Gemini CLI: `gemini --output-format json` with the prompt on stdin.

const { detectBinary, runBinary } = require('./cli-base');

module.exports = {
  name: 'gemini-cli',
  binary: 'gemini',
  detect({ exec, t }) {
    const ok = detectBinary('gemini', exec);
    return { ok, reason: t(ok ? 'cli.why.onPath' : 'cli.why.notOnPath', { name: 'gemini' }) };
  },
  async classify(prompt, { env = process.env, system, spawnFn } = {}) {
    const full = system ? `${system}\n\n${prompt}` : prompt;
    const out = await runBinary('gemini', ['--output-format', 'json'], full, { env, spawnFn });
    try {
      const parsed = JSON.parse(out);
      if (parsed && typeof parsed.response === 'string') return parsed.response;
    } catch { /* raw stdout */ }
    return out;
  },
};
