'use strict';

// Apply rules: turns one validated classification plus the pull request
// facts into changes on the roadmap. Pure and idempotent: applying the same
// classification twice yields no second change. Sync only touches status,
// updated, prs, open_points, unplanned and sync; it never creates or
// deletes items or milestones.

const DONE_CONFIDENCE = 0.75;
const MATCH_CONFIDENCE = 0.5;

function addPr(list, number) {
  const prs = Array.isArray(list) ? list.slice() : [];
  if (!prs.includes(number)) prs.push(number);
  return prs.sort((a, b) => a - b);
}

function itemById(roadmap, id) {
  return roadmap.items.find((it) => it.id === id) || null;
}

function activityTime(pr) {
  return pr.merged_at || pr.updated_at || new Date().toISOString();
}

function commentTime(pr, source) {
  const m = /#(?:review_comment|comment|review):(\d+)$/.exec(source || '');
  if (!m) return null;
  const id = Number(m[1]);
  const c = (pr.comments || []).find((x) => x.id === id);
  if (c) return c.created_at;
  const r = (pr.reviews || []).find((x) => x.id === id);
  return r ? r.submitted_at : null;
}

// Status an item should have after this PR's activity, or null for "leave".
function targetStatus(item, pr, confidence) {
  if (confidence <= MATCH_CONFIDENCE) return null;
  if (pr.merged) return confidence > DONE_CONFIDENCE ? 'done' : null;
  if (pr.state === 'open') {
    if (item.status === 'done') return null; // a follow-up PR does not reopen finished work
    return pr.review_state === 'changes_requested' ? 'blocked' : 'active';
  }
  return null; // closed without merge: the agent owns the status
}

// Mutates roadmap. Returns the list of changes made.
function applyClassification(roadmap, pr, result, now = new Date().toISOString()) {
  const changes = [];
  const at = activityTime(pr);
  const best = {};
  for (const m of result.matches) {
    if (!best[m.item_id] || m.confidence > best[m.item_id].confidence) best[m.item_id] = m;
  }
  const matchedIds = Object.keys(best).filter((id) => best[id].confidence > MATCH_CONFIDENCE);

  for (const id of matchedIds) {
    const item = itemById(roadmap, id);
    if (!item) continue;
    const before = (item.prs || []).slice();
    const prs = addPr(item.prs, pr.number);
    if (prs.length !== before.length) {
      item.prs = prs;
      item.updated = at;
      changes.push({ kind: 'pr', id, title: item.title, pr: pr.number, url: pr.url });
    } else if (item.prs === undefined) {
      item.prs = prs;
    }
    const to = targetStatus(item, pr, best[id].confidence);
    if (to && to !== item.status) {
      changes.push({ kind: 'status', id, title: item.title, from: item.status, to, pr: pr.number, url: pr.url, at });
      item.status = to;
      item.updated = at;
    }
  }

  // Open points: keyed by source; without a source by text.
  for (const p of result.open_points) {
    const item = itemById(roadmap, p.item_id);
    if (!item) continue;
    const source = p.source || `pr:${pr.number}#text:${p.text.slice(0, 40)}`;
    const existing = (item.open_points || []).find((x) => x.source === source);
    if (existing) {
      if (p.resolved && !existing.resolved) {
        existing.resolved = at;
        item.updated = at;
        changes.push({ kind: 'resolved', id: item.id, title: item.title, text: existing.text, pr: pr.number, url: pr.url });
      }
    } else if (!p.resolved) {
      if (!Array.isArray(item.open_points)) item.open_points = [];
      item.open_points.push({ text: p.text, source, opened: commentTime(pr, source) || at, resolved: null });
      item.updated = at;
      changes.push({ kind: 'open_point', id: item.id, title: item.title, text: p.text, pr: pr.number, url: pr.url });
    }
  }

  // Unplanned: only when the PR matches no item well enough. Entries are
  // keyed by PR number so a re-run does not add duplicates. A PR that later
  // matches an item leaves the unplanned list.
  if (!Array.isArray(roadmap.unplanned)) roadmap.unplanned = [];
  const listed = roadmap.unplanned.filter((u) => (u.prs || []).includes(pr.number));
  if (matchedIds.length === 0 && result.unplanned.length) {
    if (!listed.length) {
      const title = result.unplanned[0].title;
      roadmap.unplanned.push({ title, prs: [pr.number], first_seen: pr.created_at || at });
      changes.push({ kind: 'unplanned', title, pr: pr.number, url: pr.url });
    }
  } else if (matchedIds.length && listed.length) {
    roadmap.unplanned = roadmap.unplanned.filter((u) => !(u.prs || []).includes(pr.number));
    for (const u of listed) changes.push({ kind: 'unplanned_removed', title: u.title, pr: pr.number, url: pr.url });
  }
  if (!roadmap.unplanned.length) delete roadmap.unplanned;

  void now;
  return changes;
}

module.exports = { applyClassification, targetStatus, addPr, DONE_CONFIDENCE, MATCH_CONFIDENCE };
