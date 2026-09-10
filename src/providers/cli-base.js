'use strict';

// Shared helpers for the CLI adapters. Detection means "binary on PATH and
// responds to --version within two seconds".

const { spawn, spawnSync } = require('child_process');

const DETECT_TIMEOUT_MS = 2000;
const RUN_TIMEOUT_MS = 180000;

function detectBinary(bin, exec = spawnSync) {
  try {
    const r = exec(bin, ['--version'], { encoding: 'utf8', timeout: DETECT_TIMEOUT_MS, stdio: ['ignore', 'pipe', 'ignore'] });
    return r.status === 0;
  } catch {
    return false;
  }
}

// Runs a binary with the prompt on stdin and resolves with stdout. Rejects on
// a non-zero exit or a timeout.
function runBinary(bin, args, input, { timeout = RUN_TIMEOUT_MS, env = process.env, spawnFn = spawn } = {}) {
  return new Promise((resolve, reject) => {
    let child;
    try {
      child = spawnFn(bin, args, { env, stdio: ['pipe', 'pipe', 'pipe'] });
    } catch (e) {
      return reject(e);
    }
    let out = '';
    let err = '';
    const timer = setTimeout(() => {
      try { child.kill('SIGKILL'); } catch { /* ignore */ }
      reject(new Error(`${bin} did not answer within ${Math.round(timeout / 1000)} seconds`));
    }, timeout);
    child.stdout.on('data', (d) => { out += d; });
    child.stderr.on('data', (d) => { err += d; });
    child.on('error', (e) => { clearTimeout(timer); reject(e); });
    child.on('close', (code) => {
      clearTimeout(timer);
      if (code === 0) resolve(out);
      else reject(new Error(`${bin} exited with ${code}${err.trim() ? `: ${err.trim().split('\n').slice(-3).join(' ')}` : ''}`));
    });
    child.stdin.on('error', () => {});
    child.stdin.end(input);
  });
}

module.exports = { detectBinary, runBinary, DETECT_TIMEOUT_MS, RUN_TIMEOUT_MS };
