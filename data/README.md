# Demo data

**All data in this folder is fictitious** (see the disclaimer in the Excel, sheet "Buyer & README").

| Path | Content |
|---|---|
| `source/Supplier_Dummy_Data_v2.xlsx` | Data basis since 8 Nov 2026: 100 fictitious suppliers plus the team's demo case (sheets Offers, PCF, Sources, Categories, Demo Request, Assumptions) |
| `source/Supplier_Dummy_Data.xlsx` | First version, kept for reference; no longer read |
| `assumptions.json` | Values the Excel does not contain (steel and copper prices, PCF per piece, purchase history) and corrections |
| `sources/` | The simulated source systems, one folder each, generated from the Excel. Do not edit by hand (see below) |
| `src/` | Import script and its tests |

Regenerate after changing the Excel or the assumptions:

```bash
npm run data:build
```

`npm test` fails if a file in `sources/` is out of date or was edited by hand.

## Simulated source systems (since 8 Nov 2026)

The Excel stays the only input. The build splits it into the systems a real installation would have, so the agent visibly collects from several sources. Each folder has a README with its files.

| Folder | System | Simulates | PDFs |
|---|---|---|---|
| `sources/client-erp/` | Client ERP | The buyer's ERP (style of SAP S/4HANA): supplier master and performance, quotations, purchase orders | One order PDF per purchase order |
| `sources/partner-ratings/` | Rating partner | Sustainability rating provider (style of EcoVadis) | Scorecards for the suppliers in current requests and orders |
| `sources/partner-pcf-exchange/` | PCF exchange | Product footprint exchange (style of PACT / SAP SDX) | None (data exchange) |
| `sources/supplier-documents/` | Supplier documents | Documents from or about suppliers | Quotations, PCF data sheets, fine notice |
| `sources/public-benchmarks/` | Public benchmarks | **Real** published CO₂ factors per kg of material (IAI, worldsteel, ICA), input `source/public-benchmarks.json` | None |
| `sources/cockpit/` | Cockpit | Catalog with the benchmarks per product, thresholds, example decisions (not an external system) | None |

Other folders (16 Nov 2026):

- `runs/`: saved real agent runs (Gemini), written by the server and committed; the static preview replays them. They run on the fictitious data above.
- `test-set/hit-rate.json`: expected values and traps for the hit rate, built from `sources/` by `npm run hitrate:set`.
- `rules/` and `decisions/`: written by the running server (Rules page, Decision Log), not in Git.

Every JSON file says which system it simulates and carries the notice "Demo data, fictitious". The new PDFs (scorecards, data sheets, order PDFs) only repeat values of their records; nothing new is invented. A PCF data sheet exists for supplier-specific footprints that did not come through the PACT exchange. A scorecard without an assessment date uses the demo date 6 Nov 2026 (assumption, listed in `assumedFields`).

## Supplier names

On 6 Nov 2026 43 names in the Excel that played on real companies (e.g. a steel group, a chemicals group, logistics firms) were replaced with clearly invented ones, including their website and e-mail domains, so that no invented risk or controversy can be read as a claim about a real company. S-0005 was renamed too, because "Hengda" is the Chinese name of a real group. On 8 Nov 2026 the same 44 renames were applied to Excel v2. Only the text cells changed; formulas, dropdowns and all other values of the Excel are untouched.

On 18 Nov 2026 the supplier names were made neutral for an English-speaking audience, in two steps: first the German words in 44 names were translated into English; then every name that contained a city, region, river or country was replaced with an invented one (79 names, e.g. "Alucast Schwaben GmbH" → "Alucast Vertis GmbH", "Ningbo Silverline Die Casting Co., Ltd." → "Silverline Die Casting Co., Ltd."). The legal form stays, so the country of a supplier is still clear from its name and its address. The buyer "Rheintal Antriebe GmbH" became "Torvane Drive Systems GmbH". The same renames were applied 1:1 as text to the saved Gemini runs in `runs/`, so the replayed runs match the data; nothing else in those runs changed. Only text cells and cached formula results of the Excel changed.

## Excel v2 (team data model, 8 Nov 2026)

What is read from v2 and how (decisions in PLAN.md, section 9, "Team data model"):

- **Suppliers sheet:** all 100 suppliers for the ERP and the rating provider, now with VAT ID and ERP ID. Supplier S-0101 (an invented extra supplier of v1) is gone.
- **Offers, PCF and Sources sheets:** the aluminium demo case GH-200 (below). Each PCF record keeps its source (type, link, retrieval date, match, note).
- **CO₂ data quality, four levels** as in the data model: Verified · Supplier-specific · Company estimate · Industry average. v1's "actual" became "Supplier-specific", "estimated" became "Company estimate". Levels 3 and 4 get the warning "CO₂ estimated".
- **Categories sheet:** default weights per product. "Performance" is not one of our four criteria, so the other four are scaled to 100 (largest remainder). Aluminium: quality 22, price 34, CO₂ 22, delivery 22. The buyer can change them.
- **Assumptions sheet:** CO₂ price EUR 100/t.
- **Knock-outs K2 and K3** (LkSG risk "High" without SA8000; known child or forced labour) are applied by the decision engine from the verified rating record. K1 (lead time) stays a warning.
- **Not read:** the Info Requests sheet.

## Which value comes from where

### Die-cast aluminium gearbox housing GH-200 (P-ALU-HSG-01), from Excel v2

Demo request from v2: 2,000 pieces, needed by 18 Dec 2026. Prices, CO₂ values, badges and lead times come from the v2 sheets Offers and PCF; quality and delivery from the Suppliers sheet (ERP). Offers are valid 60 days from the quote date (assumption, v2 has no validity).

| ID | Supplier | Complaints | On time | Price/piece | CO₂/piece | Lead time | Note |
|---|---|---|---|---|---|---|---|
| S-0013 | Alucast Vertis | 0.8 % | 95 % | 84.50 | 38.0 kg Supplier-specific | 24 days | Existing supplier |
| S-0015 | Brightform Die Casting | 1.0 % | 97 % | 85.35 | 22.6 kg Verified | 27 days | Demo story: +1.0 % price, −41 % CO₂, verified |
| S-0018 | Alunova | missing | missing | 72.80 | 41.5 kg Company estimate (2024) | 32 days | Gaps; CO₂ data older than 365 days; LkSG "Medium" (warning) |
| S-0014 | Silverline Die Casting | missing | missing | 61.90 | 52.6 kg Industry average | 55 days | Knock-out K2: LkSG "High" without SA8000 |
| S-0020 | Phuc Thinh Lightmetal | missing | missing | 59.40 | 50.5 kg Industry average | 58 days | Knock-out K2: LkSG "High" without SA8000 |

The CO₂ reference date is the end of the reference year, but never after the day the source was retrieved (S-0014 and S-0020 have reference year 2026). Every record lists in `provenance.assumedFields` which fields are assumptions.

### Steel-cast gearbox housing (P-STL-HSG-01), added 6 Nov 2026

Price = Excel `price_index` × assumed base price 46.00 EUR ÷ 100. Estimated CO₂ = reference 25 kg × supplier intensity ÷ category average. Default quantity 5,000 pcs. Values as of Excel v2.

| ID | Supplier | Complaints | On time | Price/piece | CO₂/piece | Lead time | Note |
|---|---|---|---|---|---|---|---|
| S-0007 | Stavio Steel GmbH | 0.7 % | 98 % | 46.92 | 13.8 kg Supplier-specific | 10 days | Current supplier since the Q3 2026 switch |
| S-0001 | Mustermann Steel Castings GmbH | 0.5 % | 91 % | 48.30 | 24.6 kg Supplier-specific | 8 days | Former supplier of this part (until Q2 2026) |
| S-0008 | Novacier Europe S.A. | 1.3 % | 99 % | 46.92 | 24.7 kg Company estimate | 8 days | |
| S-0006 | Yıldızer Döküm A.Ş. | missing | missing | 42.78 | 38.1 kg Company estimate | 46 days | Cheapest; allegation (residents' complaint) as warning |
| S-0003 | Feralis Flat Steel GmbH | missing | missing | 46.92 indicative | 13.6 kg Company estimate | 13 days | Quote only, gaps |

### Enamelled copper magnet wire, 5 kg spool (P-CU-WIRE-01), added 6 Nov 2026

One "piece" is one 5 kg spool. Price = `price_index` × assumed base price 62.00 EUR ÷ 100. Estimated CO₂ = reference 20 kg × intensity ÷ category average. Default quantity 2,000 spools. Values as of Excel v2.

| ID | Supplier | Complaints | On time | Price/spool | CO₂/spool | Lead time | Note |
|---|---|---|---|---|---|---|---|
| S-0021 | Cuprion AG | 0.7 % | 95 % | 63.24 | 10.9 kg Supplier-specific | 15 days | Current supplier since the Q3 2026 switch |
| S-0022 | Elektrisolar Wire Works GmbH | 0.3 % | 88 % | 64.48 | 22.4 kg Supplier-specific | 7 days | Best quality, more CO₂ |
| S-0025 | Goldwire Copper Co., Ltd. | missing | missing | 48.36 | 34.9 kg Company estimate | 60 days | Knock-out K2: LkSG "High" without SA8000 |
| S-0024 | Muster Copper Works GmbH | 0.4 % | 96 % | 60.76 | 21.1 kg Company estimate | 11 days | Replaces S-0029, which has no price index or CO₂ intensity in v2 |
| S-0026 | MetalWire Polska Sp. z o.o. | missing | missing | 60.76 | 18.2 kg Company estimate | 17 days | |

The current supplier per part (`currentSupplierId` in `assumptions.json`) stands for the ERP source list; the Excel status "Active contract" alone does not say who supplies which part.

Documents: one offer PDF per supplier and part (`DOC-OFFER-<supplier>-<part>`) and the fine notice `DOC-FINE-S-0005` (S-0005 no longer has an aluminium offer; the notice stays for the sustainability page and the fine-notice knock-out).

## Purchase history (start page), added 6 Nov 2026

18 fictitious purchase orders, one per product and month for Q2 and Q3 2026 (`purchaseHistory` in `assumptions.json`). Quantities stay the same each month, so the change between the quarters comes only from the two supplier switches:

| Product | Q2 2026 (Apr–Jun) | Q3 2026 (Jul–Sep) | Per month |
|---|---|---|---|
| Aluminium gearbox housing GH-200 | S-0013, 38.0 kg | S-0013, 38.0 kg | 700 pcs |
| Steel-cast gearbox housing | S-0001, 24.6 kg, EUR 48.30 | S-0007, 13.8 kg, EUR 46.92 (cockpit decision DEC-2026-07-STL) | 1,500 pcs |
| Copper magnet wire spool | S-0023, 16.4 kg estimated, EUR 63.86 | S-0021, 10.9 kg, EUR 63.24 (cockpit decision DEC-2026-07-CU) | 650 spools |

Unit price = price index × base price of the part; CO₂ per piece = the supplier's PCF record (S-0023 got an estimated PCF record for the copper wire, without an offer). The statistics are computed in code (`shared/src/purchase-stats.ts`); the e2e test checks them against this hand calculation: Q2 222.5 t, Q3 163.2 t (−26.7 %), avoided 59.3 t CO₂e. With the v2 prices both switches also **save** money: steel −6,210 EUR, copper −1,209 EUR, together −7,419 EUR.

**Example decisions:** `exampleDecisions` in `assumptions.json` adds the two July decisions behind the switches (DEC-2026-07-STL, DEC-2026-07-CU) to the decision log. `src/example-decisions.ts` reads every value from the demo records and ranks the offers with the shared decision engine, so weights, ranking and evidence are consistent; it uses today's offer records, so the offer dates lie after the decision date. The copper example uses the weights quality 20, price 20, CO₂ 40, delivery 20, so that Thomas follows the recommendation with the v2 values.

**For the pitch:** this history is invented to show how the start page looks after one quarter of use. It is not a result of the prototype.

## Assumptions the team still has to confirm

All entries with `"toConfirm": true` in `assumptions.json`:

1. **Base prices** for steel (46.00 EUR) and copper (62.00 EUR) at price index 100; the base price 82.84 EUR for the aluminium purchase orders. The Excel only has a price index (100 = category average).
2. **Offer dates and validity** for steel and copper; aluminium offers valid 60 days from the v2 quote date.
3. **CO₂ per piece for steel and copper.** The Suppliers sheet has no PCF per piece, only CO₂ intensity per euro of revenue. Estimated values: reference value × supplier intensity ÷ category average intensity.
4. **S-0005:** fictitious fine notice of 12 Jun 2024 (CNY 200,000, final and binding).
5. **Price age limit 90 days** and **CO₂ data age limit 365 days** (open item 2 in PLAN.md). The CO₂ price EUR 100/t is decided (8 Nov 2026, as in v2).

The ERP and the rating provider hold **all 100 Excel suppliers** (suppliers page). Offers, PCF values and documents exist only for the demo suppliers.

Corrections (in `overrides`, all `toConfirm`):
- S-0046 and S-0085: `last_updated` lay in the future (10 Nov and 14 Dec 2026), set to 2025 (assumed year typo).
- S-0013, S-0034, S-0057, S-0064, S-0089: `data_source` said "Sustainability report" although `sustainability_report` is "No". Set to "Supplier self-assessment", so no report is claimed that does not exist.
- S-0005 keeps the contradiction as a test case for the agent.
