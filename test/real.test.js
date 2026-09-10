'use strict';

// One real classification through whatever provider the chain resolves to.
// Runs only with ROADMAP_LIVE_TEST=1 because it needs a key or a CLI.

const { test } = require('node:test');
const assert = require('node:assert');
const { resolveProvider } = require('../src/providers');
const { classifyPr } = require('../src/classify');
const { fixture } = require('./helpers');

const enabled = process.env.ROADMAP_LIVE_TEST === '1';

test('real classification of the merged listing editor PR', { skip: !enabled && 'set ROADMAP_LIVE_TEST=1' }, async () => {
  const { provider } = resolveProvider({ env: process.env });
  assert.ok(provider && !provider.handoff, 'a key or a CLI is needed');
  const pr = {
    number: 42, title: 'Listing editor with image upload', url: 'https://github.com/acme/storefront/pull/42',
    body: 'Listing editor for the shop owner. Images are resized on upload.', author: 'mara',
    state: 'closed', merged: true, merged_at: '2026-09-08T14:02:00Z', created_at: '2026-09-08T09:00:00Z', updated_at: '2026-09-08T14:02:00Z',
    draft: false, review_state: 'approved',
    reviews: fixture('github/pr-42-reviews.json').map((r) => ({ id: r.id, author: r.user.login, state: r.state, body: r.body, submitted_at: r.submitted_at })),
    comments: fixture('github/pr-42-comments.json').map((c) => ({ id: c.id, type: 'comment', author: c.user.login, body: c.body, created_at: c.created_at })),
  };
  const r = await classifyPr({ roadmap: fixture('roadmap-base.json'), pr, provider, lang: 'en', env: process.env });
  assert.strictEqual(r.ok, true, r.reason);
  const match = r.value.matches.find((m) => m.item_id === 'listing-editor');
  assert.ok(match && match.confidence > 0.75, `expected a confident match, got ${JSON.stringify(r.value)}`);
});
