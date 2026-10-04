# Prioritized backlog

## Release follow-up (owner-led)

1. Confirm the owner's direct sign-in/save/reload/sign-out check on the [published first release](https://jacobsbogh.github.io/EazyInvest/). Dedicated email/password sign-in, Belgium Firestore on Spark, owner UID configuration, rules and Pages publication are complete. Automated emulator tests cover owner persistence and unrelated-account denial; see [release status](DEPLOYMENT.md). Do not upgrade billing.
2. Free historical data is connected and verified for VWCE, EUNL, IS3N, SXR8 and MSFT; see [the market-data runbook](MARKET_DATA.md). Monthly adjusted history, separate current quotes, ECB FX, a restricted writer and 20-year/full-history views are published. Find another free source for Novo B's exact Danish DKK listing; do not substitute a different venue, share class or ADR. Observe the first scheduled update.
3. Keep GitHub Pages build variables and the authorized hostname in Firebase Auth current. Repository and CI are connected; publication is manual and subpath browser tests are implemented.
4. Configure the desired scheduled development workflow, model, run budget, and review process. There is no existing schedule to modify.

## Highest-value product improvements

- Extend historical analysis with annualized returns and rolling holding-period results, with independently calculated test fixtures. Do not infer future probabilities from past results.
- Add historical DKK returns using dated FX observations; current reference FX is used only for present holdings valuation.
- Research separately labelled market benchmarks for periods predating the catalog ETFs. Never extend a fund's history with another investment's data.
- Add a year-versioned importer for the official SKAT equity-investment-company list with exact ISIN matching, provenance, a review step, and a status for missing/unverified data. Membership is not a recommendation.
- Add transaction editing with the same complete-ledger validation as import and deletion, plus an audit trail.
- Add dated portfolio snapshots and clearly distinguish deposits/withdrawals from performance. Define the cash-account model before implementing time-weighted or money-weighted returns.
- Support additional broker CSV formats only with representative sanitized fixtures and explicit mappings.
- Add verified fund costs, geographic/sector exposure, and holdings overlap from issuer/provider sources with update timestamps.

## Longer-term research

- Test a stochastic scenario engine against a written distribution and correlation model before displaying probabilities. Include sensitivity and model limitations.
- Add pension account models only after documenting their contribution/withdrawal rules and tax treatment. Current app is personal taxable/ASK investing.
- Add account-specific tax-loss pools and foreign withholding reconciliation if accurate inputs can be obtained. Do not present the current illustration as a tax filing service.
- Broader catalog search, additional data providers, offline read-only snapshots, and Danish-language copy.

## Implemented in the initial build

Dashboard; deterministic planner; ASK and share-income illustrations; catalog and comparisons; watchlist notes; validated DKK ledger; CSV and JSON backups; six lessons; responsive layouts; email/password sign-in; Spark Firestore transactions and revision rules; isolated market-writer implementation; optional GitHub Actions price-update template; unit/rule/browser tests; CI and manual Pages publication.
