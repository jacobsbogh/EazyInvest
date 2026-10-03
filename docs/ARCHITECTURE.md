# Architecture: Firebase Spark

GitHub Pages serves React, HashRouter and Recharts. Google sign-in identifies the owner. The browser reads and saves a private Firestore workspace using a transaction. Demo mode uses separate localStorage.

A separate GitHub Actions job fetches Twelve Data prices and writes the private market cache using a restricted Firebase email/password account. There are no Cloud Functions, Cloud Run services, Cloud Scheduler jobs, Secret Manager resources, or billing requirements.

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

`jobs/src/provider.ts` validates symbols, currencies, dates, positive finite prices and duplicate dates. `jobs/src/refresh.ts` uses normal Firebase client APIs, so rules apply. It has no admin credential and cannot read the owner's portfolio, watchlist, ledger or allowlist.

It checks all six catalog IDs, skips valid caches younger than 24 hours, and makes at most 12 requests/run with eight-second spacing. GitHub concurrency serializes runs. Failed instruments retain previous data. These are per-run limits, not a shared daily provider budget or a guarantee of free coverage. Manual reruns can consume additional credits for uncached instruments.

The job receives three Actions secrets: `MARKET_SYNC_EMAIL`, `MARKET_SYNC_PASSWORD`, and `TWELVE_DATA_API_KEY`. Only the sync step receives them. Raw provider exceptions, URLs and response bodies are not logged. No data or secrets are committed as artifacts.

The weekday schedule runs at 21:37 UTC only when `MARKET_SYNC_ENABLED=true`. Manual runs are available. GitHub may delay schedules or disable inactive public-repository schedules. The UI's refresh button reads the cache; it does not start a job or query the provider.

## Code and verification

- `src/pages/`: seven screens; `src/lib/`: state, cloud adapters and import/export.
- `shared/`: deterministic calculations, tax snapshot, schemas and catalog.
- `jobs/`: provider adapter and GitHub Actions entry point.
- `firestore.rules`: ownership, data bounds, revisions and writer isolation.
- Tests cover calculations, parsing, real emulator transactions, rules, Google emulator popup, desktop/mobile UI and Pages subpaths.

Production authorized domains, owner UID, provider coverage/licensing and published sign-in still need verification during setup. No trades, broker connections, analytics or in-app AI calls are implemented.
