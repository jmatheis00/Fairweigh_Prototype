# Fairweigh: Sustainable Supplier Cockpit

Prototype by **Team Scromen** for course IS6130 (pitch on 20 Nov 2026).

Fairweigh helps a category buyer in a large enterprise compare supplier offers for one part and **decide at a glance**. It weighs four criteria: product quality, price, CO₂ and delivery reliability. An AI agent collects the evidence for every offer from (simulated) source systems and records the source of every value. Fixed, tested code then checks that evidence and ranks the offers. The AI never ranks.

> **All data in this repository is fictitious.** Suppliers, prices, documents and purchase history are invented for the prototype. The only real figures are published CO₂ industry averages, each with its source (`data/source/public-benchmarks.json`). They are shown as context only.

## How it works

```text
Request  →  Collect (AI agent)  →  Check (code)  →  Knock-outs  →  Score  →  Decide (buyer)
```

1. **Request:** the buyer picks a part, a quantity and a needed-by date.
2. **Collect:** the agent queries four simulated systems: client ERP, rating partner, PCF exchange (product carbon footprints) and supplier documents. For every value it reports where it found it.
3. **Check:** after every run, code checks each piece of evidence: does the source exist, is the value at the stated location, do unit and supplier match? Evidence that fails counts as "not verified".
4. **Knock-outs:** only verified evidence can exclude an offer: a proven legal violation (fine notice), LkSG country risk "High" without a social audit (SA8000), or a known child or forced labour controversy. Excluded offers stay visible with their reason.
5. **Score:** each criterion gets 0–100 points against what the company pays and gets today (the average of the last three purchases of the part). 50 points means the same as today, and each 1 % better adds one point. The points are then weighted by the company's default weights per commodity group. A buyer may move each weight by at most ±10 percentage points, with a justification in the Decision Log.
6. **Decide:** the cockpit shows the recommendation, the reason and the comparison matrix on one screen. Every value opens its source in a side panel.

**Missing or unverified values get 0 points and a visible notice, so a gap can never improve an offer's result.** The rationale text is a fixed template filled by code, so no number in it can be invented.

## Repository structure

| Folder | Content |
|---|---|
| `web/` | Cockpit user interface: Next.js, React, TypeScript, Ant Design |
| `web/preview-dist/` | Static build of the cockpit that replays saved agent runs (the online version) |
| `server/` | API: NestJS with the decision engine, agent, evidence check and simulated source systems |
| `shared/` | Shared TypeScript types and pure calculation code |
| `data/` | Fictitious source data (Excel), the generated source systems (`data/sources/`), saved agent runs and the hit-rate test set |
| `scripts/` | Recording real agent runs and measuring the agent's hit rate |

Each folder has its own README with details. `data/README.md` explains where every value comes from.

## Running it locally

Requirements: **Node.js 24** and npm.

```bash
npm install
```

```bash
cp .env.example .env
```

Start the server (port 3001) and the cockpit (port 3000) in two terminals:

```bash
npm run dev:server
```

```bash
npm run dev:web
```

Then open <http://localhost:3000>.

By default the agent runs with `LLM_PROVIDER=fake`, a test provider with fixed answers that needs no API key. To use the real model, set `LLM_PROVIDER=gemini` and a `GEMINI_API_KEY` from Google AI Studio in `.env`. Never commit that file. The app always shows which mode is running: "Live: Gemini" or "Saved run from <date>".

## Commands

| Command | Does |
|---|---|
| `npm test` | Runs all tests (decision engine, evidence check, data, analytics) |
| `npm run lint` / `npm run typecheck` | Code checks |
| `npm run build` | Builds all packages |
| `npm run data:build` | Regenerates `data/sources/` from the Excel and the assumptions |
| `npm run runs:record` | Records one real agent run per product (needs a server with `LLM_PROVIDER=gemini`) |
| `npm run hitrate:set` / `npm run hitrate` | Builds the hit-rate test set / scores the latest real runs against it |

GitHub Actions runs lint, type check, tests and build on every push and pull request.

## Tech stack

Next.js, React, TypeScript and Ant Design (cockpit) · NestJS (server) · npm workspaces · Google Gemini behind our own provider interface, so the model can be exchanged · Vitest.

There is no database in the prototype. Data is stored as JSON and PDF files behind our own storage interface, so a database such as PostgreSQL can be added later without changing the rest of the code.
