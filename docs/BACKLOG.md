# Prioritized backlog

## Release follow-up (owner-led)

1. Confirm the owner's direct sign-in/save/reload/sign-out check on the [published first release](https://jacobsbogh.github.io/EazyInvest/). Dedicated email/password sign-in, Belgium Firestore on Spark, owner UID configuration, rules and Pages publication are complete. Automated emulator tests cover owner persistence and unrelated-account denial; see [release status](DEPLOYMENT.md). Do not upgrade billing.
2. The broader free-data release is active: 178 validated quotes, twelve fund histories and Novo B verified, with daily quotes and weekly history caching. Observe the first subsequent scheduled update after the successful manual run. See [production verification](PRODUCTION_RELEASE.md) and [the market-data runbook](MARKET_DATA.md).
3. Keep GitHub Pages build variables and the authorized hostname in Firebase Auth current. Repository and CI are connected; publication is manual and subpath browser tests are implemented.
4. Configure the desired scheduled development workflow, model, run budget, and review process. There is no existing schedule to modify.

## Highest-value product improvements

- Research separately labelled market benchmarks for periods predating the catalog ETFs. Never extend a fund's history with another investment's data.
- Maintain issuer-cost checks and reviewed SKAT snapshots for new years/listings; see [fund-fact provenance](FUND_FACTS.md). Add a capital-income projection only after documenting its assumptions and inputs.
- Connect the fund comparison to saved choices after defining how scenario assumptions should persist. Preserve the general planner's distribution-tax handoff guards until it adopts the verified cash-flow model.
- Add transaction editing with the same complete-ledger validation as import and deletion, plus an audit trail.
- Add dated portfolio snapshots and clearly distinguish deposits/withdrawals from performance. Define the cash-account model before implementing time-weighted or money-weighted returns.
- Support additional broker CSV formats only with representative sanitized fixtures and explicit mappings.
- Add verified geographic/sector exposure and holdings overlap from issuer/provider sources with update timestamps.
- Turn a saved strategy into a monthly contribution allocation, with fractional/whole-unit assumptions and explicit trading costs; execution remains manual.

## Longer-term research

- Test a stochastic scenario engine against a written distribution and correlation model before displaying probabilities. Include sensitivity and model limitations.
- Add pension account models only after documenting their contribution/withdrawal rules and tax treatment. Current app is personal taxable/ASK investing.
- Add account-specific tax-loss pools and foreign withholding reconciliation if accurate inputs can be obtained. Do not present the current illustration as a tax filing service.
- Additional free data providers, offline read-only snapshots, and Danish-language copy.

## Implemented in the initial build

Dashboard; deterministic planner; ASK and share-income illustrations; catalog and comparisons; watchlist notes; validated DKK ledger; CSV and JSON backups; six lessons; responsive layouts; email/password sign-in; Spark Firestore transactions and revision rules; isolated market-writer implementation; optional GitHub Actions price-update template; unit/rule/browser tests; CI and manual Pages publication.

Historical analysis extensions: dated ECB FX and DKK/trading-currency views; full-history annualized and calendar-year returns; completed rolling 5/10/20-year holding periods; historical monthly saving with separate contributions and gains. Independent numerical fixtures and combined currency/UI tests cover the calculations.

Strategy milestone: 25 starting listing definitions; queued free-market discovery
and requested histories with a persistent daily budget; saved multi-investment
allocations, notes and preferred choice; matching-budget DKK backtests with annual
rebalancing, cash baseline and deposit-adjusted drawdown/recovery; dashboard and
planner connections; issuer charges and an exact-ISIN reviewed 2026 SKAT snapshot.
See [implementation and verification](STRATEGY_MILESTONE.md).

Catalog expansion: 146 regulator-referenced Danish ordinary shares, four Danish
index funds and eight total UCITS ETFs; exact provider listings and dated cost/tax
evidence; separate fund-cost components; conservative unknown investment-company
facts and Nasdaq cancellation handling. See [fund expansion](FUND_EXPANSION.md).

Performance/freshness: paginated lightweight quotes for dashboard/portfolio,
session-scoped on-demand Explore/strategy histories, independent daily raw quotes
and weekly adjusted history, explicit retries and stale observation dates.
Production activation is complete; see [verification/activation](DATA_PERFORMANCE.md).

Fund comparison: equal-budget alternatives, dated issuer charges, user-entered
distribution assumptions, reinvestment/cash, ordinary/ASK/before-tax accounts,
average acquisition cost, shared progressive bands, annual losses and ASK room,
year-by-year hypothetical sale values and assumption-inclusive CSV export. See
[model and verification](FUND_COMPARISON.md).
