# Fund facts and Danish list provenance

Issuer fund facts are matched by share-class ISIN in `shared/data/fund-facts.json`.
All twelve fund classes were checked on 2026-10-04. Annual ongoing charges/TER
exclude broker dealing and currency conversion. Separate transaction estimates
and maximum entry/exit charges are stored for the four Danish funds. Fund expenses
already reflected in observed returns are not deducted again in simulations.

| ISIN         | Catalog | Annual charge | Primary source                                                                                                                                                                                                                               |
| ------------ | ------- | ------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| IE00BK5BQT80 | VWCE    | 0.14%         | [Vanguard share class](https://www.vanguard.co.uk/professional/product/etf/equity/9679/ftse-all-world-ucits) and [fee change effective 28 July 2026](https://www.ch.vanguard/en/private-investor/insights/lowering-fees-on-another-six-etfs) |
| IE00B4L5Y983 | EUNL    | 0.20%         | [iShares share-class facts](https://www.ishares.com/uk/individual/en/products/251882/ishares-msci-world-ucits-etf-acc-fund)                                                                                                                  |
| IE00BKM4GZ66 | IS3N    | 0.18%         | [iShares share-class facts](https://www.ishares.com/uk/individual/en/products/264659/ishares-msci-emerging-markets-imi-ucits-etf)                                                                                                            |
| IE00B5BMR087 | SXR8    | 0.07%         | [iShares share-class facts](https://www.ishares.com/ch/individual/en/products/253743/ishares-sp-500-b-ucits-etf-acc-fund)                                                                                                                    |

Eight additional classes, separate cost components and their primary sources are
documented in [the fund expansion](FUND_EXPANSION.md).

Source pages may display another trading ticker for the same ISIN. Listing currency
and exchange remain separate. Weighted strategy costs sum allocation times annual
ongoing charges/TER; an unknown fund cost makes the aggregate unknown. Ordinary
direct company shares contribute no fund charge, which does not imply free holding.
Investment-company shares explicitly classified as funds by the provider keep
unknown costs/tax facts and participate in checks. Users
can carry these charges into the future planner; return assumptions stay explicit.

## Reviewed 2026 SKAT snapshot

[SKAT's official publication page](https://skat.dk/erhverv/ekapital/vaerdipapirer/beviser-og-aktier-i-investeringsforeninger-og-selskaber-ifpa)
links the [workbook published on 28 September 2026](https://skat.dk/media/fo5m24x5/september-2026-abis-liste-2021-2026.xlsx).
The approved `shared/data/skat-2026.json` records its source URL, publication date,
review date, workbook SHA-256, row counts and ISIN membership. It contains no price
data or company contact information.

The importer resolves the sheet named **2026** through workbook relationships and
checks the ISIN/registered/deregistered column headings. An exact ISIN qualifies
only when 2026 appears in registered years and not in deregistered years. Duplicates
are collapsed; non-ISIN rows are counted and skipped. Conflicting registrations
stay unknown, even when another row appears positive.

Review found 5,343 unique listed ISINs across 5,441 source rows, with 37 non-ISIN
rows skipped. `IE000QWO5FT3` has conflicting registration years and is explicitly
unknown. EUNL, IS3N, SXR8, SPYI, SPPW, EUNK and IUSN have exact matches. VWCE's ISIN was not found.
Absence does not establish another tax classification or ASK eligibility. Future
tax years without a reviewed snapshot are unknown. Ordinary direct company shares
are outside this investment-company-list check; provider-classified investment
companies remain subject to fund checks.

[SKAT's fund taxation guidance](https://skat.dk/borger/aktier-og-andre-vaerdipapirer/skat-af-investeringsbeviser-udstedt-af-investeringsforeninger-og-investeringsselskaber)
describes annual taxation for investment companies. Exact issuer evidence records
2026 realisation/distribution share-income treatment for the four domestic funds
independently of list membership. Strategy handoff blocks tax-on-sale illustrations
for positive-list funds, unknown ordinary-account classifications, and ordinary-account
illustrations for distributing funds because distribution taxation is not modelled.
Before-tax planning and the separate existing ASK illustration remain available;
ASK eligibility and broker availability are not established by these facts. Historical backtests
stay before personal tax; projections use the existing account illustrations and
frozen 2026 parameters.

## Updating the list

Download the official XLSX into an ignored local file. Generate a candidate with
Node 22+, without additional dependencies:

```sh
node scripts/import-skat.mjs .cache/skat-official.xlsx 2026 https://skat.dk/media/fo5m24x5/september-2026-abis-liste-2021-2026.xlsx 2026-09-28
```

The importer only writes `.cache/skat-2026-candidate.json`. Review the correct year,
source hash, changed membership, conflicts and relevant catalog ISINs. After review,
set `reviewedAt` and copy the approved candidate to `shared/data/skat-2026.json`.
For a new year, update the import in `shared/fund-facts.ts`. Run tests before release.
No background task silently approves tax-list updates.
