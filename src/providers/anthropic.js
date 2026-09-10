'use strict';

// Direct call to the Anthropic Messages API with fetch. The only provider
// that works inside the GitHub Action.

const DEFAULT_MODEL = 'claude-sonnet-5';
const API_URL = 'https://api.anthropic.com/v1/messages';

module.exports = {
  name: 'anthropic',
  detect({ env = process.env, t }) {
    const ok = !!env.ANTHROPIC_API_KEY;
    return { ok, reason: t(ok ? 'cli.why.envSet' : 'cli.why.envUnset', { name: 'ANTHROPIC_API_KEY' }) };
  },
  async classify(prompt, { env = process.env, fetchFn = globalThis.fetch, system } = {}) {
    const res = await fetchFn(API_URL, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-api-key': env.ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: env.ROADMAP_MODEL || DEFAULT_MODEL,
        max_tokens: 4096,
        system,
        messages: [{ role: 'user', content: prompt }],
      }),
    });
    if (!res.ok) {
      let detail = '';
      try { detail = (await res.json()).error.message; } catch { /* ignore */ }
      throw new Error(`Anthropic API returned ${res.status}${detail ? `: ${detail}` : ''}`);
    }
    const body = await res.json();
    if (body.stop_reason === 'refusal') throw new Error('Anthropic API refused the request');
    return (body.content || []).filter((b) => b.type === 'text').map((b) => b.text).join('\n');
  },
};
