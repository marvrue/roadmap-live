'use strict';

// GitHub Pages for the shared page: is it on, where does it live, turn it on.
// Used by the live server behind the share button.

const API = 'https://api.github.com';
const OUTPUT_DIR = 'roadmap/';

function headers(token) {
  return {
    Accept: 'application/vnd.github+json',
    'X-GitHub-Api-Version': '2022-11-28',
    'User-Agent': 'roadmap-live',
    Authorization: `Bearer ${token}`,
    'Content-Type': 'application/json',
  };
}

// { enabled: true, url } | { enabled: false } | null (unknown: no repo, no
// token, or an error other than "not enabled").
async function pagesStatus({ repo, token, fetchFn = globalThis.fetch, baseUrl = API } = {}) {
  if (!repo || !token) return null;
  let res;
  try {
    res = await fetchFn(`${baseUrl}/repos/${repo}/pages`, { headers: headers(token) });
  } catch {
    return null;
  }
  if (res.status === 404) return { enabled: false };
  if (!res.ok) return null;
  const body = await res.json();
  const base = typeof body.html_url === 'string' && body.html_url ? body.html_url : null;
  return { enabled: true, url: base ? `${base.replace(/\/?$/, '/')}${OUTPUT_DIR}` : null };
}

// Turns Pages on for the repository (source: the given branch, root path).
// Returns the new status or throws with a readable message.
async function enablePages({ repo, token, branch = 'main', fetchFn = globalThis.fetch, baseUrl = API } = {}) {
  if (!repo || !token) throw new Error('repository or GitHub credential missing');
  const res = await fetchFn(`${baseUrl}/repos/${repo}/pages`, {
    method: 'POST',
    headers: headers(token),
    body: JSON.stringify({ source: { branch, path: '/' } }),
  });
  if (res.status === 409) return pagesStatus({ repo, token, fetchFn, baseUrl }); // already on
  if (!res.ok) {
    let detail = '';
    try { detail = (await res.json()).message || ''; } catch { /* ignore */ }
    const err = new Error(detail || `GitHub API ${res.status}`);
    err.status = res.status;
    throw err;
  }
  const body = await res.json();
  const base = typeof body.html_url === 'string' && body.html_url ? body.html_url : null;
  return { enabled: true, url: base ? `${base.replace(/\/?$/, '/')}${OUTPUT_DIR}` : null };
}

module.exports = { pagesStatus, enablePages, OUTPUT_DIR };
