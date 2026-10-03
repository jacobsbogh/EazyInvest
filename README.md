# EazyInvest

A personal investing workspace for a beginner in Denmark. Built with React, TypeScript, Vite, Recharts, Firebase Authentication, Firestore, and Firebase Functions. It is designed for personal money after tax.

**The complete local app works without credentials.** The Firebase backend, GitHub Pages workflow, and connection helpers are implemented. Live account setup and publication still require your Firebase project, owner account, market-data key, and GitHub repository. No financial account is connected and the application cannot execute trades.

## Run locally

Use Node 22 (the Functions deployment runtime; the app also builds on Node 24).

```sh
npm install
npm run dev
```

Open the localhost address printed by Vite, then choose **Explore the demo**. The demo stores changes in this browser’s local storage. The sample market series are generated examples with fixed dates, not actual investment returns. You can clear the sample holdings in Settings, record your own hypothetical transactions, and export a backup.

## What is implemented

- Responsive dashboard, with watchlist, goal progress, learning progress, and a projection chart.
- A 1–40 year planner with monthly contributions, annual fees, inflation adjustment, three return assumptions, a market shock, tax modes, a table, and CSV export.
- Six reference investments, searchable by name, ticker, or ISIN; up to three-way price comparison; research notes and watchlist management.
- Purchases, sales, and cash dividends in a DKK ledger. Average cost basis, historical transaction FX, available market valuation, realized/unrealized gains, and CSV import/export with a review step.
- Six short investing lessons with persisted progress.
- Danish 2026 tax references, ASK contribution-room calculation, share-income tax illustration, and official SKAT links.
- Workspace naming, versioned JSON backups, validated restore, and demo reset.
- Google sign-in, owner-only cloud access, validated callable writes, revision conflict protection, provider caching, server-held API secret, quota limits, and an opt-in daily refresh function.
- Unit tests, desktop/mobile browser tests, Firestore rule tests, and CI configuration.

## Data and calculation boundaries

The reference catalog is a starting universe, not a buy list. Tax eligibility and SKAT positivliste membership are explicitly **unverified** in the app. Verify the exact ISIN against the official list for the relevant tax year. The current implementation links to the official source; it does not scrape or certify the list.

Provider integration uses Twelve Data daily **price** history (up to 1,260 observations) and a current DKK FX observation. It is not a total-return series: dividends and consistent corporate-action adjustment need a dedicated data contract before we can label it total return. Coverage, history, exchange access, and licensing depend on the chosen provider plan. No API account has been tested or purchased. A missing live quote stays missing; the cloud mode never falls back to demo prices. Quote and FX observation dates are displayed separately.

Portfolio gains are before tax and use average purchase cost including entered fees. Sales and dividends are treated as proceeds leaving the investment ledger. There is no broker cash balance. Splits, transfers, withholding tax reconciliation, pensions, corporate investing, automatic broker imports, and tax filing are outside this version. The supported CSV is the app’s documented format, not an arbitrary broker statement.

See [the calculation specification](docs/CALCULATIONS.md) for assumptions and [the architecture](docs/ARCHITECTURE.md) for storage and security boundaries.

## Checks

```sh
npm run check
npx playwright install chromium
npm run test:e2e
npm run test:rules
npm run test:backend
npm run test:cloud
```

Rule tests require Java 21+ on PATH and download the Firestore emulator on first use. They run against `demo-eazyinvest`, with no production project access. Browser tests run their own Vite server on `127.0.0.1:4173` and need no credentials. Keep Firebase values absent when running the demo browser tests.

The backend suite additionally starts Auth and Functions emulators and verifies callable ownership, server-side validation, optimistic revision conflicts, and cached data reads. It creates and removes a local dummy provider secret only when no local secret file exists. No real provider request is needed. On Windows, the test runner also recognizes Android Studio’s bundled Java.

The cloud browser suite builds the actual frontend under `/EazyInvest/` and uses the Auth emulator’s Google popup. It checks owner sign-in, callable persistence, reload, sign-out, and rejection of another Google account. All account and workspace fixtures belong to `demo-eazyinvest`; it never connects to your live project. The Firebase popup SDK and emulator widget load Google/CDN scripts, so this browser check needs internet access for those assets. The build goes into `.cache/cloud-dist`, leaving the normal deployment build separate.

Verification: production frontend and Functions builds succeeded; 34 calculation/data/deployment tests, 16 desktop/mobile demo browser tests, two cloud browser tests, and eight callable/security-rule tests passed. The browser checks include viewport sizing and automated accessibility checks for the dashboard. The cloud browser checks use local emulators; deployed Google sign-in and live provider subscription access still require verification during connection setup.

Dependency audit: the high and critical findings encountered during development were resolved. Five moderate transitive advisories remain in the development-only Firebase CLI dependency tree (`@opentelemetry/core`/Pub/Sub and `uuid`/Gaxios). They are not bundled into the frontend or the Functions package. Avoid forcing the audit’s suggested CLI downgrade; review compatible upstream fixes as they become available.

On this Windows machine, Java is available from Android Studio:

```powershell
$env:JAVA_HOME = 'C:\Program Files\Android\Android Studio\jbr'
$env:PATH = "$env:JAVA_HOME\bin;$env:PATH"
npm.cmd run test:rules
```

## Connect Firebase

See [the connection runbook](docs/DEPLOYMENT.md) for exact commands, required repository variables, and release verification.

1. Create/select the Firebase project, enable Firestore in a suitable European region, and enable Google as an Authentication provider. Functions use `europe-west1` in this implementation. The function region and frontend region variable must match if changed.
2. Register a web app. Copy `.env.example` to `.env.local` and fill all four public Firebase values. Firebase’s web API key identifies the project; it is not a provider secret. Never put a service-account key or Twelve Data key in `VITE_` variables.
3. Add localhost to Firebase Auth’s authorized domains for local use. Restart Vite and sign in once. The app initially denies workspace access because the owner allowlist does not yet exist.
4. Find your UID under Firebase Authentication. Using the privileged Firebase console, create the Firestore document `config/access` with the string field `ownerUid` equal to that UID. Do not create a client-writable allowlist.
5. Set the Twelve Data key in Secret Manager using `firebase functions:secrets:set TWELVE_DATA_API_KEY --project YOUR_PROJECT_ID`. Functions require an eligible billing plan. Set cost controls and confirm the provider plan before enabling scheduled work.
6. Build and deploy the backend when ready: `npm run build:functions`, then `npm run firebase -- deploy --only firestore:rules,firestore:indexes,functions --project YOUR_PROJECT_ID`. Nothing in the local build deploys resources.
7. Reload, sign in as the owner, save a plan, and verify another account is denied. The first cloud workspace starts empty. Demo records never sync automatically. You can explicitly export and restore a demo backup if desired.
8. Try one instrument before refreshing the whole watchlist. Verify the provider ticker/exchange mapping against your subscription. Provider errors retain the prior cached data and never synthesize quotes.
9. To opt into daily updates, copy `functions/.env.example` to `functions/.env.YOUR_PROJECT_ID`, set `MARKET_REFRESH_ENABLED=true`, and redeploy functions. The schedule runs weekdays at 23:30 Europe/Copenhagen. It refreshes tracked instruments, reuses results fetched within 24 hours, and has a global 8 requests/minute and 100 requests/UTC-day application budget. These are app limits, not a promise about the provider’s plan.

Cloud saves fail closed and report network failures. A stale revision is rejected instead of overwriting another tab’s changes. Reopen/reload to fetch the latest revision; unsaved changes do not silently become cloud data. The client uses in-memory Firestore caching only, so signing out removes cloud data from app memory. Browser developer tools may still retain previous network responses; use a trusted browser/device.

## GitHub Pages

Use a static Pages deployment with `VITE_BASE_PATH=/REPOSITORY-NAME/`. Hash routing makes deep links work without server rewrite rules. For a user site or custom-domain root, use `/`.

The manual [Publish EazyInvest workflow](.github/workflows/pages.yml) is ready. Populate repository variables, enable Pages with GitHub Actions as the source, and verify the private backend before running it. It obtains the real base path from GitHub Pages, validates the Firebase configuration, builds, runs unit checks, and probes the deployed backend for denied anonymous access before uploading the frontend. Add the Pages hostname (without the repository path) to Firebase Auth’s authorized domains. Pushing a commit does not publish automatically.

**GitHub Pages serves publicly downloadable frontend assets.** Owner authentication protects Firebase data and callable actions; it does not make the JavaScript bundle private. GitHub’s eligible plans determine whether Pages can publish from a private source repository. Never embed personal financial data in the build.

## Recurring development later

[The maintenance guide](docs/MAINTENANCE.md) and [backlog](docs/BACKLOG.md) provide a bounded daily improvement workflow. No recurring task, API billing, auto-merge, or deployment has been enabled. Improvement runs should produce verified, reviewable changes; they should not change investment holdings or execute financial transactions.

## References

- [SKAT: Aktiesparekonto](https://skat.dk/borger/aktier-og-andre-vaerdipapirer/aktiesparekonto)
- [SKAT: share income](https://skat.dk/borger/aktier-og-andre-vaerdipapirer/skat-af-aktier)
- [SKAT: investment funds and companies](https://skat.dk/borger/aktier-og-andre-vaerdipapirer/skat-af-investeringsbeviser-udstedt-af-investeringsforeninger-og-investeringsselskaber)
- [SKAT: annual list of equity-based investment companies](https://skat.dk/erhverv/ekapital/vaerdipapirer/beviser-og-aktier-i-investeringsforeninger-og-selskaber-ifpa)
- [Firebase callable functions](https://firebase.google.com/docs/functions/callable), [secret configuration](https://firebase.google.com/docs/functions/config-env), [security rule testing](https://firebase.google.com/docs/rules/unit-tests)
- [Twelve Data API](https://twelvedata.com/docs)
- [GitHub Pages visibility](https://docs.github.com/en/pages/getting-started-with-github-pages/creating-a-github-pages-site)
