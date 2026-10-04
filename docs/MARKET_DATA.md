# Market data setup

The current implementation uses free Danish reference metadata, historical prices and exchange trade reports. Read [the implementation and source boundaries](FREE_DANISH_DATA.md) for coverage, price adjustments and verification commands.

The catalog also includes four issuer-verified Danish index funds and eight UCITS
ETFs. [The fund expansion](FUND_EXPANSION.md) records exact listings, cost/tax
provenance and independently checked free-history ranges. The official ESMA share
refresh only retires ordinary shares; it preserves issuer-managed fund definitions.
Run `node jobs/lib/jobs/src/verify-market.js --funds` after `npm run build:jobs` to
check the eight additions without accessing Firebase. Production activation of the
broadened catalog and fund expansion remains pending.

## Configure the restricted writer

1. Keep Firebase on Spark. Create a separate email/password account for the market job, preserving the existing owner UID. Set `config/access.marketWriterUid` to that account's UID. The writer must never be the owner.
2. Keep `MARKET_SYNC_EMAIL` and `MARKET_SYNC_PASSWORD` in Actions secrets. Keep the public Firebase API key, project ID and app ID in repository variables. **No Yahoo, Nasdaq or ESMA key is required.** Existing `ALPHA_VANTAGE_API_KEY` is optional.
3. Deploy the matching `firestore:rules,firestore:indexes` before running the new job. Only the writer can update validated registry, history and lightweight quote records. Owners can read paginated quotes but cannot write prices.
4. After the implementation is merged into `main`, run **Refresh market data** manually. Verify source/symbol/currency, history counts and actual quote dates in the saved caches. This workflow imports every mapped Danish listing and bootstraps `marketQuotes` before publishing the app, including quotes needed for existing holdings/watchlists.
5. Keep `MARKET_SYNC_ENABLED=true` to enable Tuesday–Saturday 05:37 UTC runs. These capture the previous session's briefly retained Nasdaq reports; historical downloads reuse seven-day caches. GitHub may delay schedules or disable them on inactive public repositories.
6. Publish the matching Pages version after the backend and initial import work. Sign in, open Explore and select **Refresh data** to read saved caches. The browser never downloads external provider data or starts Actions workflows.

## Queues and failures

Immediate name/ticker/ISIN search covers the full local Danish catalogue. Main Market and First North have separate filters and a paginated table. **Search markets** queues discovery of additional supported US listings through Yahoo's public search. Up to three searches and two requested histories run before routine imports. Completed history requests rotate by their last check. New reference ISINs receive bounded, rotating exact-ISIN lookups.

Unsupported histories remain missing. Network errors, malformed responses and permission errors retain previous valid data independently; quota responses stop additional provider calls. Quotes refresh each scheduled trading-day run using a bounded five-day Yahoo chart, while full histories retain their seven-day refresh cycle. Quote checks do not reset history timestamps or add raw prices to adjusted return data. Existing valid history quotes bootstrap the lightweight cache. An older saved quote is marked stale after three calendar days by observation/retrieval. Free-source coverage is per listing, not guaranteed by its presence in the official reference catalogue.

After sign-in, the browser loads listing metadata and bounded quote pages. It reads
full histories/request states only for selected Explore investments and strategy
allocations. Refresh reads saved quotes and retries already-opened histories; it
does not contact the provider. See [the performance milestone](DATA_PERFORMANCE.md).

Nasdaq cancellation/amendment events are resolved across all downloaded sample
files using transaction identity before selecting a trade. Known-invalid cached
references are cleared even when history refresh fails. Existing references
without transaction identity are conservatively removed for an invalidated ISIN.
Unavailable reports retain valid earlier references with their original dates.

ECB history is fetched once per run. EUR conversion uses DKK/EUR, USD uses (DKK/EUR)/(USD/EUR), and DKK uses 1. Each historical observation uses a reference on or before its own date, no more than seven days earlier. Missing FX remains missing; current holdings quotes remain separate from return history.

The optional Alpha Vantage fallback preserves its shared 25-request UTC-day allowance and thirteen-second spacing. Legacy Alpha Vantage and Twelve Data caches remain readable with their own provenance and adjustment labels.

The source and public Pages assets contain no downloaded price datasets, credentials or personal financial records. Nasdaq describes non-commercial delayed data use as free; Yahoo's data terms apply. This private research implementation does not establish a commercial redistribution licence.

## Previously verified production data

Before this implementation, the [2026-10-04 Alpha Vantage backfill](https://github.com/jacobsbogh/EazyInvest/actions/runs/37162573257) imported VWCE, EUNL, IS3N, SXR8 and MSFT, totaling 959 monthly observations through 2026-10-02. Novo's exact Copenhagen listing was unavailable from that source. The [historical FX enrichment](https://github.com/jacobsbogh/EazyInvest/actions/runs/37167178086) added dated ECB rates without changing the cached price retrieval timestamps. Those are verification records for the earlier production release, not evidence that the new Danish import has been deployed.
