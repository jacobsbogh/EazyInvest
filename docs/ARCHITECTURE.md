# Architecture and boundaries

```text
GitHub Pages / Vite development server
  React + HashRouter + Recharts
    ├─ demo workspace → validated localStorage (eazyinvest.demo.v1)
    └─ owner sign-in → Firebase Authentication (Google)
         ├─ Firestore GET → users/{uid}/workspace/current
         ├─ Firestore GET → market/{catalogId}
         ├─ callable saveWorkspace → validation + revision transaction
         └─ callable getMarketSeries → cache → quota → provider + FX

Weekday scheduler (disabled by default)
  → owner’s watchlist and ledger → same market-data loader
```

## Files

- `src/pages/`: seven user-facing screens.
- `src/components/`: chart and UI primitives.
- `src/lib/store.tsx`: session state, persistence, notifications, market cache.
- `src/lib/firebase.ts`: client initialization and callable adapters.
- `src/lib/demo.ts`: clearly synthetic example data and empty defaults.
- `src/lib/csv.ts`: CSV contract and validation.
- `shared/`: schemas, tax constants, instrument catalog and deterministic finance logic. Imported by frontend, backend and tests.
- `functions/src/`: cloud callable endpoints, scheduled refresh, provider validation.
- `firestore.rules`: owner-only document reads; all direct writes denied.

Functions compile the shared code into `functions/lib/shared` and their handlers into `functions/lib/functions/src`. The function package entry is the compiled index. No frontend source, local storage, or browser Firebase API key can grant administrative access.

## Documents

| Path                            | Contents                                                    | Client access              |
| ------------------------------- | ----------------------------------------------------------- | -------------------------- |
| `config/access`                 | `ownerUid` set through privileged administration            | None                       |
| `users/{uid}/workspace/current` | `{ revision, data }`                                        | Owner GET only for own UID |
| `market/{catalogId}`            | Validated series, currency, FX, observation/retrieval dates | Owner GET only             |
| `internal/providerQuota`        | Per-minute and per-day counters                             | None                       |
| `internal/lease-{catalogId}`    | Expiring lease + random token                               | None                       |

The Admin SDK bypasses Firestore rules, so **every user-invoked function independently checks authentication and matches the owner UID from `config/access`**. The client cannot edit this document. If it is absent or invalid, access fails closed. The scheduler runs with service-account privileges and reads the same configured owner.

All workspace mutations go through `saveWorkspace`. Zod validates shape and numeric bounds, and ledger validation rejects overselling, duplicate IDs, and future/invalid dates. Data and revision are committed atomically. An expected-revision mismatch rejects the write; it never silently overwrites newer data.

## Limits and failure behavior

- Up to 500 transactions, six catalog watchlist entries, and 750 KB serialized cloud workspace payload. CSV/JSON imports are limited to 1 MB before parsing.
- Client cloud state is in memory. Demo state uses a separate local-storage key. No cloud-to-demo fallback or automatic demo upload exists.
- Provider requests can target only catalog IDs; callers cannot provide arbitrary URLs, raw SQL, API keys, exchange names, or provider query parameters.
- API key stays in Secret Manager. Provider exceptions and raw responses are not logged, because upstream URLs may contain credentials.
- Cached market data is reused for 24 hours. An expiring per-instrument lease limits duplicate concurrent refreshes. Firestore transactions enforce shared request counters across function instances.
- Function maximum instances: 2; scheduled maximum: 1. App provider budget: 8 requests/minute and 100/UTC-day. A single instrument can consume two requests (price and FX). No automatic retry loop is used for provider errors.
- Scheduled refresh waits between instruments. Concurrent interactive refreshes can still exhaust the shared minute budget; failed instruments retain old cached data.
- Provider symbol/currency, dates, finite positive numbers and duplicate dates are validated. Upstream error payloads are not accepted as prices.

## Pending connection verification

The emulator tests verify local rule behavior, not IAM, billing, authorized domains, a deployed function, or a paid data subscription. At connection time, test the owner and an unrelated account against deployed reads and callables. Verify sign-out, no client writes, exact instrument mappings, actual provider quotas, delayed-price status, exchange rights, and Secret Manager access.

App Check may be added for abuse protection once the hosting domain and attestation configuration are known. It is not a substitute for authentication or owner authorization. No analytics, brokerage credentials, trading endpoints, or AI inference inside the investing app are configured.
