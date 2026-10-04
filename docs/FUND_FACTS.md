# Fund facts and Danish list provenance

Issuer fund costs are matched by share-class ISIN. All were checked on 2026-10-04.
They exclude broker dealing and currency conversion, are already reflected in
observed fund returns, and are not deducted again in historical simulations.

| ISIN         | Catalog | Annual charge | Primary source                                                                                                                                                                                                                               |
| ------------ | ------- | ------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| IE00BK5BQT80 | VWCE    | 0.14%         | [Vanguard share class](https://www.vanguard.co.uk/professional/product/etf/equity/9679/ftse-all-world-ucits) and [fee change effective 28 July 2026](https://www.ch.vanguard/en/private-investor/insights/lowering-fees-on-another-six-etfs) |
| IE00B4L5Y983 | EUNL    | 0.20%         | [iShares share-class facts](https://www.ishares.com/uk/individual/en/products/251882/ishares-msci-world-ucits-etf-acc-fund)                                                                                                                  |
| IE00BKM4GZ66 | IS3N    | 0.18%         | [iShares share-class facts](https://www.ishares.com/uk/individual/en/products/264659/ishares-msci-emerging-markets-imi-ucits-etf)                                                                                                            |
| IE00B5BMR087 | SXR8    | 0.07%         | [iShares share-class facts](https://www.ishares.com/ch/individual/en/products/253743/ishares-sp-500-b-ucits-etf-acc-fund)                                                                                                                    |

Source pages may display another trading ticker for the same ISIN. Listing currency
and exchange remain separate. Weighted strategy costs sum allocation times annual
fund charges; an unknown ETF cost makes the aggregate unknown. Individual stocks
contribute no fund charge, which does not imply that holding them is free. Users
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
unknown. EUNL, IS3N and SXR8 have exact matches. VWCE's ISIN was not found.
Absence does not establish another tax classification or ASK eligibility. Future
tax years without a reviewed snapshot are unknown. Individual shares are outside
this investment-company-list check.

[SKAT's fund taxation guidance](https://skat.dk/borger/aktier-og-andre-vaerdipapirer/skat-af-investeringsbeviser-udstedt-af-investeringsforeninger-og-investeringsselskaber)
describes annual taxation for investment companies. Strategy handoff blocks the
tax-on-sale illustration for funds with positive list matches. Historical backtests
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
