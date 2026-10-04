# Market loading and quote freshness

The next milestone separates current pricing from historical research:

1. Add a validated lightweight quote cache with exact listing identity, raw price,
   observation/retrieval dates and dated DKK conversion. Preserve historical caches.
2. Load quote pages and listing metadata after sign-in. Fetch only histories used
   by Explore or strategy comparisons, deduplicate concurrent reads and isolate
   late results across sign-out. Show loading, missing and retry states separately.
3. Refresh quotes each scheduled trading-day run using bounded Yahoo charts. Reuse
   seven-day full histories without changing their retrieval date. Keep previous
   valid data on failure and stop on provider throttling.
4. Verify quote-only portfolio valuation, unchanged adjusted historical returns,
   writer isolation, on-demand reads, comparison loading, failures and sign-out.

All four steps are complete on the review branch. The app reads paginated
`marketQuotes` records after sign-in and reads no full histories on the dashboard
or portfolio. Explore loads its selection/comparisons; Strategies loads only the
draft and selected alternative allocations. Reads are deduplicated within a login
session, with explicit retries for missing/failed caches. Sign-out clears data and
invalidates late callbacks. Demo histories remain generated local examples.

## Data contracts and update policy

`shared/quote.ts` validates raw price, exact provider symbol, trading currency,
observation/retrieval dates and dated DKK conversion. Price and FX are selected as
one record, so a new quote cannot accidentally use another quote's exchange rate.
Quote pages contain no historical observations. Invalid/mismatched quote rows are
excluded independently, while valid rows remain readable.

The job bootstraps lightweight quotes from valid existing histories, then checks
current Yahoo chart metadata with a five-day daily chart. Full Yahoo history
downloads already contain a raw quote, avoiding a second provider request on
those runs. Daily quote retrieval never changes a historical cache's `fetchedAt`
or inserts raw quotes into adjusted return observations. Same-day quote checks
are reused, while seven-day history checks remain independent.

Provider/network failures retain each previous valid cache independently; a failed
historical download can still receive a new quote, and a failed quote download
does not destroy history. Known Nasdaq invalidations remain effective even when
history retrieval fails. Older provider observations cannot overwrite newer quotes.
HTTP 429 stops the run without retries, alternate hosts, credentials or proxies.
Quotes over three calendar days old by observation or retrieval are labelled stale;
illiquid shares keep their actual last-trade date when checked again.

## Source verification and activation

Verification passed: 134 unit tests, 12 backend integration tests, 17 security-rule
tests, 26 desktop/mobile demo browser tests and 12 signed-in browser tests (201
total). The signed-in tests monitor Firestore requests: dashboard and portfolio
read zero histories, Explore reads only selected/comparison histories, and changing
analysis controls reuses loaded data. Missing history remains retryable explicitly.

A read-only probe on 2026-10-04 validated bounded quotes for all eight added funds,
Novo B, Microsoft and the EUR Copenhagen Ress Life listing: **11/11 passed**, with
actual quote dates 2026-10-02. The ignored metadata-only result is
`.cache/current-quote-verification.json`; no downloaded prices are committed.

Implementation and production activation are separate. Matching rules, quote-cache
bootstrap, import and Pages publication must be completed before release. Firebase
remains on Spark; provider requests run only in the restricted market job.

Bootstrap `marketQuotes` before publishing the new app, including quotes needed
for existing holdings/watchlists. The app intentionally does not download all
legacy histories to reconstruct the price table. Legacy histories remain readable
when opened and supply fallback pricing until their independent quote is available.
