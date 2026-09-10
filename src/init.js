'use strict';

// roadmap-live init: writes roadmap.json, copies AGENTS.md and writes the
// GitHub workflow file. Existing files are never overwritten.

const fs = require('fs');
const path = require('path');
const i18n = require('./i18n');
const { displayName } = require('./validate');

const ROOT = path.join(__dirname, '..');

function writeIfMissing(file, content, t, log) {
  if (fs.existsSync(file)) {
    log(t('cli.init.exists', { file: displayName(file) }));
    return false;
  }
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, content);
  log(t('cli.init.wrote', { file: displayName(file) }));
  return true;
}

function runInit(opts, env = process.env, deps = {}) {
  const log = deps.log || console.log;
  const t = i18n.cliT(null, env);
  const dir = path.dirname(opts.file);
  const project = path.basename(path.resolve(dir));
  const roadmap = {
    project,
    milestones: [{ id: 'm1', title: 'MVP' }],
    items: [],
  };
  writeIfMissing(opts.file, `${JSON.stringify(roadmap, null, 2)}\n`, t, log);
  writeIfMissing(path.join(dir, 'AGENTS.md'), fs.readFileSync(path.join(ROOT, 'AGENTS.md'), 'utf8'), t, log);
  writeIfMissing(path.join(dir, '.github', 'workflows', 'roadmap.yml'), fs.readFileSync(path.join(ROOT, 'examples', 'workflow.yml'), 'utf8'), t, log);
  log(t('cli.init.done'));
  return 0;
}

module.exports = { runInit };
