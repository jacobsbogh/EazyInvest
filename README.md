# EazyInvest

A personal investing workspace for a beginner in Denmark, using personal money after tax. React, TypeScript, Recharts, GitHub Pages, Firebase Authentication and Firestore on **Spark**. No billing upgrade or Cloud Functions are required.

Source: [jacobsbogh/EazyInvest](https://github.com/jacobsbogh/EazyInvest). Firebase project: `eazyinvest-c3887`. Follow [the setup runbook](docs/DEPLOYMENT.md) for owner access and publication.

## Run locally

Use Node 22 (Node 24 also builds).

```sh
npm install
npm run dev
```

Without `.env.local`, choose **Explore the demo**. Generated example prices and holdings stay in browser storage. With the connected configuration, open `http://127.0.0.1:5173/EazyInvest/` and sign in with the dedicated owner's email and password. Cloud access requires deployed rules and the owner's UID in `config/access`. Account creation is managed in the Firebase console.

## Features

- Dashboard with goal, watchlist, learning progress and long-term projections.
- A 1–40 year planner with contributions, fees, inflation, tax illustrations, alternate assumptions, a market shock, table and CSV export.
- Six reference investments, search/filter, comparisons, watchlists and research notes.
- DKK buy/sell/dividend ledger with average purchase cost, historical transaction FX, gains, reviewed CSV imports and JSON backups.
- Six investing lessons and 2026 Danish tax calculators with official SKAT sources.
- Email/password owner sign-in, private Firestore transactions, revision conflict protection and responsive layouts.
- Optional GitHub Actions market job: credentials remain in Actions secrets, and a restricted writer cannot read your portfolio.

The catalog is a starting universe, not a buy list. Fund classification and SKAT positivliste membership are explicitly unverified. Prices are not total returns; dividends and consistent corporate-action adjustment require an appropriate data contract. Provider coverage/licensing depends on the selected plan. Missing live data remains missing.

Gains are before tax. Sales/dividends leave the investment ledger; there is no broker cash balance. The app cannot execute trades. Broker integration, pensions, corporate investing, tax filing, splits/transfers and withholding-tax reconciliation are outside this version. See [calculation assumptions](docs/CALCULATIONS.md).

## Private storage and price updates

The owner saves via Firestore transactions. Rules enforce ownership, field/plan bounds, collection limits and consecutive revisions. Client validation checks detailed ledger semantics and a 750 KB payload limit. An owner using a custom client could corrupt their own records; rules do not recompute the entire ledger. Unauthorized users cannot access it, and invalid loaded data is rejected. See [architecture](docs/ARCHITECTURE.md).

The market job checks six catalog instruments, reuses caches younger than 24 hours and makes at most 12 provider requests/run with eight-second spacing. Refreshing in the app loads the saved cache. Live prices can be connected after the app is published.

Pages assets and this repository are public; Auth and rules protect financial records. Never put personal records, provider keys or passwords in source or public `VITE_` configuration.

## Checks

```sh
npm run check
npx playwright install chromium
npm run test:e2e
npm run test:backend
npm run test:cloud
npm run format:check
```

Backend tests use local Auth/Firestore emulators with `demo-eazyinvest` and require Java 21+. The runner recognizes Android Studio's bundled Java on Windows. Cloud browser tests exercise email/password sign-in, invalid credentials, owner save/reload, sign-out, rejected accounts and accessible desktop/mobile login on the `/EazyInvest/` path. Demo tests disable cloud configuration even if `.env.local` exists. Cloud test builds stay in `.cache/cloud-dist`.

```sh
npm run check:deploy
npm run build:pages
npm run verify:backend
```

These validate public configuration, build the production frontend, and probe anonymous Firestore read denial. Published owner/stranger checks remain necessary. Use `npm run firebase -- ...` for the local CLI with inherited debug output disabled. `login:list --json` is blocked because Firebase includes account tokens in that response.

## Recurring improvements

[The maintenance guide](docs/MAINTENANCE.md) and [backlog](docs/BACKLOG.md) describe a bounded daily development task. No Astra automation, automatic deployment or fixed daily-token-consumption mechanism is enabled. Market-data scheduling and AI development scheduling are separate.

## Sources

- [SKAT: Aktiesparekonto](https://skat.dk/borger/aktier-og-andre-vaerdipapirer/aktiesparekonto)
- [SKAT: share income](https://skat.dk/borger/aktier-og-andre-vaerdipapirer/skat-af-aktier)
- [SKAT: investment funds](https://skat.dk/borger/aktier-og-andre-vaerdipapirer/skat-af-investeringsbeviser-udstedt-af-investeringsforeninger-og-investeringsselskaber)
- [SKAT: annual investment-company list](https://skat.dk/erhverv/ekapital/vaerdipapirer/beviser-og-aktier-i-investeringsforeninger-og-selskaber-ifpa)
- [Twelve Data API](https://twelvedata.com/docs)
- [Firebase pricing plans](https://firebase.google.com/docs/projects/billing/firebase-pricing-plans)
