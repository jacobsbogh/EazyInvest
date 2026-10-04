# Holdings and monthly contributions milestone

## Plan

1. Review free issuer holdings sources against exact fund ISINs and preserve their
   actual reporting dates. Import security weights and geographic/sector metadata
   only; no market prices, personal data or credentials enter published snapshots.
2. Implement exact-security overlap and weighted strategy exposure. Show matched
   weight, unresolved weight and dated source coverage. Incomplete holdings produce
   a lower bound, never an exact zero-overlap or full-diversification claim.
3. Turn saved strategy weights and monthly budgets into a manual contribution
   worksheet using dated quotes/FX, whole or fractional units, user-entered broker
   and conversion charges, and retained cash. Optionally direct contributions
   towards underweight investments without proposing sales.
4. Verify independent overlap and cash-conservation fixtures, unknown/stale data,
   accessible desktop/mobile journeys, self-review, CI, merge and Pages publication.

## Boundaries

Overlap matches securities by verified ISIN. Different share classes and ADRs are
not merged into an assumed company identity. Country/sector classifications are
issuer labels, not trading-currency exposure. Partial issuer tables and missing
facts remain explicit. Snapshot dates may differ; the app does not imply a common
or live holdings date. Other investments remain researchable with unavailable
exposure data until an issuer source is verified.

Monthly planning uses one saved strategy's allocation and budget. Its optional
recorded holdings comprise only positions belonging to that strategy; cash in the
ledger is not inferred. The user enters available cash separately. Broker costs
are assumptions, not claims about a broker tariff or account eligibility. Plans
cannot execute trades and do not write hypothetical transactions to the ledger.

## Reviewed coverage — 2026-10-04

All snapshots contain security weights and issuer country/sector labels, with no
prices, market values, units held or private records. They load separately by fund.
The initial app bundle does not download all holdings. Reporting dates are source
facts; verification dates never replace them.

| Exact share class                          | Issuer date | Identified securities | Identified weight | Method                |
| ------------------------------------------ | ----------- | --------------------: | ----------------: | --------------------- |
| EUNL · IE00B4L5Y983                        | 2026-10-02  |                 1,248 |         99.64377% | Issuer ISIN inventory |
| IS3N · IE00BKM4GZ66                        | 2026-10-02  |                 2,888 |         99.46619% | Issuer ISIN inventory |
| SXR8 · IE00B5BMR087                        | 2026-10-02  |                   504 |         99.79370% | Issuer ISIN inventory |
| EUNK · IE00B4K48X80                        | 2026-10-02  |                   384 |         99.44752% | Issuer ISIN inventory |
| IUSN · IE00BF4RFH31                        | 2026-10-02  |                 3,568 |         99.47967% | Issuer ISIN inventory |
| Sparindex Globale Aktier KL · DK0060747822 | 2026-07-31  |                     6 |            16.85% | Reviewed subset       |
| VWCE · IE00BK5BQT80                        | 2026-08-31  |                     6 |         17.58065% | Reviewed subset       |

Primary issuer pages: [EUNL](https://www.ishares.com/uk/individual/en/products/251882/ishares-msci-world-ucits-etf-acc-fund),
[IS3N](https://www.ishares.com/uk/individual/en/products/264659/ishares-msci-emerging-markets-imi-ucits-etf),
[SXR8](https://www.ishares.com/uk/individual/en/products/253743/ishares-sp-500-b-ucits-etf-acc-fund),
[EUNK](https://www.ishares.com/uk/individual/en/products/251861/ishares-msci-europe-ucits-etf-acc-fund),
[IUSN](https://www.ishares.com/uk/individual/en/products/296576/ishares-msci-world-small-cap-ucits-etf-usd-acc-fund),
[Sparindex](https://www.sparindex.dk/vores-fonde/index-globale-aktier-kl/) and
[Vanguard](https://www.vanguard.co.uk/professional/product/etf/equity/9679/ftse-all-world-ucits).
Each JSON snapshot records its own source. The five iShares snapshots also retain
the actual public `holdings.all` download URL observed in the issuer's browser
requests. Securities-lending collateral is a different component and is excluded.

Positive equity rows with issuer ISINs are retained; duplicate ISIN rows are
aggregated. Cash, derivatives, unidentified securities and nonpositive weights do
not become fabricated equity holdings. A minor rounding excess above 100% can be
scaled proportionally with an explicit flag; totals above 100.5% fail. The current
snapshots require no scaling.

Sparindex and Vanguard tables lack individual-security ISINs. Only six reviewed,
unambiguous US common-share names are mapped: NVIDIA, Apple, Microsoft, Amazon,
Broadcom and Meta. Their identities refer to exact ticker/exchange records in the
iShares inventory, while weights, countries and sector labels remain each fund's
own issuer facts. Alphabet classes, TSMC/ADR ambiguity and other unresolved names
are excluded. The other 83.15%/82.41935% remains unresolved, not zero overlap.
Funds without a reviewed snapshot have 100% unresolved weight.

## Refreshing holdings

```sh
npm run update:holdings
npm run check
```

The updater verifies all six configured issuer responses before replacing files:
five iShares inventories and the reviewed Sparindex subset. It checks the exact
fund ISIN on the source page, product ID, inventory component, response date,
column/field validity and coverage. Requests have timeouts and stop without retry
on provider failures. Review the generated diff and source dates before merging
and publishing. VWCE is intentionally a manual reviewed subset and is not updated
by this command. Verify its exact accumulating share class and table reporting
date again before changing its snapshot.

There is no unattended holdings schedule. Updating public snapshots requires a
reviewed app release and no Firebase credentials. Daily quotes remain in the
private market cache. The source cards flag inventories older than 45 days.
These are dated fund compositions, not reconstructed historical holdings.

## Calculation and workflow contract

Overlap sums `min(A security weight, B security weight)` over identical ISINs.
Its conservative range ends at `min(100%, observed + unresolved A + unresolved B)`.
Strategy exposure multiplies each security weight by its saved target allocation;
it does not substitute recorded-position weights. Country aliases cover explicit
issuer labels only; sector labels retain issuer taxonomy names. Missing metadata
is shown as unclassified. Direct shares can use a catalog ISIN or a unique exact
ticker/venue match, with the identity source retained.

Monthly worksheets use current raw quotes and their own dated FX records. Invalid,
future, stale or listing-mismatched real quotes cannot produce unit orders. The
three-calendar-day allowance covers normal weekends. Demo examples are explicitly
labelled. An unpriced target allocation stays cash; an unpriced existing position
blocks underweight calculations. Refresh reads the existing saved market cache.

Cash budgets and minimum commission accept only two decimals. Allocation splits
use integer øre with deterministic largest-remainder rounding. Unit sizing reserves
notional, percentage/minimum commission and separate non-DKK FX charges before
selecting affordable whole or six-decimal fractional units. Reserves round upward.
Commission is the larger of the minimum and percentage amount. No purchase means
no commission. Underweight mode uses positive value gaps after adding available
cash and proposes no sales. After weights exclude cash. Other portfolio positions
are disclosed and excluded from the strategy calculation.

An optional 1–12 month rehearsal carries remaining cash and planned units while
keeping quotes/FX fixed. It is not a forecast and writes no transactions. CSV
exports include initial settings, source/date/FX records, order sizing, costs and
cash balances. Only the strategy's monthly budget may be saved; exploratory cash,
fee and unit settings reset when the screen is reopened. Account deposit room,
ASK limits, investment eligibility, spread, market movement, personal tax and fund
entry/exit/ongoing charges are outside this execution worksheet.
