# EazyInvest

A personal investing workspace for a beginner in Denmark, using personal money after tax. React, TypeScript, Recharts, GitHub Pages, Firebase Authentication and Firestore on **Spark**. No billing upgrade or Cloud Functions are required.

Source: [jacobsbogh/EazyInvest](https://github.com/jacobsbogh/EazyInvest). Firebase project: `eazyinvest-c3887`. Follow [the setup runbook](docs/DEPLOYMENT.md) for owner access and publication.

Published app: [EazyInvest](https://jacobsbogh.github.io/EazyInvest/). Dedicated email/password sign-in and private Firestore storage run in Belgium on Spark. The active market implementation uses ESMA Danish listing metadata, free Yahoo history, Nasdaq exchange trade references and ECB FX; see [verified production activation](docs/PRODUCTION_RELEASE.md) and [market-data setup](docs/MARKET_DATA.md). Recurring development automation remains deferred.

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
- A catalogue with 146 Danish share listings across Copenhagen Main Market and First North, four Danish index funds, eight UCITS ETFs and twenty US shares; local name/ticker/ISIN search, filters, pagination, queued discovery, watchlists and research notes.
- DKK buy/sell/dividend ledger with average purchase cost, historical transaction FX, gains, reviewed CSV imports and JSON backups.
- Six investing lessons and 2026 Danish tax calculators with official SKAT sources.
- Email/password owner sign-in, private Firestore transactions, revision conflict protection and responsive layouts.
- Historical analysis in DKK or trading currency, with 1/3/5/10/20-year and full-history views, dated ECB FX, annualized and calendar-year returns, and rolling 5/10/20-year holding periods.
- Historical monthly saving in DKK, with selectable dates and separate contributions, investment value and gain/loss.
- Saved investment strategies with up to five allocations, goals and research notes; matching-budget historical DKK portfolio comparisons, annual rebalancing, drawdown/recovery and a cash baseline.
- A preferred strategy on the dashboard and an explicit budget/cost handoff to the future planner.
- Dated issuer costs for twelve fund share classes, separate Danish-fund transaction/entry/exit charges, and verified year-specific tax facts with exact ISIN matching.
- Free GitHub Actions market job: credentials remain in Actions secrets, and a restricted writer cannot read your portfolio.
- Lightweight saved quotes for dashboard/portfolio pricing, histories loaded on demand for research, and independent daily quote/weekly history refreshes.
- A fund comparison with matching budgets, verified charges, explicit distribution assumptions, reinvestment or retained cash, ordinary-account/ASK/before-tax scenarios, annual cash flows and CSV export.

The catalog is a starting universe, not a buy list. Coverage remains specific to each listing. Fund facts show dated issuer sources and exact ISIN membership in the reviewed 2026 SKAT list; absent, missing or conflicting information is disclosed. Membership alone does not establish suitability or account eligibility. Alpha Vantage history uses provider closes adjusted for splits/dividends; current holdings use separate unadjusted quotes. Monthly sampling can miss larger falls between observations. Each fund/listing has its own available history. Free coverage is checked against the exact symbol, venue, currency and security type; unsupported listings remain missing.

The [fund expansion](docs/FUND_EXPANSION.md) documents exact share classes, verified costs/tax sources and actual free-history ranges. Three Danish funds have provider history only from 2022. [Compare funds](docs/FUND_COMPARISON.md) models distributions separately using user assumptions and frozen 2026 rules. The general future planner retains its unsupported strategy-tax handoff guards. Matching production rules, the initial import and Pages publication are complete.

Gains are before tax. Sales/dividends leave the investment ledger; there is no broker cash balance. The app cannot execute trades. Broker integration, pensions, corporate investing, tax filing, splits/transfers and withholding-tax reconciliation are outside this version. See [calculation assumptions](docs/CALCULATIONS.md).

## Private storage and price updates

The owner saves via Firestore transactions. Rules enforce ownership, field/plan bounds, collection limits and consecutive revisions. Client validation checks detailed ledger semantics and a 750 KB payload limit. An owner using a custom client could corrupt their own records; rules do not recompute the entire ledger. Unauthorized users cannot access it, and invalid loaded data is rejected. See [architecture](docs/ARCHITECTURE.md).

The market job imports all mapped Danish listings automatically and processes bounded owner-requested queues. It downloads free daily Yahoo bars, samples the last observation of each month, and reuses history for seven days. Separate lightweight quotes refresh each scheduled trading-day run. Dashboard/portfolio loading uses quote pages; Explore and strategy comparisons load only selected histories. Nasdaq trade samples have separate provenance and never replace return history. ECB FX is fetched once per run. An optional Alpha Vantage fallback retains its persistent free-request budget. Refreshing in the app reads the private saved cache. No paid endpoint, public price artifact or Firebase billing upgrade is required. See [loading/freshness](docs/DATA_PERFORMANCE.md), [free Danish coverage](docs/FREE_DANISH_DATA.md) and [fund-fact provenance](docs/FUND_FACTS.md).

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
- [Alpha Vantage monthly history](https://www.alphavantage.co/documentation/#monthlyadj)
- [ECB reference exchange rates](https://www.ecb.europa.eu/stats/policy_and_exchange_rates/euro_reference_exchange_rates/html/index.en.html)
- [Firebase pricing plans](https://firebase.google.com/docs/projects/billing/firebase-pricing-plans)
