# Simulated source systems

The agent collects every value from these systems, one folder each. In a real installation they would be separate systems with their own owners and interfaces: the client's ERP, partners with sustainability data, and documents from suppliers. Here they are folders, generated from the team Excel.

| Folder | System | Agent tool |
|---|---|---|
| `client-erp/` | Client ERP | `get_erp_record` |
| `partner-ratings/` | Rating partner | `get_rating` |
| `partner-pcf-exchange/` | PCF exchange | `get_pcf` |
| `supplier-documents/` | Supplier documents | `list_documents`, `read_document` |
| `partner-risk-monitoring/` | Risk monitoring | none (shown in the dashboards) |
| `public-benchmarks/` | Real published industry averages for the CO₂ benchmark (not fictitious) | none |
| `cockpit/` | Configuration of the cockpit itself (catalog, benchmarks, thresholds, example decisions) | none |

Demo data, fictitious.
