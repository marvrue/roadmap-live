'use strict';

const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');
const { gitState } = require('../src/git-state');
const { tmpDir } = require('./helpers');

function git(dir, ...args) {
  const r = spawnSync('git', args, { cwd: dir, encoding: 'utf8' });
  assert.strictEqual(r.status, 0, `git ${args.join(' ')}: ${r.stderr}`);
  return r.stdout.trim();
}

function repo() {
  const dir = tmpDir();
  git(dir, 'init', '-q', '-b', 'main');
  git(dir, 'config', 'user.email', 'test@example.com');
  git(dir, 'config', 'user.name', 'test');
  fs.writeFileSync(path.join(dir, 'a.txt'), 'a\n');
  git(dir, 'add', 'a.txt');
  git(dir, 'commit', '-q', '-m', 'first');
  return dir;
}

test('branch, commits ahead of main and changed files', () => {
  const dir = repo();
  assert.deepStrictEqual(gitState(dir), { branch: 'main', ahead: 0, changed: 0 });
  git(dir, 'checkout', '-q', '-b', 'feat/x');
  fs.writeFileSync(path.join(dir, 'b.txt'), 'b\n');
  git(dir, 'add', 'b.txt');
  git(dir, 'commit', '-q', '-m', 'second');
  fs.writeFileSync(path.join(dir, 'a.txt'), 'changed\n');
  fs.writeFileSync(path.join(dir, 'c.txt'), 'new\n');
  assert.deepStrictEqual(gitState(dir), { branch: 'feat/x', ahead: 1, changed: 2 });
});

test('ahead is null without a main branch, HEAD when detached', () => {
  const dir = tmpDir();
  git(dir, 'init', '-q', '-b', 'trunk');
  git(dir, 'config', 'user.email', 'test@example.com');
  git(dir, 'config', 'user.name', 'test');
  fs.writeFileSync(path.join(dir, 'a.txt'), 'a\n');
  git(dir, 'add', 'a.txt');
  git(dir, 'commit', '-q', '-m', 'first');
  assert.deepStrictEqual(gitState(dir), { branch: 'trunk', ahead: null, changed: 0 });
  git(dir, 'checkout', '-q', '--detach');
  assert.strictEqual(gitState(dir).branch, 'HEAD');
});

test('null outside a repository or without git', () => {
  assert.strictEqual(gitState(tmpDir()), null);
  assert.strictEqual(gitState(process.cwd(), () => { throw new Error('ENOENT'); }), null);
});
