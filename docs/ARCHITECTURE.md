# Architecture: Firebase Spark

GitHub Pages serves React, HashRouter and Recharts. Email/password sign-in identifies the dedicated owner account, created through the Firebase console. The app has no registration flow. The browser reads and saves a private Firestore workspace using a transaction. Demo mode uses separate localStorage.

A GitHub Actions job fetches free Alpha Vantage monthly adjusted history and current quotes, plus ECB reference FX, and writes the private market cache using a separate restricted Firebase email/password account. The workflow is `.github/workflows/market-data.yml`; its schedule requires `MARKET_SYNC_ENABLED=true`. There are no Cloud Functions, Cloud Run services, Cloud Scheduler jobs, Secret Manager resources, or billing requirements.

## Permissions

| Document                             | Owner               | Market writer       | Everyone else |
| ------------------------------------ | ------------------- | ------------------- | ------------- |
| `config/access`                      | Denied              | Denied              | Denied        |
| `users/{ownerUid}/workspace/current` | Get, create, update | Denied              | Denied        |
| `market/{catalogId}`                 | Get                 | Get, create, update | Denied        |
| Lists, deletes and other paths       | Denied              | Denied              | Denied        |

The privileged Firebase console maintains `config/access`, containing `ownerUid` and optionally `marketWriterUid`. Use separate accounts. Missing configuration fails closed. No writer is needed until prices are connected.

## Workspace validation and concurrency

`src/lib/cloud.ts` validates the full workspace, including ledger chronology, overselling, duplicate IDs, real dates and a 750 KB serialized size limit. A Firestore transaction compares the expected revision and commits the next revision with the data. Stale saves fail rather than overwrite newer data.

Firestore rules independently enforce ownership, exact top-level fields, plan types/bounds, collection limits and sequential revisions. Rules do **not** perform complete per-entry ledger validation or recompute holdings. The owner could bypass the client using a custom client and corrupt their own data. Other users cannot access it; malformed loaded records fail validation. This is the explicit tradeoff for a single-owner Spark app.

Cloud saves require connectivity and never fall back to demo storage. Firestore caches cloud data in memory only; Auth persists the login session. Sign-out clears application data. Demo records are never uploaded automatically.

## Market job

`jobs/src/alpha-vantage.ts` validates the exact listing metadata, dates, monthly uniqueness, positive finite raw/adjusted closes and the separate current quote. `jobs/src/ecb.ts` converts EUR-base reference rates to DKK per currency. `jobs/src/refresh.ts` uses normal Firebase client APIs, so rules apply. It has no admin credential and cannot read the owner's portfolio, watchlist, ledger or allowlist. The old Twelve Data parser remains for compatibility but is unused by the active workflow.

It checks all six catalog IDs, skips valid caches younger than 20 hours, and makes at most 18 provider requests/run with thirteen-second spacing. ECB is fetched once per run. GitHub concurrency serializes runs. Unsupported listings and failed instruments retain previous data; quota responses stop further requests. These are per-run limits, not a shared daily provider budget or a guarantee of free coverage. Manual reruns can consume additional credits for uncached instruments. See [the market-data runbook](MARKET_DATA.md).

The job receives three Actions secrets: `MARKET_SYNC_EMAIL`, `MARKET_SYNC_PASSWORD`, and `ALPHA_VANTAGE_API_KEY`. Only the sync step receives them. Raw provider exceptions, URLs and response bodies are not logged. No data or secrets are committed as artifacts.

The Tuesday–Saturday schedule runs at 05:37 UTC only when `MARKET_SYNC_ENABLED=true`, after the previous trading day's close. Manual runs are available. GitHub may delay schedules or disable inactive public-repository schedules. The UI's refresh button reads the cache; it does not start a job or query the provider. History and current quotes remain separate so adjusted historical returns cannot replace current holdings prices.

## Code and verification

- `src/pages/`: seven screens; `src/lib/`: state, cloud adapters and import/export.
- `shared/`: deterministic calculations, tax snapshot, schemas and catalog.
- `jobs/`: provider adapter and GitHub Actions entry point.
- `firestore.rules`: ownership, data bounds, revisions and writer isolation.
- Tests cover calculations, parsing, real emulator transactions, rules, password sign-in and invalid credentials, desktop/mobile UI and Pages subpaths.

The deployment has configured authorized domains, the dedicated password owner's UID, and a Belgium Firestore database on Spark. See [release status](DEPLOYMENT.md) and [market-data status](MARKET_DATA.md). Free provider coverage is checked at ingestion; unsupported catalog listings remain missing. No trades, broker connections, analytics or in-app AI calls are implemented.
