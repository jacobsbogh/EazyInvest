# Holdings and contributions review — 2026-10-04

Reviewed the source data, parsers, exposure model, monthly cash calculations,
screen connections and exports against the previously released `main`.

Issuer facts match exact fund share classes. Only portfolio `holdings.all` enters
iShares inventories; securities-lending collateral, cash and unidentified rows are
excluded. Duplicate ISINs aggregate. Source failures, malformed dates/fields,
response identity/date mismatches and excessive weights stop the updater before
source replacements. The Sparindex/Vanguard name-only inventories use explicitly
reviewed subsets; unresolved weight remains visible. Actual issuer reporting dates
remain separate from verification dates. Public snapshots contain no prices or
private holdings and load separately by selected fund.

Overlap uses matching securities and a conservative unresolved-weight bound.
Different share classes/ADRs never collapse into a company-name match. Strategy
exposure follows saved target weights. Direct-stock identity resolution requires
an existing catalog ISIN or a unique ticker/venue record with source provenance.
Country/sector classifications remain issuer facts and are not currency exposure.

Real order sizing requires a valid exact-listing raw quote and that quote's dated
FX, with stale/future records blocked. Cash arithmetic uses integer øre and rejects
sub-øre inputs. Each order fits its apportioned budget after commission/conversion
reserves; zero purchases have zero order costs. Underweight contributions propose
no sales and stop when existing strategy holdings lack valid prices. Outside
positions are disclosed and excluded. Account deposit room and eligibility are
explicitly outside the worksheet. The fixed-price rehearsal models no future
return. Saving changes only the monthly strategy budget; exports include all
exploratory assumptions and protect text against spreadsheet formula execution.

Desktop/mobile journeys cover dated real holdings, a direct-share overlap,
partial and unavailable sources, saved strategy exposure, affordable unit orders,
CSV cash conservation, monthly rehearsal, saved-budget reload and unchanged
transaction counts. Axe audits and actual card bounds cover both new screens.
The tables scroll within labelled keyboard-accessible regions. Visual review
checks mobile and desktop renders; no additional initial holdings download occurs.

Local validation passes: frontend/job builds, 171 unit tests, all 34 demo browser
tests and formatting. Before merge, require CI's additional 12 backend integration,
17 rules and 12 signed-in browser tests (246 tests total). Publication
follows the reviewed merge and receives public desktop/mobile verification.
No remaining merge-blocking finding; broader holdings coverage and a full cash
account/portfolio-performance model remain separate follow-up work.
