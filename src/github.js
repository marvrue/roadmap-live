'use strict';

// GitHub REST access with fetch: pull requests updated since a date, with
// reviews, issue comments and review comments. Pagination via the Link
// header, backoff on rate limits.

const { spawnSync } = require('child_process');
const { REPO_RE } = require('./validate');

const API = 'https://api.github.com';
const PER_PAGE = 100;
const MAX_WAIT_MS = 120000;
const FIRST_RUN_DAYS = 30;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function parseLink(header) {
  const links = {};
  (header || '').split(',').forEach((part) => {
    const m = /<([^>]+)>;\s*rel="([^"]+)"/.exec(part.trim());
    if (m) links[m[2]] = m[1];
  });
  return links;
}

function createClient({ token, fetchFn = globalThis.fetch, baseUrl = API, wait = sleep, log = () => {}, t = (k) => k } = {}) {
  const headers = {
    Accept: 'application/vnd.github+json',
    'X-GitHub-Api-Version': '2022-11-28',
    'User-Agent': 'roadmap-live',
  };
  if (token) headers.Authorization = `Bearer ${token}`;

  async function request(url, attempt = 0) {
    const res = await fetchFn(url, { headers });
    if ((res.status === 403 || res.status === 429) && attempt < 3) {
      const remaining = res.headers.get('x-ratelimit-remaining');
      const retryAfter = Number(res.headers.get('retry-after'));
      const reset = Number(res.headers.get('x-ratelimit-reset'));
      let waitMs = 0;
      if (retryAfter) waitMs = retryAfter * 1000;
      else if (remaining === '0' && reset) waitMs = Math.max(0, reset * 1000 - Date.now()) + 1000;
      else if (res.status === 429) waitMs = 5000 * (attempt + 1);
      if (waitMs > 0) {
        waitMs = Math.min(waitMs, MAX_WAIT_MS);
        log(t('cli.sync.rateLimit', { seconds: Math.ceil(waitMs / 1000) }));
        await wait(waitMs);
        return request(url, attempt + 1);
      }
    }
    if (!res.ok) {
      let detail = '';
      try { detail = (await res.json()).message || ''; } catch { /* ignore */ }
      const err = new Error(`GitHub API ${res.status} for ${url.replace(baseUrl, '')}${detail ? `: ${detail}` : ''}`);
      err.status = res.status;
      throw err;
    }
    return res;
  }

  // GET one JSON document.
  async function get(path) {
    const res = await request(path.startsWith('http') ? path : `${baseUrl}${path}`);
    return res.json();
  }

  // GET all pages of a list. `stop(item)` ends pagination early.
  async function list(path, { stop } = {}) {
    let url = path.startsWith('http') ? path : `${baseUrl}${path}${path.includes('?') ? '&' : '?'}per_page=${PER_PAGE}`;
    const out = [];
    while (url) {
      const res = await request(url);
      const items = await res.json();
      for (const it of items) {
        if (stop && stop(it)) return out;
        out.push(it);
      }
      url = parseLink(res.headers.get('link')).next || null;
    }
    return out;
  }

  return { get, list };
}

// "changes requested and no later approval" -> changes_requested. Reviews in
// state COMMENTED, PENDING or DISMISSED carry no decision.
function reviewDecision(reviews) {
  let lastChanges = null;
  let lastApproval = null;
  for (const r of reviews || []) {
    const at = Date.parse(r.submitted_at) || 0;
    if (r.state === 'CHANGES_REQUESTED' && (lastChanges === null || at > lastChanges)) lastChanges = at;
    if (r.state === 'APPROVED' && (lastApproval === null || at > lastApproval)) lastApproval = at;
  }
  if (lastChanges !== null && (lastApproval === null || lastApproval < lastChanges)) return 'changes_requested';
  if (lastApproval !== null) return 'approved';
  return 'none';
}

function normalizePr(pr, reviews, issueComments, reviewComments) {
  const comments = []
    .concat((issueComments || []).map((c) => ({ id: c.id, type: 'comment', author: c.user && c.user.login, body: c.body || '', created_at: c.created_at, updated_at: c.updated_at, url: c.html_url })))
    .concat((reviewComments || []).map((c) => ({ id: c.id, type: 'review_comment', author: c.user && c.user.login, body: c.body || '', created_at: c.created_at, updated_at: c.updated_at, url: c.html_url, path: c.path })))
    .sort((a, b) => (Date.parse(a.created_at) || 0) - (Date.parse(b.created_at) || 0));
  const revs = (reviews || [])
    .filter((r) => r.state !== 'PENDING')
    .map((r) => ({ id: r.id, author: r.user && r.user.login, state: r.state, body: r.body || '', submitted_at: r.submitted_at }))
    .sort((a, b) => (Date.parse(a.submitted_at) || 0) - (Date.parse(b.submitted_at) || 0));
  return {
    number: pr.number,
    title: pr.title || '',
    body: pr.body || '',
    author: pr.user && pr.user.login,
    url: pr.html_url,
    state: pr.state,
    merged: !!pr.merged_at,
    merged_at: pr.merged_at || null,
    created_at: pr.created_at,
    updated_at: pr.updated_at,
    closed_at: pr.closed_at || null,
    draft: !!pr.draft,
    branch: pr.head && pr.head.ref,
    review_state: reviewDecision(revs),
    reviews: revs,
    comments,
  };
}

// Pull requests updated since `since` (ISO), newest first, fully populated.
async function fetchPullRequests(client, repo, since) {
  const sinceMs = Date.parse(since);
  const prs = await client.list(`/repos/${repo}/pulls?state=all&sort=updated&direction=desc`, {
    stop: (pr) => Date.parse(pr.updated_at) < sinceMs,
  });
  const out = [];
  for (const pr of prs) {
    const [reviews, issueComments, reviewComments] = await Promise.all([
      client.list(`/repos/${repo}/pulls/${pr.number}/reviews`),
      client.list(`/repos/${repo}/issues/${pr.number}/comments`),
      client.list(`/repos/${repo}/pulls/${pr.number}/comments`),
    ]);
    out.push(normalizePr(pr, reviews, issueComments, reviewComments));
  }
  return out;
}

// Titles and states of the most recently updated pull requests, without the
// three follow-up calls per pull request that fetchPullRequests makes. `init`
// reconstructs a first roadmap from this; it needs what was worked on, not who
// said what about it. `max` caps how far back the pagination reads.
async function fetchPullRequestList(client, repo, { max = 100 } = {}) {
  let seen = 0;
  const prs = await client.list(`/repos/${repo}/pulls?state=all&sort=updated&direction=desc`, {
    stop: () => ++seen > max,
  });
  return prs.map((pr) => ({
    number: pr.number,
    title: pr.title || '',
    state: pr.state,
    merged: !!pr.merged_at,
    draft: !!pr.draft,
    created_at: pr.created_at,
    merged_at: pr.merged_at || null,
    branch: pr.head && pr.head.ref,
  }));
}

function firstRunSince(now = Date.now()) {
  return new Date(now - FIRST_RUN_DAYS * 86400000).toISOString();
}

function repoFromRemote(url) {
  const m = /github\.com[:/]([^/\s]+)\/([^/\s]+?)(?:\.git)?\/?$/.exec(url || '');
  return m ? `${m[1]}/${m[2]}` : null;
}

function gitRemote(cwd, exec = spawnSync) {
  try {
    const r = exec('git', ['remote', 'get-url', 'origin'], { cwd, encoding: 'utf8', timeout: 2000, stdio: ['ignore', 'pipe', 'ignore'] });
    return r.status === 0 ? repoFromRemote(r.stdout.trim()) : null;
  } catch {
    return null;
  }
}

// Order: --repo, sync.repo, GITHUB_REPOSITORY, git remote.
function resolveRepo({ flag, roadmap, env = process.env, cwd = process.cwd(), exec } = {}) {
  const valid = (r) => (typeof r === 'string' && REPO_RE.test(r) ? r : null);
  if (valid(flag)) return { repo: flag, source: 'flag' };
  if (roadmap && roadmap.sync && valid(roadmap.sync.repo)) return { repo: roadmap.sync.repo, source: 'roadmap' };
  if (valid(env.GITHUB_REPOSITORY)) return { repo: env.GITHUB_REPOSITORY, source: 'env' };
  const remote = gitRemote(cwd, exec);
  if (remote) return { repo: remote, source: 'git' };
  return null;
}

module.exports = { createClient, fetchPullRequests, fetchPullRequestList, normalizePr, reviewDecision, parseLink, resolveRepo, repoFromRemote, gitRemote, firstRunSince, FIRST_RUN_DAYS };
