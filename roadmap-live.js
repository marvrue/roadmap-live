#!/usr/bin/env node
'use strict';

/*
 * roadmap-live
 *
 * Shows the state of a project's roadmap.json live in the browser, syncs it
 * with pull request activity on GitHub and renders a static page.
 * No dependencies, Node >= 18. The code lives in src/, this file is the entry.
 *
 *   node roadmap-live.js                 # ./roadmap.json, port 4242
 *   node roadmap-live.js path/to.json    # another file
 *   node roadmap-live.js --port 5000
 *   node roadmap-live.js --check         # validate only, exit code 0 or 1
 *   node roadmap-live.js sync            # pull in GitHub pull request activity
 *   node roadmap-live.js render          # write roadmap/index.html
 *   node roadmap-live.js init            # set up a project
 *
 * As a library, require('roadmap-live') gives the same pieces without the
 * CLI and without file access: validate, renderPage, syncRoadmap, addComment
 * and the building blocks they are made of. See README, "As a library".
 */

const { main, parseArgs } = require('./src/cli');
const { validate, loadRoadmap } = require('./src/validate');
const { diffChanges, addComment } = require('./src/store');
const { renderPage, staticState, resolveTheme, BUILTIN_THEMES, DEFAULT_THEME } = require('./src/render');
const { syncRoadmap, fetchActivity, classifyAll, applyAll, changelogLines, describeChange, nextLastRun } = require('./src/sync');
const { applyClassification } = require('./src/apply');
const { classifyPr, buildPrompt, validateClassification, extractJson, SCHEMA_EXAMPLE } = require('./src/classify');
const github = require('./src/github');
const providers = require('./src/providers');
const i18n = require('./src/i18n');

if (require.main === module) {
  main().catch((e) => {
    console.error(`roadmap-live: ${e && e.message ? e.message : e}`);
    process.exit(1);
  });
}

module.exports = {
  // kept from earlier versions
  validate,
  loadRoadmap,
  parseArgs,
  diffChanges,
  // page
  renderPage,
  staticState,
  resolveTheme,
  BUILTIN_THEMES,
  DEFAULT_THEME,
  // sync without files
  syncRoadmap,
  fetchActivity,
  classifyAll,
  applyAll,
  applyClassification,
  changelogLines,
  describeChange,
  nextLastRun,
  // classification
  classifyPr,
  buildPrompt,
  validateClassification,
  extractJson,
  SCHEMA_EXAMPLE,
  // comments
  addComment,
  // building blocks
  github,
  providers,
  i18n,
};
