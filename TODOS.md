# TODOS

Deferred work with the context needed to pick it up later. Items here are not on the roadmap; they move to `roadmap.json` when they are scheduled.

## From /plan-ceo-review 2026-09-11 (GTM Roadmap, docs/designs/gtm-roadmap.md)

- **Generic pulse source `json:<url> <pointer>`.** One keyless source for any public JSON number (a Plausible shared stats endpoint, the project's own API, a shields endpoint), so roadmap-live maintains no integrations. Boundaries before shipping: https only, GET only, 5 s timeout, response capped at 64 KB, pointer per RFC 6901, no redirects to other hosts. Deferred because the Action would then reach arbitrary hosts; decide the egress rules first.
- **Launch playbook section in AGENTS.md.** Tell the agent how to work launch items: draft the launch post into `docs/launch/`, put the badge into the README, prepare the npm publish checklist, and hand the human only what needs a login (publish, send) as a `question`. Deferred until after the first own launch so the text comes from experience, not guesswork.
- **`init --gtm` (design doc approach C).** Mostly covered by `init` seeding a Launch milestone by default; revisit only if users ask for the Ship / Publish / Tell / Earn template.
- **Server option `--pulse <minutes>`.** Let the live server run the pulse on an interval. Deferred; cron or the Action cover the need today.
