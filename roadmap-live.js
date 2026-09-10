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
 */

const { main } = require('./src/cli');
const { validate, loadRoadmap } = require('./src/validate');
const { parseArgs } = require('./src/cli');
const { diffChanges } = require('./src/store');

if (require.main === module) {
  main().catch((e) => {
    console.error(`roadmap-live: ${e && e.message ? e.message : e}`);
    process.exit(1);
  });
}

module.exports = { validate, loadRoadmap, parseArgs, diffChanges };
