'use strict';

const fs = require('fs');
const { loadRoadmap, validate, stripControls } = require('./validate');
const { cliT } = require('./i18n');
const { EVENTS, inspectCheckpoint, checkpointScope, checkpointInput } = require('./checkpoint');

function writeRoadmap(file, raw, data) {
  const errors = validate(data);
  if (errors.length) throw new Error(errors.join('; '));
  const tmp = `${file}.checkpoint-${process.pid}.tmp`;
  try {
    fs.writeFileSync(tmp, `${JSON.stringify(data, null, 2)}\n`, { flag: 'wx', mode: fs.statSync(file).mode });
    if (fs.readFileSync(file, 'utf8') !== raw) throw new Error('roadmap changed during checkpoint; run it again');
    fs.renameSync(tmp, file);
  } finally {
    try { fs.unlinkSync(tmp); } catch (e) { if (e.code !== 'ENOENT') throw e; }
  }
}

function runCheckpoint(opts, env = process.env, { log = console.log, now = () => new Date().toISOString() } = {}) {
  const loaded = loadRoadmap(opts.file);
  if (!loaded.ok) { loaded.errors.forEach(log); return 1; }
  const data = loaded.data;
  const t = cliT(data, env);
  if (opts.command === 'focus') {
    if (!data.milestones.some((m) => m.id === opts.milestone) || typeof opts.reason !== 'string' || !opts.reason.trim()) {
      log(t('checkpoint.focusUsage')); return 1;
    }
    data.focus = { milestone: opts.milestone, reason: opts.reason.trim(), baseline: checkpointScope(data, opts.milestone) };
    if (!opts.dryRun) writeRoadmap(opts.file, loaded.raw, data);
    log(t('checkpoint.focusSet', { milestone: stripControls(opts.milestone) }));
    return 0;
  }
  const event = opts.event || 'check';
  if (!EVENTS.includes(event) || ((event === 'start' || event === 'complete') && !opts.item)
    || (opts.item && event !== 'start' && event !== 'complete')) {
    log(t('checkpoint.usage')); return 1;
  }
  const report = inspectCheckpoint(data, { event, item: opts.item });
  log(t(`checkpoint.results.${report.result}`));
  for (const finding of report.findings) {
    const params = Object.fromEntries(Object.entries(finding.params).map(([k, v]) => [k, typeof v === 'string' ? stripControls(v) : v]));
    log(`- ${t(`checkpoint.findings.${finding.code}`, params)}`);
  }
  if (report.result !== 'disabled' && !opts.dryRun) {
    const next = { event, item: opts.item || null, result: report.result, findings: report.findings, input: checkpointInput(data) };
    const previous = data.checkpoint ? { ...data.checkpoint } : null;
    if (previous) delete previous.at;
    if (JSON.stringify(previous) !== JSON.stringify(next)) {
      data.checkpoint = { ...next, at: now() };
      writeRoadmap(opts.file, loaded.raw, data);
    }
  }
  return report.result === 'review' ? 2 : 0;
}

module.exports = { runCheckpoint, writeRoadmap };
