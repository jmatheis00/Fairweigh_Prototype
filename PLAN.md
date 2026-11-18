# Fairweigh (Sustainable Supplier Cockpit): Prototype Plan

**Team:** Scromen · **As of:** 3 Nov 2026 · **Pitch:** 20 Nov 2026
**Status:** Approved on 3 Nov 2026. Translated to English and storage decision updated on 4 Nov 2026. Scope extended after feedback on 6 Nov 2026 (section 9).

## 1. Goal

A clickable web app with a working AI agent. A category buyer compares offers for one part and can **decide at a glance**. The agent collects the evidence from the source systems and records every source, so the buyer can open it.

The product is aimed at large enterprises. The prototype should therefore look sober and functional, not flashy.

### Fixed decisions

| Topic | Decision |
|---|---|
| Demo case | Rheintal Antriebe GmbH (fictitious) buys aluminium die-cast housings; steel-cast gearbox housings and copper magnet wire added on 6 Nov 2026 |
| Criteria | Product quality, price, CO₂, delivery reliability (performance not for now) |
| CO₂ | Separate criterion; the euro value is shown next to it for information only and does not count towards the score |
| Missing data | 0 points for the criterion plus a visible notice, e.g. "Data missing · 2 of 4 verified" |
| Knock-out | Proven legal violation by the product or supplier; since 8 Nov 2026 also LkSG country risk "High" without a social audit (SA8000) and a known child or forced labour controversy (team rule set, Excel v2). A too-long lead time stays a warning |
| Agent | One agent with tools for four simulated source systems |
| Ranking | Fixed code. The AI collects evidence, it does not rank. The rationale is a fixed template filled by code (16 Nov 2026) |
| Validation | No human checks in advance; the code checks every piece of evidence, the buyer can open the source |
| Tech | Next.js, React, TypeScript, NestJS. Online: the static preview on Cloudflare Pages replays recorded Gemini runs; no Cloud Run hosting (16 Nov 2026) |
| Storage | No database for now: data as JSON files, runs in memory and as a file (decision of 4 Nov 2026). A database can be added later behind the same interface |
| AI model | Free tier: Gemini behind our own interface, so the provider can be exchanged. Groq dropped (16 Nov 2026): the fallback is the last saved run, marked as such |
| Demo operation | Real run via button, saved runs as a marked fallback |
| Access | No login in the prototype (decision of 4 Nov 2026). A daily limit on live AI runs protects the free quota. Three simulated demo users can be switched in the account menu (6 Nov 2026); this is not authentication |
| Data | Only fictitious dummy data, users cannot enter their own data (the request form only selects a product, quantity and date) |

## 2. User interface: decision at a glance

### Guidelines

1. **The answer comes first.** At the top: recommendation and reason. Since 10 Nov 2026 the gap to second place is in the supplier details (expert interviews).
2. **One view is enough for the decision.** Recommendation and matrix with up to 6 offers fit on the screen at 1440 × 900 without scrolling.
3. **Details only on click.** Evidence and sources open in a side panel, the matrix stays visible.
4. **Factual style.** Ready-made enterprise components (Ant Design, confirmed on 4 Nov 2026), neutral colours, clear tables, no animations and no decoration.
5. **Colour only with meaning.** Green, yellow and red only stand for status and always come with text or a symbol.
6. **Keyboard and readability.** Usable by keyboard, sufficient contrast, numbers right-aligned with unit.

### Purchase request form (added on 4 Nov 2026)

One compact row above the decision view, so recommendation and matrix still fit on the first screen:

- **Product:** dropdown. The three demo products (aluminium gearbox housing GH-200, steel-cast gearbox housing, copper magnet wire) can be selected. A few other parts that match the Excel categories are listed but disabled with "No offers in this demo".
- **Quantity:** default per product (GH-200: 2,000 pieces from Excel v2). **Weights** start at the product category's default from Excel v2 (without "performance", scaled to 100 %); the buyer can change them. Unit prices stay as offered; total cost and the CO₂ euro display are calculated from the quantity. No effect on the score.
- **Needed by:** delivery date. If an offer's verified lead time cannot meet it, the offer gets a visible warning such as "Lead time 34 days, too late for 20 Dec". Score and ranking do not change. A lead time that is missing or not verified shows "Lead time not verified".
- **Collect evidence:** starts the agent for the selected product.

The lead time is collected and checked like every other value (from the offer document), but it is not a scoring criterion.

### Main view (sketch with example values)

```text
Aluminium die-cast housing · 10,000 pcs                 [Collect evidence] As of: today 10:42

RECOMMENDATION: Supplier A · 78 points · 6 points ahead of Supplier B     4 of 4 criteria verified
Better quality and much less CO₂ at a 4 % higher price.                   [Record decision]

Weights:  Quality [25 %]  Price [25 %]  CO₂ [25 %]  Delivery [25 %]               [Reset]

Rank  Supplier      Score  Quality         Price/pc   CO₂/pc              Delivery      Notes
 1    Supplier A     78    0.8 % compl.    €18.40     2.1 kg actual       97 %
 2    Supplier B     72    1.2 % compl.    €17.70     6.2 kg estimated    89 %          Price 120 days old
 3    Supplier C     41    Data missing    €16.90     9.8 kg estimated    Data missing  2 of 4 verified
 —    Supplier D     —     2.5 % compl.    €15.30     8.0 kg estimated    88 %          EXCLUDED: violation
```

Every cell is clickable and opens the evidence: value, one sentence about it, system, location, retrieval time and link to the source.

### Acceptance criterion

A test user names the recommendation and the main reason within **10 seconds** without help. This complements hypothesis H1 on slide 9.

### Demo flow

Since 10 Nov 2026 (expert interviews) the buyer is guided through five steps:

1. **Work queue:** open purchase requisitions from the ERP and the annual CO₂ target; "Start".
2. **Review requirement:** material, quantity and date from the ERP, editable.
3. **Collect suppliers:** suppliers with a quotation (favourites first); the agent collects the evidence and shows the gaps ("Request missing data").
4. **Compare:** recommendation, slim matrix, badges and notices; a value opens its source; weights move within ±10 points of the company default.
5. **Decide:** the recommended offer is preselected; a justification is required for a different offer or changed weights.
6. **Complete:** the record goes into the Decision Log (export as CSV) and the requisition moves to "Completed". The order itself is created in the ERP as usual: the cockpit supports the decision, it never creates requisitions or orders (17 Nov 2026).

## 3. Decision logic

The logic is pure, tested code without AI.

| Criterion | Metric | Better is | Source |
|---|---|---|---|
| Product quality | Complaint rate | lower | ERP |
| Price | Unit price from the offer | lower | Offer |
| CO₂ | PCF per piece | lower | CO₂ data or report |
| Delivery reliability | Share of on-time deliveries | higher | ERP |

**Procedure:**
1. **Check knock-outs.** Excluded offers stay visible, with reason and source, but without a score.
2. **Points against today (since 17 Nov 2026).** Each verified value is compared with what we have today, the average of the last three purchases of the part: 50 points = the same as today, +1 point per 1 % better, −1 point per 1 % worse, capped at 0 and 100. Since 18 Nov 2026 quality is compared by the share of deliveries without a complaint (100 − complaint %) and delivery by the share on time, so every percentage is a real one (before: complaint and late shares, which turned gaps of tenths of a percentage point into 25 or 40 points). Reference values: price = the average unit price of the last three purchase orders in the client ERP (without orders: the current contract); quality and delivery = the ERP figures of the suppliers of those orders (without orders: the current supplier); CO₂ = their product footprint (PCF exchange). Fallback without any value: the category average (quality, delivery) or the published industry average (CO₂). The published CO₂ industry average (IAI, worldsteel, ICA, OEKOBAUDAT; `data/source/public-benchmarks.json`) × material per piece stays visible as context ("best offer is X % below/above the industry average"), but no longer counts towards the score, because it covers the material only. From 8 to 17 Nov 2026 the points were measured against benchmarks (CO₂ industry average, quality and delivery category averages); before 8 Nov 2026 min-max among the offers, which the engine still uses only when a product has no reference values.
3. **Missing or unverified values.** 0 points and a notice. Exception (8 Nov 2026): suppliers that never delivered (quote or new candidate) get a score range for quality and delivery, from the weakest to the best complaint rate and on-time delivery of our current suppliers in the category. The ranking uses the low end and, since 18 Nov 2026, always puts such a supplier after all offers with real data; the table shows the range, and the summary says when the high end would beat the recommendation ("request a sample delivery first").
4. **Weight.** Default 25 % each, the sum always stays 100 %.
5. **Sort.** Offers with real data before suppliers that never delivered; then the higher score; with equal scores the higher share of verified criteria wins, then the lower price.
6. **Show the result against today (18 Nov 2026).** Score − 50 is the weighted average of the percentages per criterion, shown as "Ø 9 % better than today" (range −50 % to +50 %). Colours: green from 5 % better, red from 5 % worse, yellow in between (same limit as the arrows per criterion), always with word and arrow.

**Knock-out or warning:**

| Classification | Example | Effect |
|---|---|---|
| Proven violation | S-0005: fine for wastewater discharge | Knock-out |
| Allegation without proof | S-0006: complaint by residents | Warning |
| Country risk | S-0014: LkSG risk "High" | Warning |

The cockpit makes no legal assessment. It shows the stored proof, and the user interface carries a corresponding notice.

**Further rules:**
- **Age of the price:** every price shows date and age. From 90 days on, "outdated" appears (threshold decided 16 Nov 2026; the Scope 3 manager can change it on the Rules page). The score does not change because of this.
- **CO₂ in euros:** `PCF per piece × quantity ÷ 1000 × CO₂ price per tonne`. Display only.
- **Rationale:** a fixed text template filled by code with the calculated values (decision of 16 Nov 2026). No AI-written sentence, so no number can be invented. An AI sentence would be an option later, only if the code checks that every number in it comes from the inputs.

## 4. Agent

**Task:** for every offer, find and prove the four criteria as well as indications of violations, and report gaps or contradictions.

**Tools:**
- `get_erp_record(supplierId)`
- `get_rating(supplierId)`
- `get_pcf(supplierId, partId)`
- `list_documents(supplierId)` and `read_document(documentId)`

**Result per piece of evidence:** criterion or topic, value, unit, one sentence, system, document or record, location, retrieval time, status.

**Check in code after every run:**
- Does the source exist?
- Is the value at the stated location?
- Do unit and supplier match?

If a piece of evidence fails the check, it counts as "not verified" and gets 0 points.

**Limits and operation:**
- Maximum steps, time limit and retries are fixed: 10 model turns, 300 s per run, 2 retries (18 Nov 2026: time limit raised from 120 s, because stronger Gemini models needed longer).
- The run is a background job in the server, the user interface shows the progress.
- The app stores every step for the log.
- On limit or outage: the last saved run, marked as such (Groq dropped, 16 Nov 2026).
- In test mode a `FakeLlmProvider` returns fixed answers, so development and tests use nothing up. It only runs locally and in automated tests; it is switched off in the online version.
- The app always shows what is running: "Live: Gemini" as a tag in the header; "Saved run from 18 Nov" in the help menu, in "About Fairweigh" and on the collect step next to the run (18 Nov 2026: no header tag for saved runs, so the pitch screen stays quiet).
- The hit rate is only measured with the real model.

**Test set:** a list of expected evidence and traps for every demo supplier, runnable via command. The hit rate with the final model goes into the presentation.
- Built since 16 Nov 2026: `data/test-set/hit-rate.json` (`npm run hitrate:set` builds it from `data/sources`): for each product and offer, the expected value per criterion, `null` where the source has none (trap: the agent must report a gap, not a value), the expected compliance findings and decoys (PCF records of the same supplier for other parts).
- `npm run hitrate` scores the latest saved real run per product in `data/runs`: "agent" counts what the model reported, "after check" only verified evidence. Test-mode runs are never saved there, so `FakeLlmProvider` cannot deliver the hit rate.
- `npm run runs:record` records one real run per product against a server started with `LLM_PROVIDER=gemini`.
- **Quota (16 Nov 2026):** the free tier allows about 20 Gemini requests per day and model; one run needs about 10. So about two live runs per day and model, far fewer than the app's daily limit of 20 runs. `gemini-2.5-flash` was retired for new keys and `gemini-3.8-flash` was often overloaded, so the default is `gemini-3.5-flash`.
- **First real runs (16 Nov 2026):** all five runs found the right prices, but wrote the unit as "EUR"; the evidence check rejected every price ("EUR" alone could hide a price per 100 pieces). The system prompt now names the exact unit for every value. The runs must be recorded again when the quota is free.

## 5. Data

The starting point was `Supplier_Dummy_Data.xlsx` (100 fictitious suppliers). Since 8 Nov 2026 the data basis is the team's `Supplier_Dummy_Data_v2.xlsx` (same 100 suppliers with updated values, plus the demo case GH-200 with offers, PCF records and sources). Details and every value with its source: `data/README.md`.

### Demo suppliers: die-cast aluminium gearbox housing GH-200 (Excel v2)

Demo request: 2,000 pieces, needed by 18 Dec 2026.

| ID | Supplier | Values from Excel v2 | Role in the demo |
|---|---|---|---|
| S-0013 | Alucast Schwaben | EUR 84.50, 38.0 kg CO₂ supplier-specific, 24 days, 95 % on time, 0.8 % complaints | Existing supplier |
| S-0015 | Alu-Druckguss Erzgebirge | EUR 85.35, 22.6 kg CO₂ verified, 27 days, 97 % on time, 1.0 % complaints | Demo story: +1.0 % price, −41 % CO₂, verified footprint |
| S-0018 | Alu Balkan | EUR 72.80, 41.5 kg CO₂ company estimate from 2024, 32 days | Many gaps, old CO₂ data, LkSG risk "Medium" as warning |
| S-0014 | Ningbo Silverline | EUR 61.90, 52.6 kg CO₂ industry average, 55 days | Knock-out: LkSG risk "High" without SA8000 |
| S-0020 | Saigon Lightmetal | EUR 59.40, 50.5 kg CO₂ industry average, 58 days | Knock-out: LkSG risk "High" without SA8000 |

Until 8 Nov 2026 the aluminium case used S-0005 (fine notice) and an invented supplier S-0101; both are no longer offers. The fine notice of S-0005 stays as a document.

### Adjustments to the data

- **Names:** 44 names that played on real companies were replaced with invented ones (6 Nov 2026, again for Excel v2 on 8 Nov 2026).
- **S-0005:** fictitious fine notice as a document.
- **Future dates:** `last_updated` of S-0046 and S-0085 lie after the demo date and are set to 2025 (assumed year typo).
- **`data_source` and `sustainability_report`:** for six suppliers in Excel v2 the fields contradict each other. S-0005 stays as a test case for the agent, the others are corrected.
- **Copper wire:** S-0029 has no price index or CO₂ intensity in Excel v2 and is replaced by S-0024.
- **New:** offers with part, quantity, unit price, price date, validity, lead time and source; PCF per piece with badge.

### Badges: CO₂ data quality (team data model, 8 Nov 2026)

1. **Verified:** supplier-specific value for this part, checked by a third party
2. **Supplier-specific:** calculated by the supplier for this part
3. **Company estimate:** derived from the supplier's company-wide CO₂ intensity
4. **Industry average:** from an industry database

Levels 3 and 4 count as estimated (rule "flag estimated CO₂"). The cockpit shows the level on every CO₂ value and the coverage in the evidence tile, e.g. "CO₂: 2 of 5 supplier-specific" (Sprint 3 story 2).

For the estimates, a freely available CO₂ source will be selected and documented with a link (slide 8 names Climatiq, not yet checked). Since 8 Nov 2026 only one small line in the app footer and at the bottom of each PDF says "sample data"; the READMEs in `data/` state that all data is invented.

### Simulated source systems

| System | Implementation | View on click |
|---|---|---|
| Client ERP (`data/sources/client-erp/`) | JSON files with our own interface, plus order PDFs | Record, order PDF |
| Rating partner (`data/sources/partner-ratings/`) | Own interface in provider style, plus scorecard PDFs | Rating entry, scorecard |
| PCF exchange (`data/sources/partner-pcf-exchange/`) | Own interface in the style of a PCF exchange (PACT) | CO₂ record with badge, data sheet if any |
| Supplier documents (`data/sources/supplier-documents/`) | PDFs: quotations, PCF data sheets, fine notice | PDF with highlighted passage |

Since 8 Nov 2026 each system is its own folder, generated from the team Excel v2, so the agent visibly collects from separate sources (client ERP, partners with sustainability data, supplier documents). Details: `data/README.md`.

## 6. Tech

```text
web/      Next.js, React, TypeScript: cockpit
server/   NestJS: modules supplier-data, decision-engine, agents, reporting, sim-sources
shared/   Shared types
data/     Scripts, Excel, generated JSON files and PDFs
```

- **Storage (as of 4 Nov 2026):** no database for now. The fictitious data lies in the repo as JSON files, agent runs in memory and as a JSON file. The code only accesses storage through our own interface, so PostgreSQL can be added later.
- **Consequences without a database:** online, only one copy of the app runs, otherwise progress and daily limit would be wrong. So the app is not scalable for now. Since 16 Nov 2026 the server keeps the Decision Log in a JSON file behind our own interface (`data/decisions/`, not in Git), so every user and browser sees the same entries; the static preview keeps it in the viewer's browser.
- **Hosting (16 Nov 2026):** no Cloud Run. The online version is the static preview on Cloudflare Pages; it replays the recorded Gemini runs and shows "Saved run from <date>". Live runs happen on a local server with a Gemini key. Containers on Cloud Run or BTP Kyma stay the target architecture (slide 11).
- **Quality:** GitHub Actions for lint, tests and build. Tests for the decision engine and the evidence check are mandatory.
- **Security:** API keys only as environment variables, daily limit for live AI runs on the server. No login (decision of 4 Nov 2026): anyone with the link can use the demo, which only shows fictitious data.

**Deliberately left out of the prototype** (target architecture stays on slides 8 and 11): Redis, S3, Keycloak or Entra ID, Terraform, real ERP connection, supplier access, real price request.

## 7. Timeline

| Date | Result | Acceptance |
|---|---|---|
| **By 6 Nov** | Skeleton online, data for one supplier, one agent run | Evidence can be opened in the cockpit down to the source |
| **By 10 Nov** | All demo data, decision engine, main view | Weights change the ranking, knock-out and gaps are correct |
| **By 13 Nov** | Complete demo flow, decision log | Test with the Consulting Director carried out |
| **By 18 Nov** | Feedback implemented, test set evaluated, backup video | No new features, complete run successful |
| **20 Nov** | Pitch | Another complete run in the morning |

The order matters: if time runs short, export and the price request button are dropped first. Main view, agent and source view stay.

## 9. Feedback round of 6 Nov 2026

Agreed with Julia on 6 Nov 2026:

| Topic | Decision |
|---|---|
| Products | Two more products get offers: steel-cast gearbox housing (P-STL-HSG-01) and enamelled copper magnet wire (P-CU-WIRE-01). Suppliers come from the Excel; missing values are marked `toConfirm` |
| Several products | The request form takes several products. One agent run per product, started one after the other (quota and daily limit). The cockpit switches between products |
| Navigation | Petrol navigation bar with logo: Overview, Cockpit, Suppliers, Decision log. Logo: a shopping cart carrying a leaf (procurement plus sustainability), chosen 6 Nov 2026 after several rounds |
| Demo users | The three personas from "Sprint3_Personas_Journeys_v3" (6 Nov 2026), fictional first names: Thomas (Category Manager, Direct Materials) starts runs and records decisions; Sarah (Scope 3 / Sustainable Procurement Manager) and Katrin (CPO) view only. Thomas and Katrin also see spend and contract details. Decisions record who decided. Own views for Sarah and Katrin are open (deck, Q2) |
| Suppliers page | All 100 fictitious suppliers from the Excel for every user, from the simulated ERP and rating provider. The planned data corrections (section 5) are applied |
| Purchase history | Fictitious purchase orders for Q2 and Q3 2026 as ERP records. In a real system they come from the ERP (orders, contracts), CO₂ per piece from the PCF exchange |
| Statistics | Start page shows CO₂e per piece Q3 vs Q2, CO₂e avoided through cockpit decisions, share of spend with supplier-specific CO₂ data (levels 1 and 2) and number of cockpit decisions. Pure code, computed only from the purchase records |
| Matrix | Score coloured in three bands (70+ strong, 40–69 medium, below 40 weak) with the word in tooltip and screen-reader label; notes all grey with icons; headers show each criterion's benchmark and explain the points (50 = benchmark); every value shows its "as of" date from its source (offer date, CO₂ record date, ERP record update), old data gets a warning icon in the cell instead of a note |
| Notices | Since 8 Nov 2026 only "Prototype with sample data" in the bottom corner (and a small line at the bottom of each PDF), so the pitch shows a real-looking connected system; the mode shows as an icon with a tooltip in the header. A saved run is always spelled out as "Saved run from <date>" |
| Example decisions | Two fictitious decisions by Thomas (July 2026: steel S-0001 → S-0007, copper S-0023 → S-0021) appear in the decision log as "Example, fictitious". Built by code from the demo records with the decision engine, no AI (run mode "example") |
| Sustainability page | Own navigation item for everyone, start page for Sarah: CO₂ hotspots (Scope 3 category 1), data quality and age of the purchased CO₂ values, whether sufficient sustainability data is in the source systems per supplier (CO₂ data from the supplier and a rating; estimates and web searches do not count), risk and rules. The cockpit sends no data requests, so request statuses are not shown (6 Nov 2026). Answers open question Q2 of the persona deck for Sarah; Katrin has no own view yet |
| Static team preview | A server-less build of the cockpit, hosted as a private Claude artifact for the team (6 Nov 2026). It reads recorded data and replays one run per product recorded in test mode (FakeLlmProvider), so it is **not** the online version and never the pitch demo. Build: `npm run preview:build -w @scc/web` with a local server in test mode. Since 10 Nov 2026 the built folder `web/preview-dist` is committed and served by Cloudflare Pages from the branch, so people outside the Claude account can open it (no build on Cloudflare; anyone with the link can open it, sample data only) |
| Supplier names | 43 Excel names that played on real companies, plus S-0005, renamed to clearly invented ones (6 Nov 2026), so no invented risk can be read as a claim about a real firm |
| Team data model (8 Nov 2026) | Compared with `DataSources_DataModel.pptx`: info requests are ignored (not core, not needed for the prototype, overrides Sprint 3 story 8); a lead time that is too long stays a warning, never a knock-out; the prototype keeps four criteria (no fifth); CO₂ price for the euro display is EUR 100/t as in Excel v2. Excel v2 (`Supplier_Dummy_Data_v2.xlsx`) is the data basis: demo case GH-200 replaces the aluminium case, knock-outs K2 and K3 from its rule set, the four-level CO₂ data-quality ladder, category default weights without "performance" scaled to 100 %, the same 44 renames. With the v2 prices both example switches (steel, copper) also save money |
| Understandable at first sight (8 Nov 2026) | After comparing with layout inspiration (kept locally, never in Git): tabs named after the question they answer ("Compare offers", "CO₂ and risks", "Results"); every page has a one-line subtitle; the cockpit starts with a plain-language summary built from a fixed template in code (no AI); "How it works" (request → AI collects → code checks → knock-outs → score → you decide) on the start page and in the help; CO₂ coverage on the recommendation ("2 of 3 scored offers with supplier-specific CO₂ data", Sprint 3 story 2); the Results page says "Savings" when a decision costs less. Data requests: light version only. "What's missing" offers a copyable request text built from the gaps; nothing is sent or tracked (partly revises "info requests are ignored") |
| Dashboard filters (8 Nov 2026) | "CO₂ and risks" and "Results" get one filter row: period (quarters, single month, whole range; default latest quarter) and product, plus relationship and flag filters for the supplier lists. Periods are built only from months with purchase orders; the CO₂ tile compares with the period of the same length before. The supplier base (data levels, risk counts) is not time-bound. The fictitious history covers Apr–Sep 2026 only |
| Source folders (8 Nov 2026) | The team Excel v2 stays the only input. `npm run data:build` splits it into one folder per simulated system in `data/sources/`: client ERP (suppliers, quotations, purchase orders and their PDFs), rating partner (ratings and scorecard PDFs), PCF exchange (footprints), supplier documents (quotation PDFs, PCF data sheets, fine notice). Each file names the system it simulates; the new PDFs only repeat values of their records. Real benchmark data (decision of the same day) will get its own folder `public-benchmarks/` |
| Benchmark scoring (8 Nov 2026) | Replaces min-max among the offers, which made small differences look huge (0.8 % vs 1.0 % complaints = 100 vs 0 points) and every winner look weak. Points now show how good a value is against a benchmark: 50 = at the benchmark, +1 point per 1 % better, capped 0–100; score colours unchanged. Real data for CO₂ (IAI 2023: 10.04 kg CO₂e/kg aluminium incl. recycling; worldsteel 2023: 1.92 kg CO₂/kg crude steel; ICA 2023: 3.52 kg CO₂e/kg copper cathode) × material per piece (GH-200 3.2 kg from Excel v2; steel housing 15 kg and copper spool 5 kg as assumptions), material only. Internal benchmarks for price (first the request budget; changed the same day to the price we pay today, the last purchase price in the client ERP: GH-200 EUR 84.50, steel EUR 46.92, copper EUR 63.24), quality and delivery (average of our suppliers in the category). Missing values stay at 0 points. Next step: a view per category whether the current suppliers beat the benchmark |
| Richer source data (8 Nov 2026) | Around the Excel v2 values, as a large client's systems would hold them: client ERP with purchase orders from January 2025 (63) and a 24-month vendor evaluation per supplier (deliveries, on time, complaints, spend; the ERP KPIs are exactly the last 12 months); rating partner with rating history, certificates with validity, company emissions (Excel columns not used before) and scorecards for every rated supplier; a new risk-monitoring partner (style of Prewave / IntegrityNext) whose alerts only restate facts from the other systems; certificate PDFs. Shown in the supplier details and as an alerts feed on CO₂ and risks. Notices reduced to one footer line and one PDF line |
| Analytics (8 Nov 2026) | Built on the richer data, following typical procurement and Scope 3 dashboards (inspiration screenshots; tools like Sievo, Coupa, SAP Ariba, EcoVadis, Prewave): sparklines in the overview tiles; on CO₂ and risks a map of current suppliers (spend vs CO₂ per EUR against the category average, bubble = spend-based CO₂, quadrant "switch candidates", Pareto 80 % line) and purchased CO₂ per month against a target path (2025 average −4.2 % per year, SBTi 1.5 °C rate); on Results "next best actions": supplier switches ranked by EUR per tonne CO₂ avoided at last year's quantities, excluded offers left out. Pure code in `shared/src/analytics.ts`, tested |
| Clearer at a glance (8 Nov 2026) | Filter as two dropdowns (period with quick ranges, product). Price benchmark = price we pay today (last purchase price in the client ERP). Suppliers that never delivered: a score range (weakest to best of our current suppliers in the category) instead of 0 points, ranked by the low end. Points under each value with status colour and arrow (≥55 better, ≤45 worse than the benchmark), icons in all KPI tiles, chart explanations moved into tooltips, CO₂ cost line in plain words |
| Five products and data requests (8 Nov 2026) | All five catalog products can be compared: new cases deep-groove ball bearing 6208 (20,000 pcs, CO₂ benchmark worldsteel 1.92 kg/kg × 0.4 kg steel) and radial shaft seal 40x62x7 EPDM (20,000 pcs, OEKOBAUDAT 2023-I 4.17 kg CO₂e/kg EPDM, reference year 2018, × 0.06 kg), each with five offers incl. one knock-out or never-delivered supplier. Price benchmark falls back to the current contract price when there is no purchase order. CO₂ and risks: "Data to request" for the Scope 3 manager (estimated or outdated CO₂ in our purchases, missing rating or emissions, certificates expiring within 120 days) with a copyable request, nothing is sent; risk counts open the list of affected suppliers; SBTi explained; status colours on tiles and on Results |
| Rules for buyers (Sarah) | Own page "Rules", shown only to the Scope 3 manager (the others see the rules in force in the help): price age threshold, CO₂ data age threshold, CO₂ price for the euro display, and whether an estimated CO₂ value is flagged. Stored by the server (JSON file behind our own interface) and applied in every cockpit view. These rules only create warnings and never change the score; the knock-out rules and "missing data = 0 points" stay fixed in code. Answers the persona feedback of 6 Nov 2026 |
| Impact view (Katrin) | Own page "Impact", start page for the CPO: number of cockpit decisions, extra cost against the replaced supplier, t CO₂e avoided, cost per tonne avoided, the CO₂ euro value for comparison (display only) and the share of decisions that follow the recommendation. Computed only from the purchase orders and the decision log; the history is fictitious |
| Expert interviews (10 Nov 2026) | Two expert interviews (Consulting Director, Digital Platform Manager; notes kept locally, not in Git) asked for a guided start page. Agreed with Julia: the start page is a **work queue** of open purchase requisitions from the simulated client ERP (`client-erp/purchase-requisitions.json`, five fictitious requisitions, one per product) with "My open requests" and "Completed", plus the buyer's annual CO₂ target as a progress bar (target set by the Scope 3 manager on the Rules page, achieved = CO₂ avoided by the buyer's cockpit decisions this year). "Start" opens a **guided flow** with a progress bar: 1 Review requirement (quantity and date editable) · 2 Collect suppliers (agent run) · 3 Compare · 4 Decide (justification only required when deviating from the recommendation or the default weights) · 5 Complete (Decision Log; the requisition moves to "Completed"); earlier steps can be reopened. "How it works" is removed from the start page (stays in the help). The Q3 overview and charts move to **Results**. **Slim matrix:** one line per offer with value and points; the benchmark row, "as of" dates, supplier IDs and the gap to second place move into the side panels (the matrix stays on the first screen, CLAUDE.md). **Weights:** company default per commodity group; the buyer may move each weight at most ±10 percentage points; changed weights need a justification and are saved with the defaults in the Decision Log. **Role-based navigation:** pages a role does not need are hidden, not greyed out (Thomas: work queue, purchase process, suppliers, results, decision log; Sarah: CO₂ and risks, results, suppliers, rules; Katrin: results, suppliers; everyone: glossary). **Glossary** page explaining every metric and the risk thresholds, info icons on the overview cards. **Decision details:** decisions open with the full record, supplier names link to the supplier, the supplier details list earlier decisions, "Reorder" starts a new process for the same product and supplier (removed 17 Nov 2026, see below). **Favourites** (star, "Favourites only" filter, first in step 2; saved in this browser). **Risk and complaint colours** in the supplier list, always with text. **AI transparency:** "How is the score calculated?" on the recommendation, the note "Ranking by fixed rules from AI-collected evidence. The buyer decides.", and the footer says which AI provider collects evidence. No claim of EU hosting, because the free Gemini tier is not EU-bound. Not built: adding suppliers by hand (users cannot enter their own data) |
| Targets and CPO dashboard (10 Nov 2026) | Same feedback, second part. **CO₂ targets** (page for Sarah): company, buyer and commodity group in t CO₂e avoided this year, editable by the Scope 3 manager and saved with the rules; achieved = CO₂ avoided by cockpit decisions in the groups (orders after a decision plus decisions not ordered yet); status "achieved", "on track" (at least the share of the year passed) or "at risk"; switch "by buyer / by commodity group"; a company setting hides the achievement per buyer (bonus talks), each buyer still sees their own on the work queue. Fictitious buyers Jonas and Lena own the commodity groups without demo offers. **CPO dashboard** (Katrin's start page, replaces Results for her): CO₂e purchased last quarter with trend, company target achievement, cost savings 2026, supplier risks (certificates expired or expiring within 120 days, no rating, LkSG High); each tile opens a drill-down by commodity group or supplier, never by material or employee; below, the top 10 active suppliers by annual spend with cost savings and CO₂ avoided from cockpit decisions. Pure code in `shared/src/co2-targets.ts`, tested |
| CPO dashboard filters and key figures (12 Nov 2026) | Katrin can filter again, as on the old Results page: period (default: latest quarter with orders) and commodity group instead of single products (expert feedback: no single materials for the CPO). The CO₂ target stays per year; risks and contracts are today's state. Three more tiles, each with a drill-down: cockpit use (decisions in the period, share following the recommendation, cost per tonne CO₂ avoided), CO₂ intensity (kg CO₂e per EUR against the period before) with data quality (share of spend with supplier-specific CO₂ data), and contracts of active suppliers ending in the next 6 months with their spend. Pure code in `shared/src/cpo-stats.ts`, tested |
| Sarah starts on her targets (12 Nov 2026) | "CO₂ targets" is the Scope 3 manager's first tab and start page; "CO₂ and risks" follows as the second tab. Follows the expert feedback (navigation for the sustainability manager starts with targets): "are we on track?" is her starting point, the analysis comes after. Replaces "start page for Sarah: sustainability page" of 6 Nov 2026 |
| UX/UI review (16 Nov 2026) | Review by a UX/UI designer, one sheet per persona (images kept locally, never in Git). Agreed with Julia. **Consistency:** supplier names left-aligned in Katrin's top 10 table; "Details" links pinned to the bottom of every dashboard tile; every step of the purchase process has "Back" bottom left and the primary action ("Next …", "Record decision") bottom right, step 3 included (the header button goes). **Accessibility:** warning tags ("At risk", "Medium", "Data missing" …) get darker text so they pass WCAG AA contrast, icon stays. **Drawers:** still no grey overlay (the matrix stays visible), but a click outside or Esc now closes them; a click on another row switches the panel. **Step 3:** the recommendation sentence becomes the page headline (supplier name prominent) instead of an info alert. **Step 4:** "What this choice means" shows better values green with ↓/↑ and the word ("less", "more"), worse values red, never colour alone. **Offer table:** quality and delivery keep their measured values; no stars, because a star scale cannot be checked against the evidence. **Katrin:** the CO₂e purchased drawer gets labelled horizontal bars per commodity group above the table (no pie); warning tags on "Contracts ending" ("Action needed", a contract ends within 60 days) and "Supplier risks" ("Needs attention", only a certificate already expired or LkSG risk High). **Sarah:** "Export report" (PDF of the target status) and "Contact" per buyer, which opens her e-mail program with a prefilled text; the cockpit sends and tracks nothing |
| Slimmer purchase process (16 Nov 2026) | Feedback by Julia after the UX review. **Money** reads "7,419 €" everywhere (number first), negative numbers use the normal "-" sign. **Favourites:** the toggle in the side panel is the star only (tooltip and screen-reader label keep the text). **Step 3:** one compact recommendation block (headline "Recommended: <supplier> · <points>", one sentence against the current supplier, three short figures for price, CO₂ and evidence); coverage, robustness, the AI note, the CO₂-in-euro line and the product line move into a "Why this recommendation?" side panel. The offer table keeps the points under each value. Weights and the price-vs-CO₂ map leave the right column: one line "Weights: … [Adjust]" and a map button above the table open side panels, the table updates live and gets the full width. Long helper sentences become ⓘ tooltips. Excluded offers show one tag in Notes; the other reasons are in the offer side panel. **Step 2** is slimmed with the same rules (repeats out, details in panels) |
| Step 3 layout and "How it works" (16 Nov 2026) | Revises parts of "Slimmer purchase process" the same day (Julia). **Weights and the price-vs-CO₂ map are visible directly again** in a right column next to the offer table (weights on top, map below); long supplier names wrap instead of being cut off. **Recommendation box:** supplier name large with the score as a badge and "Why?", next to three equal tiles (price vs current, CO₂ vs current, evidence), each a small label on top and one big value with arrow and word. The "Why this recommendation?" side panel stays. **How it works** comes back to the work queue as a hideable strip with three steps: AI collects the evidence → fixed rules check and rank it → you decide, each with an ⓘ tooltip for the details (partly revises 10 Nov 2026, where it moved into the help only) |
| Finished-product look (16 Nov 2026) | Review with Julia on the same day: the prototype should look like a finished SaaS product without explanatory texts. **Help:** a "?" button in the header opens a small menu with "How it works" (the existing panel with the six steps and the score in detail) and "Glossary"; the "How it works" strip leaves the work queue (revises "Step 3 layout and How it works" of the same day) and the Glossary is no longer a navigation tab. **Mode:** a small status tag with a dot in the header ("Live: Gemini", "Saved run from <date>", "Test mode") replaces the ⓘ icon with tooltip (revises "Notices", 6 Nov 2026), so it cannot be mistaken for help. **Account menu:** name and job title only; persona, "Prototype user" and the company go; users who can change nothing (the CPO) get "Read-only access"; the Scope 3 manager edits rules and targets, so she gets no such line. **Purchase process:** step cards no longer repeat the progress bar in their title; helper sentences in step 1 and the AI note in step 4 become ⓘ tooltips (the AI note stays in the help panel and the footer); while the agent runs, step 2 shows placeholder rows and "Collecting evidence…" instead of an empty table; supplier labels in the price-vs-CO₂ map no longer overlap |
| Consistency and sample work (16 Nov 2026) | Feedback by Julia the same day. **Risk colours** are the same everywhere (LkSG risk, risk-monitoring alerts, supplier details): High red with an exclamation icon, Medium yellow with warning icon, Low green with check icon, always with the word. **Filters:** empty filters showed light grey placeholder text that looked disabled; placeholders now meet WCAG AA contrast (4.5:1) everywhere. **Favourites** are kept per demo user, each starting with one or two suppliers of their own. **Work queue:** the "Status" column in "To procure" goes (every row there is open); the simulated ERP gets one requisition already in progress and two completed ones from July 2026, linked to the two example decisions, so "My open requests" and "Completed" show how they look. **Progress bar:** finished steps show a petrol check instead of grey; the next step can be clicked like the "Next" button (only when "Next" would work), never "Complete", which stays the deliberate "Record decision". **Price request:** "Request current price" in the offer side panel (and next to an outdated price) opens the buyer's e-mail program with a prefilled request to the supplier; the cockpit sends and tracks nothing (light version, real price requests stay out of the prototype). **Rules page:** "Fixed in code (not editable)" becomes "Rules that always apply", without the prototype sentence |
| Name, footer and hover (16 Nov 2026) | Feedback by Julia the same day. **Name:** the product is called **Provenly** ("proven" + "provenance": every value has a source the buyer can open), in the header, browser title and PDF footers; "Sustainable Supplier Cockpit" stays as the project name in the documentation. Whether the name is free (trademark, domain) is not checked yet. **Logo and name** lead to the user's start page. **Footer:** the fixed line at the bottom goes; "About" in the "?" menu shows the AI mode, "Ranking by fixed rules" and "Prototype with sample data" (revises "Notices", 8 Nov 2026, and the AI note in the footer of 10 Nov 2026; the mode tag in the header stays). **Hover and colours:** one hover language: primary buttons get darker, other buttons petrol border and text, links petrol with underline, clickable table rows and values a light petrol tint with a hand cursor, header items one white highlight; rows that cannot be clicked get no hover. Colours come from one set of brand tokens instead of scattered values |
| Mode tag and narrow matrix (16 Nov 2026) | Feedback by Julia the same day. **Mode tag:** only live and saved runs show it in the header ("Live: Gemini", "Saved run from <date>"); test and example mode show no tag and are named in "About Provenly" (revises "Finished-product look" of the same day). **Offer table in step 3:** the Notes column goes; warnings, the knock-out tag and "Request price" sit under the supplier name, the CO₂ source tag under the CO₂ value. The table gets narrower (about 770 instead of 990 px at 1440 wide), the right column with priorities and the price-vs-CO₂ map wider (about 610 instead of 390 px); the map gets wider, not taller, so step 3 still fits 1440 × 900 without scrolling. Phones keep the offer cards |
| CO₂ in euros in step 4 (16 Nov 2026) | Feedback by Julia after comparing the app with the pitch storyline ("CO₂ in euros on the price tag" is the demo highlight). "What this choice means" in step 4 gets a line "CO₂ in euros" under the price and CO₂ difference, e.g. "3,080 € CO₂ cost avoided" (30.8 t × 100 €/t from the rules); an ⓘ says it is information only. It never changes the score or the ranking (rule "CO₂ in euros is display only") |
| Name Fairweigh and step names (16 Nov 2026) | Decided by Julia after comparing the app with the Sprint 4 pitch material. **Name:** the product is called **Fairweigh**, as in the pitch design template v4 with the scale (price vs CO₂) as its signature element; it replaces "Provenly" from earlier the same day in the header, browser title, "About Fairweigh", texts and PDF footers. Trademark and domain are not checked yet. **Process steps** in the app and on all slides: Request, Collect, Compare, Decide (the app adds Complete after recording) instead of "Review requirement" and "Collect suppliers". **CO₂ targets** stay with Sarah (Scope 3 manager) in the app, as on the persona slide. **Logo:** the Fairweigh scale from the design template (level beam on a pivot, price circle left, CO₂ circle right) replaces the shopping cart of 6 Nov 2026 in the header and as the browser icon; on the petrol header white with a light teal CO₂ circle, on white teal with an accent teal CO₂ circle |
| Table alignment, navbar hover and supplier table (16 Nov 2026) | Feedback by Julia the same day. **Offer table:** column headers end exactly where their values end; the rank column is a narrow "#"; notes under the supplier name are small text lines with an icon instead of grey boxes; the right column gets about 40 % of the width (was 44 %), so long supplier names wrap less. **Navbar:** logo and name get no hover effect (hand cursor only); navigation items get a light line at the bottom on hover, the same place as the white line of the active item, instead of a background block; "?" and the account only turn white or underline the name. **Suppliers:** the table fits a 1280 px laptop without scrolling sideways: the country moves under the supplier name next to the ID, contract end goes under the spend, "No orders yet" becomes "No orders", narrower columns |
| Targets report and Rules width (16 Nov 2026) | Feedback by Julia the same day. **Export report** (Sarah, CO₂ targets): the browser lays out a printed page at paper width, so the app switched to its phone cards, split cards across pages and printed buttons and switches. The printout is now its own report: Fairweigh header, date and who changed the targets last, the company figure, a table by buyer and a table by commodity group with the same columns (target, achieved, remaining, progress, status as word and symbol) and one line "Prototype with sample data"; A4, one page with the demo data. If achievement per buyer is hidden, the buyer table shows only targets. **Rules and CO₂ targets pages** use the full width like all other pages (no fixed maximum width) |
| Dashboard group filter and custom range (16 Nov 2026) | Feedback by Julia the same day. **Commodity group without orders** (e.g. Bearings, Katrin's dashboard): the page went blank, because the savings figure returned "no result" instead of zero when the group had no purchase orders. It now shows zeros and "No purchase orders in this period". **Custom range** in the period filter of all dashboards: after the quick ranges, "Custom range…" opens a month picker (whole months, only months with orders, so it never points at invented data). Figures are titled with the months, e.g. "Feb – May 2026", and compared with the span of the same length before |
| Role in the header (16 Nov 2026) | Feedback by Julia the same day. Switching the demo user no longer shows a green "Signed in as …" banner, which pushed the page down until closed. Instead the header shows a short role under the name ("Category Manager", "Scope 3 Manager", "CPO"), so in the pitch it is always visible which persona is on screen. The full title stays in the account menu. Hover on the account: a light ring around the avatar instead of underlining the name, which ran into the role |
| Review of 16 Nov 2026 (consistency, function, responsive) | Decisions by Julia after a review of the whole prototype. **Done in code:** account menu switches the user with one click; on phones the step 3 tiles stack; pitch colours only in charts; "Weights" everywhere; step 4 has Back bottom left and "Record decision" bottom right; step 3 fits 1280 × 800; offer cards up to tablet width (below 992 px); every page and process step has its own address (`#/results`, `#/process/<requisition>/compare`), so Back, Forward and reload work; the Decision Log is kept on the server. **CO₂ data levels:** the supplier list column is called "Company CO₂ data" (source of the company-wide figures at the rating partner); the CO₂ value of a part keeps its own four levels in the supplier details and the cockpit. **Decided:** Groq dropped; rationale stays a fixed template; price age 90 days; online demo = Cloudflare preview with recorded Gemini runs, no Cloud Run. **Copper demo ("level the scale"), checked with the decision engine on the source values:** with the company default weights (price 44 %, CO₂ 17 %) Kupferwerk Mansfeld (former supplier, EUR 60.76, 21.1 kg CO₂e per spool) leads with 63.0 points ahead of the current supplier Elbkupfer (EUR 63.24, 10.9 kg CO₂e) with 60.1. The weights panel says "leader changes at ≥21 %". The buyer raises CO₂ to 21 %: Elbkupfer leads 61.5 to 61.3; at the maximum of 27 % (+10 points) 63.4 to 58.9. Changed weights need a justification in step 4. Demo steps: open the copper requisition → Compare → move CO₂ to 21 % or more → recommendation switches to Elbkupfer → Decide with a justification ("CO₂ almost halves for a 4 % higher price") → Complete. |
| No ordering in the cockpit (17 Nov 2026) | Decision by Julia: Fairweigh helps with the supplier decision and does not change the normal ERP process. Requisitions come only from the ERP, and the order is created there after the decision. So "Reorder from <supplier>" in the Decision Log is removed (it created a requisition inside the cockpit), together with the "Reorder" mark in steps 1 and 2. Revises the reorder of the expert interviews (10 Nov 2026). "Request current price" stays: it only drafts an e-mail asking for a quote |
| Score against today (17 Nov 2026) | Decision by Julia (model B of the scoring proposal, 17 Nov 2026). The CO₂ benchmark (industry average × material weight) covers the material only, while suppliers report a footprint for the whole part, so it was unfair to every offer and hard to defend. Now all four criteria are measured against the current supplier with the same formula (50 = same as today, +1 per 1 % better); the current supplier always scores 50. The industry CO₂ average stays visible with its source as context in the CO₂ column help and in "Why this recommendation?". Effect on the demo: same winner for all five products (aluminium 62, steel: current supplier stays best with 50, copper 55 with the flip to Elbkupfer at a CO₂ weight of 25 % instead of 21 %, bearings 83, seal 56). Models A (old) and C (own scale) were compared and not chosen. |
| Feedback on the scoring (17 Nov 2026) | Decisions by Julia: (1) "Today" is the **average of the last three purchases** of the part (unit price, and the figures of the suppliers we bought from), so one unusual order does not set the yardstick; without purchases the current contract and current supplier. No change in the demo numbers: the last three orders of aluminium, steel and copper all went to the current supplier at the same price, and bearings and seal have no orders. (2) The **Decision Log shows how the score was calculated**: each new decision saves the points per criterion and the reference values, shown as a table (weight with default, today, points, adds) so Sarah and auditors can follow it later. (3) **"Request current price"** moves into the recommendation box on the first screen (the e-mail draft; nothing is sent). (4) The industry CO₂ average stays as context in the tooltip and the "Why" panel, no extra row |
| "View details" button (18 Nov 2026) | Decision by Julia. The recommendation box in step 3 no longer opens the "Why this recommendation?" side panel on a click anywhere in its background, because a clickable background with two buttons inside was unclear. The link "Why? →" becomes a petrol primary button **"View details"** in the row under the supplier name (score badge · View details · Request current price, which stays an outline button); on phones the row wraps. **Evidence tile** (same day): instead of the count of all verified values over every offer ("24 verified", which said little), it shows the recommended offer: "4/4 criteria verified" (warning icon when fewer); a click still opens what is missing, "All evidence" stays. The line "offers with gaps · excluded" goes, because the matrix and the "Exclusions and data gaps" section of the side panel already show both. The "Log" link moves into the side panel as "Agent log", next to "How is the score calculated?" |
| Data requests as e-mail drafts (18 Nov 2026) | Decision by Julia. The data requests no longer have to be copied: in "What's missing to decide" the button **"Request missing data"** and on the CO₂ and risks page "Request data (n)" open a prefilled e-mail draft in the user's own mail program, like "Request current price" (16 Nov 2026). No copy button next to it (two buttons were too much); the text can still be read and selected in "Preview". The cockpit still sends and tracks nothing, and no recipient is filled in, because the systems hold no supplier contact |
| Slimmer recommendation box (18 Nov 2026) | Decision by Julia. The note that a never-delivered supplier could lead (required by the gap rule of 8 Nov 2026) becomes one short line, e.g. "Alu Balkan could lead (up to 64 pts) · request a sample"; the full sentence is in its tooltip and in "View details". At 1440 × 900 the box shrinks from about 150 to 110 px; on narrower screens the line wraps instead of being cut, so the advice is never hidden. Order totals and the score badge stay where they are |
| Quality points explained (18 Nov 2026) | Decision by Julia after comparing rules for the complaint rate (relative difference as today; share of deliveries without complaint; fixed points per percentage point). The scoring rule stays: 1.0 % vs 0.8 % complaints is 25 % more deliveries with a complaint, which is the real extra effort, so 25 points. Small rates make this look large, so the "View details" panel adds one line under "How the points come together", e.g. "1.0 % vs 0.8 % today means 10 instead of 8 deliveries with a complaint per 1,000 deliveries (+25 %)". The ERP rate counts deliveries with a complaint, not parts, so the line never speaks of parts. If quality counts too much overall, the lever is its weight. **Open point:** the rates rest on few cases (Alucast: 8 complaints in 1,000 deliveries over 12 months, Erzgebirge: 10), so a gap of this size can be chance; counting only the part of a difference beyond chance (a statistical test on the ERP counts) would be a later step |
| Quality and delivery as shares of good deliveries (18 Nov 2026) | Decision by Julia after comparing five rules on the aluminium housing (relative difference as before; 1 or 10 points per percentage point; complaints only 50 points per percentage point; spread of the category in the ERP). Replaces "Quality points explained" of the same day. **Rule:** quality counts deliveries without a complaint, delivery the deliveries on time; +1 point per 1 % better as for price and CO₂. Example GH-200: Alu-Druckguss Erzgebirge 99.0 % vs 99.2 % without complaint = −0.2 %, 97 % vs 95 % on time = +2.1 %, price −1.0 %, CO₂ +40.5 %; weighted (22/34/22/22) **Ø 9 % better than today** (before: 61.9 points, quality 25, delivery 90). Reason: "if quality is high everywhere, small gaps should not decide"; every percentage is a real one. Consequence: quality and delivery count little while all suppliers are good; price and CO₂ decide. **Protection:** a supplier that never delivered is always ranked after all offers with real data, otherwise its cheap price would let it win with assumed values (copper: Jiangsu Goldwire). **Display:** "Ø x % better/worse than today" instead of "x / 100" (score − 50), "vs today" column with a bar from −50 % to +50 % and a mark for today, per criterion "+40.5 %" instead of "91 pts"; colours green ≥ +5 %, yellow within ±5 %, red ≤ −5 %. **Demo numbers (saved runs):** aluminium Erzgebirge Ø +9 %; steel Donautal (current) same as today; copper Elbkupfer (current) leads, Kupferwerk Mansfeld Ø −6.5 %, so the copper demo story "raise the CO₂ weight → the recommendation switches" no longer works and needs a new story; bearings Vänern Ø +6.5 %; seal Bergstraße Ø +3.6 % (yellow). The two example decisions were recalculated (data:build); their recommendations stay the same. **Open points:** the copper demo story; rates rest on few cases (about 8–10 complaints a year), a statistical check of the counts would be a later step |
