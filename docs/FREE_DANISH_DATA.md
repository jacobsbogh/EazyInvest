# Free Danish data implementation

The catalogue snapshot checked on 2026-10-04 contains **146 ordinary share listings**: 119 Copenhagen Main Market and 27 First North Denmark listings. It counts share classes separately. It is a research universe, not a list of recommendations or a historical universe of every delisted company.

## Sources and boundaries

- **ESMA FIRDS** supplies official ISIN, name, instrument classification and venue metadata for `XCSE`, `DSME` and `FNDK`. Queries select the latest published ordinary-share records and exclude expired/terminated reference records. Main Market takes precedence when a security appears on both venues. Nominal capital currency is not used as proof of trading currency. [Official reporting source](https://www.esma.europa.eu/data-reporting/mifir-reporting).
- **Yahoo Finance** supplies free historical daily bars and a separate last-trade quote. Exact ISIN lookups plus four issuer/exchange-supported cross-listing mappings cover **all 146 catalogue entries**. The reviewed mappings and official evidence are in `shared/danish-symbols.json`; Stockholm/Helsinki histories are never substituted for Copenhagen listings. Downloaded charts must match symbol, exchange, currency, type and timezone. Yahoo is an unofficial ingestion interface without an availability guarantee. Its data terms still apply. [Adjustment explanation](https://in.help.yahoo.com/kb/finance/adjusted-close-sln28256.html).
- **Nasdaq Nordic** supplies free delayed regulatory CSV reports. The job captures up to eleven closing-session minutes from the newest retained day. An observed exchange trade is displayed separately, with ISIN, venue, time and report filename. This bounded sample is **not an official end-of-day close** and never replaces adjusted history or holdings quotes. Files have short retention; the daily schedule captures them even though history downloads refresh weekly. [Official portal](https://tradereports.nasdaq.com/shares/trade-reports/post-trade).
- **ECB** supplies dated EUR/USD conversion into DKK; native Danish prices use identity conversion. Rates after an observation are never used. History before available ECB rates remains available in its trading currency.

DKK analysis for EUR/USD listings starts with the ECB's published euro reference history on 1999-01-04. Older native-currency prices remain available. Missing FX inside the supported period still makes the DKK analysis unavailable; no missing rates are filled.

Yahoo daily bars are reduced to the last available observation in each calendar month, retaining the actual date. The latest partial month stays labelled by its date and is excluded by existing completed-month simulations. `Close` is split-adjusted; `Adj Close` includes splits and dividends. Missing months stay missing. A last-trade quote can predate published bars for an illiquid security; its original date is retained and the UI marks it stale.

Three investment companies are ordinary share listings in ESMA but classified as funds by Yahoo. Their verified provider classification is stored explicitly; the adapter does not relax type checks for other securities. Ress Life Investments trades in **EUR** in Copenhagen, and is converted to DKK using dated ECB rates. The other 145 listings were verified in DKK. Copenhagen venue does not imply DKK denomination.

The [fund expansion](FUND_EXPANSION.md) adds four Danish index funds outside the
ordinary-share reference feed and four UCITS ETFs. It also corrects unknown
investment-company costs/tax checks and resolves cancellations/amendments across
Nasdaq sample files using transaction identity. The original 146-share universe
is unchanged.

## Operation

`npm run update:danish-catalog` fetches the complete reference subset and resolves symbols by ISIN before replacing the bundled metadata snapshot. It writes no stock prices into git. The market job refreshes official references, rotates bounded unresolved-ISIN lookups, imports all mapped Danish histories automatically, and prioritizes owner-requested histories. Registry reads use bounded 100-document pages. Existing IDs, strategies, trades and backups remain readable when discovered listings enter a newer bundled snapshot.

Definitions absent from a newer reference feed are retained as historical listings so saved holdings and backups keep their identity. Routine imports skip them; their prior histories remain available. Updating the catalogue never silently deletes a security used by a saved investment.

`npm run verify:market` performs a read-only live check of the entire Danish universe, Nasdaq references and every existing EUR ETF/US stock reference. Run `node jobs/lib/jobs/src/verify-market.js --sample` after building for a shorter Danish probe. Its metadata-only summary is `.cache/market-verification.json`, which is ignored by git. No Firebase credentials are needed for this check.

`npm run sync:market` requires existing public Firebase configuration and the restricted writer's `MARKET_SYNC_EMAIL` / `MARKET_SYNC_PASSWORD`. **No stock-data API key is required.** `ALPHA_VANTAGE_API_KEY` remains an optional fallback for a genuinely unsupported non-Danish history. Its existing persistent 25-request allowance still applies when used. Public-source 429 responses stop further history calls; cookies, logins, proxies and alternate-host bypasses are not used.

Valid history caches are reused for seven days; collecting a Nasdaq reference does not change their history retrieval date. Failures retain prior caches. Source, observation date, retrieval date and stale status are visible in Explore. Demo mode never synthesizes prices for the added Danish listings.

## Verified implementation

On 2026-10-04 the read-only live probe downloaded and validated adjusted history for **146/146 Danish listings**, with zero unavailable listings or import failures. The latest observations were dated 2026-10-02. A separate probe verified all 24 existing ETF/US stock references and captured a Nasdaq closing-session sample for eleven Danish ISINs. These are public-source checks, not a claim of production deployment.

Frontend/job builds and formatting passed. Automated verification passed 118 unit tests, nine Firebase integration tests, fifteen access-rule tests, twenty-two desktop/mobile tests and nine signed-in browser tests. It covers exact share classes, catalogue pagination, EUR trading in Copenhagen, adjustment provenance, stale quotes, dated FX, saved-holding compatibility and writer isolation.

## Release sequence

The implementation can be reviewed and tested on its branch. Production activation requires deploying the matching Firestore rules and indexes, merging the code into `main`, running the market workflow, and publishing the matching Pages build. The schedule runs only from `main`. The existing writer account remains isolated from the owner's workspace. Pushing a branch does not deploy rules or publish the app.

Use the release commands in [the deployment runbook](DEPLOYMENT.md). After the first production sync, check the saved cache source, exact symbol, currency, dates and observation counts before publication. Free sources can change coverage; unavailable data must remain unavailable.
