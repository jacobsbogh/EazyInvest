# PR 1 review — 2026-10-04

The owner authorized a self-review and merge. The review covered the full diff
against `main`, with particular attention to financial calculations, workspace
migrations, listing identity, quote/history separation, provider failures,
owner/writer isolation and rollout order. No unresolved merge-blocking findings
remain after the corrections below.

## Corrections

- **Scheduled imports before backend deployment.** The existing enabled schedule
  would run the new registry/quote job as soon as source merged, against the prior
  production rules. Scheduled runs now also require `MARKET_DATA_VERSION=2`.
  Set that variable only after deploying matching rules/indexes and verifying the
  manual import. Pages publication remains manual.
- **Throttling propagation.** An Alpha Vantage HTTP 429 was treated as a transient
  failure, and the optional Nasdaq-reference catch swallowed a quota error.
  Both now stop the run. The fallback regression test verifies one request, one
  credit reservation and no response parsing or retry after throttling.
- **Quote retrieval ordering.** Lexical datetime ordering can put `13:00:00Z`
  after `13:00:00.500Z`. Retrieval comparisons now use parsed timestamps; the
  regression verifies both response orders and preserves whole price/FX records.

## Verification and limits

Frontend/job builds and formatting pass. The complete suite comprises 135 unit
tests, 12 backend integration tests, 17 access-rule tests, 26 desktop/mobile demo
tests and 12 signed-in browser tests: **202 total**. CI runs the complete suite on
the final review commit before merge.

Independent fixtures cover DKK adjustment and deposit/rebalancing calculations,
gaps, comparable budgets, drawdown/recovery and old workspace migration. Emulator
tests cover owner persistence, stranger denial and market-writer isolation.
Signed-in browser tests monitor zero history reads on the dashboard/portfolio,
selected/comparison reads in Explore and explicit retries for missing histories.
The prior read-only public probes and actual ranges remain in
[fund expansion](FUND_EXPANSION.md), [Danish coverage](FREE_DANISH_DATA.md) and
[quote verification](DATA_PERFORMANCE.md).

The review does not activate production or simulate the owner's live account.
Live rules/index deployment, quote bootstrap, version-gate activation and Pages
publication remain separate release steps. Ordinary-account distribution tax and
unverified fund classifications remain guarded; no new tax model is claimed.
