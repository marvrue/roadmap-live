'use strict';

// OpenAI Codex CLI: `codex exec` reads the prompt from stdin and writes the
// final message to the file given with --output-last-message.

const fs = require('fs');
const os = require('os');
const path = require('path');
const { detectBinary, runBinary } = require('./cli-base');

module.exports = {
  name: 'codex-cli',
  binary: 'codex',
  detect({ exec, t }) {
    const ok = detectBinary('codex', exec);
    return { ok, reason: t(ok ? 'cli.why.onPath' : 'cli.why.notOnPath', { name: 'codex' }) };
  },
  async classify(prompt, { env = process.env, system, spawnFn } = {}) {
    const full = system ? `${system}\n\n${prompt}` : prompt;
    const outFile = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'roadmap-live-')), 'last-message.txt');
    try {
      const stdout = await runBinary('codex', ['exec', '--skip-git-repo-check', '--output-last-message', outFile, '-'], full, { env, spawnFn });
      try { return fs.readFileSync(outFile, 'utf8'); } catch { return stdout; }
    } finally {
      try { fs.rmSync(path.dirname(outFile), { recursive: true, force: true }); } catch { /* ignore */ }
    }
  },
};
