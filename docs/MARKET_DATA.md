# Free historical market data

The first real-data integration uses [Alpha Vantage](https://www.alphavantage.co/documentation/#monthlyadj) and [ECB reference FX](https://www.ecb.europa.eu/stats/policy_and_exchange_rates/euro_reference_exchange_rates/html/index.en.html). It runs in GitHub Actions and writes only to the owner's private Firestore market cache. Firebase stays on Spark in Belgium.

## Verified first import

Verified on 2026-10-04. [The successful backfill](https://github.com/jacobsbogh/EazyInvest/actions/runs/37162573257) used job commit `d00a15a`. These are the provider's available listing histories, not fund inception dates.

| Investment | First observation | Monthly observations |
| ---------- | ----------------- | -------------------- |
| VWCE       | 2019-08-30        | 87                   |
| EUNL       | 2009-11-30        | 204                  |
| IS3N       | 2014-07-31        | 148                  |
| SXR8       | 2010-06-29        | 197                  |
| MSFT       | 1999-12-31        | 323                  |

All five histories, current quotes and ECB reference rates were observed through 2026-10-02 and passed the shared cache schema after storage. The current month's observation can be partial; it is dated at the latest available trading day. Novo B's exact Danish DKK listing was unavailable, so it remains missing. Do not substitute its US ADR. Another free Danish source remains a follow-up.

The separate writer account and encrypted Actions credentials are configured. The owner UID and Spark plan were preserved. The app's historical views are [published](https://jacobsbogh.github.io/EazyInvest/) from app commit `70aeede`. [Full CI](https://github.com/jacobsbogh/EazyInvest/actions/runs/37162572323) and published desktop/mobile checks passed. Weekday updates are enabled with `MARKET_SYNC_ENABLED=true`; the first scheduled run remains to be observed.

## What is requested

For each catalog instrument, `SYMBOL_SEARCH` must identify the exact candidate listing with matching region, trading currency, security type and issuer/name. German `.DEX` symbols identify Xetra in the provider documentation. A Copenhagen candidate is accepted only if its metadata matches the Danish DKK Novo B listing. No US ADR, Frankfurt alternative or different fund share class is substituted.

`TIME_SERIES_MONTHLY_ADJUSTED` requests the full available history. The provider documents 25+ years, subject to the security's listing history and coverage. Stored observations retain their actual dates, raw closes and adjusted closes, including a partial latest month when returned. `GLOBAL_QUOTE` supplies a separate latest end-of-day price for holdings valuation. There are no requests to premium daily-history or realtime endpoints. A provider paywall, unavailable listing or missing data never activates a purchase or generates prices.

ECB quotes currencies per euro. The conversion is DKK/EUR for EUR, `(DKK/EUR) / (USD/EUR)` for USD, and 1 for DKK. The updater fetches its full daily reference history once per run and stores each close's rate and reference date. It chooses the latest reference on or before the close, at most seven calendar days earlier. Missing rates remain missing. The latest reference rate and date stay separate for present holdings valuation. These are indicative reference rates, not broker rates.

## Setup and operation

1. Obtain a [free Alpha Vantage key](https://www.alphavantage.co/support/#api-key). Save it as `ALPHA_VANTAGE_API_KEY` in [repository Actions secrets](https://github.com/jacobsbogh/EazyInvest/settings/secrets/actions).
2. Create a separate Firebase email/password account for the job. Preserve the owner UID and set `config/access.marketWriterUid` to the writer UID. Save its credentials as `MARKET_SYNC_EMAIL` and `MARKET_SYNC_PASSWORD` in Actions secrets. The writer must never be the owner.
3. Deploy the Firestore rules and run **Refresh market data** manually. Check the log's supported instruments, observation counts, first/last dates, quote dates and FX dates. Logs contain no provider responses, request URLs, keys, passwords or personal records.
4. Set repository variable `MARKET_SYNC_ENABLED=true` after the first import is verified. The workflow is present at `.github/workflows/market-data.yml`. Its Tuesday–Saturday 05:37 UTC schedule follows the previous weekday's closing prices. GitHub may delay or disable inactive public-repository schedules.
5. Sign in to the app, open Explore and press **Refresh data** to read the saved cache. The app never calls the provider or starts the workflow.

The current free provider limit is [25 requests per day](https://www.alphavantage.co/premium/). A run makes at most 18 requests, spaced by thirteen seconds, plus one free ECB request. Supported recent caches are reused; existing valid recent histories can acquire dated FX without consuming Alpha Vantage credits or changing their price retrieval timestamp. Unsupported listings cost a search request and remain missing. Provider limit responses stop the run; other invalid responses retain the prior cache. Manual retries share the same daily allowance and do not reset it. Workflows are serialized and time-limited.

The owner account, market cache and provider key remain private. Only public Firebase web configuration belongs in `VITE_` build variables. Do not commit quotes, financial backups, account emails, passwords or provider keys. The source is for private individual analysis under [Alpha Vantage's personal-use terms](https://www.alphavantage.co/terms_of_service/), not redistribution of the fetched dataset.

## Historical analysis

Explore defaults to 20 years and DKK, with shorter/full-history choices and a trading-currency switch. The app shows the actual range and observation count. A younger fund cannot have 20 years of its own prices. Monthly adjusted closes support long-term return/drawdown comparisons; monthly observations may miss deeper falls within a month. Comparisons use overlapping months only. Holding-period statistics use all available primary-investment history, with annualized returns, partial/calendar years and completed rolling 5/10/20-year windows. Their observed loss share is not a forecast.

The historical saving simulator applies fixed month-end DKK contributions over a selected continuous period. It separately shows contributed money, ending historical value and gain/loss. The current UTC month is excluded; no prices or exchange rates are filled in. See [the calculation specification](CALCULATIONS.md) for exact timing and assumptions.

Legacy Twelve Data caches can still be read with their original price-only labels. That adapter is retained for compatibility, but the active workflow uses Alpha Vantage exclusively.

## Verified historical FX enrichment

On 2026-10-04, [the enrichment workflow](https://github.com/jacobsbogh/EazyInvest/actions/runs/37167178086) at commit `3c33474` added dated ECB rates to all 959 observations across the five available listings. Existing recent price histories, current quotes, valuation FX and price retrieval timestamps were preserved. No additional Alpha Vantage history requests were needed; Novo B remained unavailable.

All five caches passed the shared schema and produced DKK analysis. With October's partial observation excluded, MSFT had 322 completed monthly observations and 82 rolling 20-year windows. VWCE's 86 completed observations supported 26 rolling five-year windows; the app correctly showed longer periods as unavailable. ECB's downloaded daily history began on 1999-01-04 and covered every available listing's first observation.
