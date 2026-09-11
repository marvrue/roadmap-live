'use strict';

// Where the working copy is: branch, commits ahead of main, changed files.
// Shown in the header of the live page. Never throws; null outside git.
// Runs off the event loop (execFile, not spawnSync) so a slow git call never
// blocks the server.

const { execFile } = require('child_process');

const TIMEOUT_MS = 2000;

function run(exec, dir, args) {
  return new Promise((resolve) => {
    try {
      exec('git', args, { cwd: dir, encoding: 'utf8', timeout: TIMEOUT_MS }, (err, stdout) => {
        resolve(err ? null : String(stdout).trim());
      });
    } catch {
      resolve(null);
    }
  });
}

async function gitState(dir, exec = execFile) {
  const [branch, aheadRaw, status] = await Promise.all([
    run(exec, dir, ['branch', '--show-current']),
    run(exec, dir, ['rev-list', '--count', 'main..HEAD']),
    run(exec, dir, ['status', '--porcelain']),
  ]);
  if (branch === null) return null;
  const ahead = aheadRaw !== null && /^\d+$/.test(aheadRaw) ? Number(aheadRaw) : null;
  // A failed or timed-out status must not read as a clean tree.
  const changed = status === null ? null : status.split('\n').filter(Boolean).length;
  return { branch: branch || 'HEAD', ahead, changed };
}

module.exports = { gitState };
