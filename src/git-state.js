'use strict';

// Where the working copy is: branch, commits ahead of main, changed files.
// Shown in the header of the live page. Never throws; null outside git.

const { spawnSync } = require('child_process');

const TIMEOUT_MS = 2000;

function gitState(dir, exec = spawnSync) {
  const run = (args) => {
    try {
      const r = exec('git', args, { cwd: dir, encoding: 'utf8', timeout: TIMEOUT_MS, stdio: ['ignore', 'pipe', 'ignore'] });
      return r && r.status === 0 ? String(r.stdout).trim() : null;
    } catch {
      return null;
    }
  };
  const branch = run(['branch', '--show-current']);
  if (branch === null) return null;
  const aheadRaw = run(['rev-list', '--count', 'main..HEAD']);
  const ahead = aheadRaw !== null && /^\d+$/.test(aheadRaw) ? Number(aheadRaw) : null;
  const status = run(['status', '--porcelain']);
  const changed = status === null ? 0 : status.split('\n').filter(Boolean).length;
  return { branch: branch || 'HEAD', ahead, changed };
}

module.exports = { gitState };
