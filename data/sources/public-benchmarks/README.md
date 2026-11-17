# Public benchmarks

**Real, published data, not fictitious.** Industry averages per kg of material from official sources. They describe materials, not companies. The cockpit multiplies them by the material per piece to get an industry CO₂ average per piece (material only, no processing), shown as context next to the result; it does not count towards the score (17 Nov 2026). Input: `data/source/public-benchmarks.json`, checked on the date given per factor.

| Factor | Value | Year | Source |
|---|---|---|---|
| Aluminium | 10.04 kg CO₂e per kg | 2023 | [International Aluminium Institute (IAI)](https://international-aluminium.org/global-aluminium-industry-greenhouse-gas-emissions-intensity-reduction-continues-with-total-emissions-below-2020-peak) |
| Steel | 1.92 kg CO₂ per kg | 2023 | [World Steel Association (worldsteel)](https://worldsteel.org/wp-content/uploads/World-Steel-in-Figures-2025.pdf) |
| Copper | 3.52 kg CO₂e per kg | 2023 | [International Copper Association (ICA)](https://internationalcopper.org/wp-content/uploads/2026/10/ICA-LCA-Global-Summary-2026.pdf) |
| EPDM elastomer | 4.17 kg CO₂e per kg | 2018 | [OEKOBAUDAT (German Federal Ministry for Housing)](https://www.climatiq.io/data/emission-factor/45b55d35-515d-4e85-bf3e-dca3f2c041c2) |

The score measures every criterion against today, i.e. the current supplier (price we pay today, its ERP figures and product footprint; category average as fallback). See `cockpit/settings.json`, fields `benchmarks` (reference values) and `industryCo2` (context) per part.
