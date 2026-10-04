# Architecture: Firebase Spark

GitHub Pages serves React, HashRouter and Recharts. Email/password sign-in identifies the dedicated owner account, created through the Firebase console. The app has no registration flow. The browser reads and saves a private Firestore workspace using a transaction. Demo mode uses separate localStorage.

A GitHub Actions job fetches ESMA Danish listing references, free Yahoo history and quotes, Nasdaq reported-trade samples and ECB FX. It writes the private market cache using a separate restricted Firebase email/password account. The workflow is `.github/workflows/market-data.yml`; its schedule requires `MARKET_SYNC_ENABLED=true` and `MARKET_DATA_VERSION=2` after backend deployment and import verification. There are no Cloud Functions, Cloud Run services, Cloud Scheduler jobs, Secret Manager resources, or billing requirements.

## Permissions

| Document                             | Owner               | Market writer                     | Everyone else |
| ------------------------------------ | ------------------- | --------------------------------- | ------------- |
| `config/access`                      | Denied              | Denied                            | Denied        |
| `users/{ownerUid}/workspace/current` | Get, create, update | Denied                            | Denied        |
| `market/{catalogId}`                 | Get                 | Get, create, update               | Denied        |
| `marketQuotes/{catalogId}`           | Get, bounded list   | Get, bounded list, create, update | Denied        |
| `instrumentRegistry/{id}`            | Get, bounded list   | Get/list/write                    | Denied        |
| `discoveryRequests/{hash}`           | Get, queue request  | Bounded list/update               | Denied        |
| `marketRequests/{id}`                | Get, queue request  | Bounded list/update               | Denied        |
| `marketSync/budget`                  | Denied              | Get/create/update                 | Denied        |
| Lists, deletes and other paths       | Denied              | Denied                            | Denied        |

The privileged Firebase console maintains `config/access`, containing `ownerUid` and optionally `marketWriterUid`. Use separate accounts. Missing configuration fails closed. No writer is needed until prices are connected.

## Workspace validation and concurrency

`src/lib/cloud.ts` validates the full workspace, including ledger chronology, overselling, duplicate IDs, real dates and a 750 KB serialized size limit. A Firestore transaction compares the expected revision and commits the next revision with the data. Stale saves fail rather than overwrite newer data.

Firestore rules independently enforce ownership, exact top-level fields, plan types/bounds, collection limits and sequential revisions. Rules do **not** perform complete per-entry ledger/strategy validation or recompute holdings. The owner could bypass the client using a custom client and corrupt their own data. Other users cannot access it; malformed loaded records fail validation. This is the explicit tradeoff for a single-owner Spark app.

Workspace version 3 adds custom listing definitions, up to ten strategies and a
nullable preferred strategy ID. Version 1/2 workspaces and JSON backups migrate in
memory; the next explicit save stores version 3. Allocations are unique, contain up
to five known investments and sum to 100%. Referenced discovered definitions are
included in the saved workspace so reload and backups retain their identity.

Cloud saves require connectivity and never fall back to demo storage. Firestore caches cloud data in memory only; Auth persists the login session. Sign-out clears application data. Demo records are never uploaded automatically.

## Market job

`jobs/src/danish-listings.ts` imports published ordinary-share reference records from the three Danish primary MICs. `jobs/src/yahoo.ts` validates symbol, venue, trading currency, type, timezone, daily dates and positive split/dividend-adjusted observations before selecting month endpoints. `jobs/src/nasdaq.ts` reads a bounded closing-session CSV sample and stores a separate exchange-trade reference bound to ISIN/MIC. `jobs/src/ecb.ts` converts EUR-base reference rates to DKK per currency. `jobs/src/refresh.ts` uses normal Firebase client APIs, so rules apply. It has no admin credential and cannot read the owner's portfolio, watchlist, ledger or allowlist. Alpha Vantage is an optional non-Danish fallback; Twelve Data is retained for cache compatibility.

Historical FX is stored with each observed close and validated as a reference date on or before that close, at most seven calendar days earlier. The current FX and quote stay separate. `shared/historical-series.ts` supplies native or DKK observations to comparisons, `shared/history-analysis.ts` and `shared/savings-simulation.ts`. The latter two use full selected-investment history independently of chart comparisons; rolling windows and monthly saving exclude the current partial UTC month. Legacy caches can omit historical FX and remain available for native-currency analysis.

It imports all mapped Danish listings and built-in references, prioritizes bounded owner queues, and skips valid histories younger than seven days. Catalogue reads use bounded 100-document pages. New/unmapped ISIN lookups rotate to avoid starvation. If the optional Alpha Vantage fallback is used, each attempt reserves its persistent free allowance transactionally. ECB is fetched once per run. GitHub concurrency serializes runs. Unsupported listings and failed instruments retain previous data; quota responses stop further history calls. See [the market-data runbook](MARKET_DATA.md).

The job requires two Actions secrets: `MARKET_SYNC_EMAIL` and `MARKET_SYNC_PASSWORD`; `ALPHA_VANTAGE_API_KEY` is optional. Only the sync step receives them. Raw provider exceptions, URLs and response bodies are not logged. Public listing metadata is bundled; downloaded prices and secrets are never committed as artifacts.

The Tuesday–Saturday schedule runs at 05:37 UTC only when `MARKET_SYNC_ENABLED=true` and `MARKET_DATA_VERSION=2`, after the previous trading day's close. Manual runs are available for bootstrap after backend deployment. GitHub may delay schedules or disable inactive public-repository schedules. The UI's refresh button reads the cache; it does not start a job or query the provider. History and current quotes remain separate so adjusted historical returns cannot replace current holdings prices.

## Code and verification

- `src/pages/`: eight screens; `src/lib/`: state, cloud adapters and import/export.
- `shared/`: deterministic calculations, tax snapshot, schemas and catalog.
- `jobs/`: provider adapter and GitHub Actions entry point.
- `firestore.rules`: ownership, data bounds, revisions and writer isolation.
- Tests cover calculations, parsing, real emulator transactions, rules, password sign-in and invalid credentials, desktop/mobile UI and Pages subpaths.

The deployment has configured authorized domains, the dedicated password owner's UID, and a Belgium Firestore database on Spark. See [release status](DEPLOYMENT.md) and [market-data status](MARKET_DATA.md). Free provider coverage is checked at ingestion; unsupported catalog listings remain missing. No trades, broker connections, analytics or in-app AI calls are implemented.

`shared/fund-catalog.ts` defines exact issuer-reviewed domestic fund and additional
UCITS listings; `shared/data/fund-facts.json` stores independently dated costs and
domestic tax classifications. `Fund` is distinct from the provider's security type:
Yahoo classifies the four Danish fund listings as `EQUITY`. Explicit provider
`MUTUALFUND` investment-company shares also participate in fee/tax checks. Exact
ISIN matching, current-year checks and conservative planner handoff guards prevent
unknown classifications from appearing as zero fees or ordinary share tax.

Initial cloud metadata loading merges previously discovered listings instead of
overwriting them. Bounded `marketQuotes` pages supply prices without full history
downloads. A session-scoped loader reads only selected Explore/strategy histories,
deduplicates overlapping requests, remembers missing caches and retries explicitly.
Late callbacks cannot repopulate signed-out state. Daily quote and weekly history
contracts/verification are documented in [the performance milestone](DATA_PERFORMANCE.md).
