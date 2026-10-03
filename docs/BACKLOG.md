# Prioritized backlog

## Connection and release stage (owner-led)

1. Finish Firebase Spark Google sign-in, private owner UID document, and Firestore rules deployment. Confirm a different authenticated account is denied. Do not upgrade billing.
2. Select the market provider plan and validate the six exact exchange listings, history coverage, FX availability, request limits, and personal-use licensing.
3. Set GitHub Pages build variables and add the authorized hostname in Firebase Auth. Repository and CI are connected; subpath browser tests are implemented.
4. Configure the desired scheduled development workflow, model, run budget, and review process. There is no existing schedule to modify.

## Highest-value product improvements

- Introduce a verified total-return dataset including dividends and consistent split/corporate-action adjustment. Until then, keep “price return” labels.
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

Dashboard; deterministic planner; ASK and share-income illustrations; catalog and comparisons; watchlist notes; validated DKK ledger; CSV and JSON backups; six lessons; responsive layouts; Spark Firestore transactions and revision rules; isolated market writer; GitHub Actions price updates; unit/rule/browser tests; CI and manual Pages publication.
