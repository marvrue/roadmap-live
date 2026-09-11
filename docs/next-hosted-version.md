# Start prompt for the hosted version

Copy the text below into a fresh Claude Code session in this repository.

---

Read README.md, AGENTS.md, DECISIONS.md and roadmap.json. Milestone m4 "Hosted version" lists the work. Context and decisions already made:

- roadmap-live stays open source (MIT) in this repo and is published to npm. The paid service lives in a separate private repo `roadmap-live-cloud` that depends on the npm package; it never copies core code.
- The service runs on the existing Hetzner server under CapRover: one Node container, SQLite on a volume to start, a sync worker loop inside the process, pages served by the same process. n8n on the same server sends the daily digest. Vercel is not used for the service (function time limits and cron limits); at most for a landing page later.
- Pricing includes classification with our Anthropic API key; customers may store their own key instead. Stripe for subscriptions.
- The GitHub App (login, repo selection) and the OAuth app for the device flow are registered by the human; the code paths in src/auth.js exist with an empty client id.
- Work in this repo first (items lib-exports, page-base-url, page-write-token), each as its own branch and pull request, then create the cloud repo.

Use superpowers:brainstorming before writing code, one question at a time, and keep answers non-technical: the human steers agents but does not code. Record judgment calls in DECISIONS.md.
