# Fairweigh (Sustainable Supplier Cockpit)

Prototype by Team Scromen for the pitch on 20 Nov 2026. **Read `PLAN.md` first:** it contains scope, decisions and timeline.

## Way of working

- Everything is in English: conversation, code, comments, user interface, tests and documentation.
- The user and the team are not full-time developers: explain decisions briefly and in plain language.
- Only implement changes to decisions in `PLAN.md` or to the scope after asking.
- Work in small steps, one commit per step. Since 16 Nov 2026 (after #11 was merged and `feature/grundgeruest` was deleted): one short branch per round of changes, created from an up-to-date `main` and named after the change (e.g. `feature/custom-range`, `fix/…`, `docs/…`), with its own pull request to `main`; only one open pull request at a time. After the merge, delete the branch. The user is the only reviewer. Commit, push and merge only after agreement.
- A task is only done when tests pass and you have checked the result. Say openly what you could not check.
- Everything the team has to back up in the presentation goes into the documentation with a source.

## User interface

- **Decision at a glance:** recommendation, reason and matrix are on the first screen without scrolling (1440 × 900).
- **System for large enterprises:** factual and functional, ready-made components, neutral colours, no animations and no decoration.
- **Colour** is never the only signal, always together with text or a symbol.
- **Details** in a side panel, the matrix stays visible.
- New elements only if they make the decision easier.

## Fixed business rules

- **Four criteria:** product quality, price, CO₂, delivery reliability.
- **The ranking is code, not AI.** Knock-outs first, then points 0–100 against today (50 = same as today, +1 per 1 % better), then weighting (17 Nov 2026). Since 18 Nov 2026 quality counts the share of deliveries without a complaint and delivery the share on time, so 99.0 % vs 99.2 % is 0.2 % worse; the result is shown as "Ø x % better/worse than today" (score − 50), green from +5 %, red from −5 %, yellow in between. Today = the average of the last three purchases of the part in the client ERP: their unit price, and the ERP figures and product footprint of the suppliers we bought from; without purchases the current contract and current supplier; category average as fallback. Real published CO₂ industry averages are shown with their source as context only and do not count towards the score.
- **Missing or unverified value:** 0 points and a visible notice. Gaps must never improve the result. Only exception (8 Nov 2026): a supplier that never delivered gets a score range for quality and delivery (weakest to best of our current suppliers in the category); such a supplier is always ranked after all offers with real data (18 Nov 2026), so a gap never beats real data, and the cockpit says when its high end could be ahead ("request a sample delivery first").
- **Knock-out:** only from verified evidence: a proven legal violation (fine notice), LkSG country risk "High" without a social audit (SA8000), or a known child or forced labour controversy (team rule set, 8 Nov 2026). Other allegations, medium risk and a too-long lead time are warnings. Excluded offers stay visible.
- **Weights:** company default per commodity group; the buyer may move each weight by at most ±10 percentage points, and changed weights need a justification in the Decision Log (10 Nov 2026).
- **CO₂ in euros** is display only and does not count towards the score.
- **Evidence:** every value needs a verified source that the buyer can open. The agent must not invent anything.
- **Rationale:** a fixed text template filled by code (16 Nov 2026). If an AI sentence is ever added, numbers in it must come from the inputs, otherwise the template is used.
- **Data:** only fictitious dummy data. Since 8 Nov 2026 the app should look like a real system connected to real systems: since 16 Nov 2026 there is no notice on the screen: "About" in the help menu says "Prototype with sample data", and each PDF has one line at the bottom; the READMEs in `data/` say that all data is invented. Only exception (8 Nov 2026): real published industry averages as CO₂ context, each with its source, in `data/source/public-benchmarks.json`.

## Tech

- Next.js, React and TypeScript in `web/` (with Ant Design), NestJS in `server/`, shared types in `shared/`. npm workspaces, Node 24, TypeScript 6.0.
- No database for now: data as JSON files and PDFs in `data/sources/`, one folder per simulated system (client ERP, rating partner, PCF exchange, supplier documents), runs in memory and as a file; rules and the Decision Log as JSON files written by the server. Access only through our own storage interface, so PostgreSQL can be added later.
- No Redis, S3, SSO or Terraform in the prototype.
- Commands in the project root: `npm run dev:server`, `npm run dev:web`, `npm run data:build`, `npm run lint`, `npm run typecheck`, `npm test`, `npm run build`, `npm run runs:record` (real runs, needs `LLM_PROVIDER=gemini`), `npm run hitrate:set`, `npm run hitrate`.
- AI only behind our own interface: Gemini and `FakeLlmProvider` for tests (Groq dropped, 16 Nov 2026).
- Tests and local development use `FakeLlmProvider` by default, so no quota is used.
- `FakeLlmProvider` is switched off in the online version and must never deliver the demo or the hit rate. The online version is the static preview on Cloudflare Pages, which replays recorded Gemini runs from `data/runs` as "Saved run from <date>" (16 Nov 2026, no Cloud Run).
- The app always shows the mode: "Live: <provider>" as a tag in the header; a saved run as "Saved run from <date>" in the help menu, in "About" and on the collect step next to the run (18 Nov 2026, quieter for the pitch).
- Never commit secrets. Only `.env.example` with placeholders belongs in the repo.
- Mandatory tests: decision engine and evidence check.
