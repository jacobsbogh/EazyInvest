# Calculation specification

The app models scenarios, not expected returns or investment recommendations. Financial functions live in `shared/finance.ts` and `shared/tax.ts` and are independent from UI and Firebase. Every financial change needs tests with independently calculated expected values.

## Projection

The monthly multiplier is `((1 + annualReturn) × (1 − annualFee))^(1/12)`. Growth is applied first and the monthly contribution follows at month end. Contributions remain fixed in nominal DKK; they are not inflation-indexed.

The lower and higher scenarios use the selected nominal annual return minus/plus 4 percentage points. These are assumptions, not percentiles, confidence intervals, or probabilities. There is no Monte Carlo model or inference of future returns from historical prices.

An optional stress event multiplies the portfolio by 0.65 after the first month’s growth in year two, before that month’s contribution. Growth assumptions then continue unchanged. For one-year plans the year-two event has no effect.

## Tax modes

2026 constants: ASK rate 17%, ASK ceiling DKK 174,200; share-income rates 27%/42%; individual threshold DKK 79,400. The spouses option doubles the threshold, assuming eligibility and that the full combined threshold is available. Other share income is excluded. Sources and the reference date live with the constants.

- **Before tax:** no tax deduction.
- **Shares, tax on sale:** at each chart point, calculate the tax that would be due if the entire holding were sold then. Capital is not taxed. Interim sales and dividends are not modeled. This deliberately does not claim to reproduce every fund’s tax treatment.
- **ASK:** assume a newly opened account with the chosen initial deposit. Cap the initial deposit at the frozen 2026 ceiling. Each new year’s room is `max(0, ceiling − opening portfolio value)`. Limit that year’s monthly deposits to that room. Excess planned contributions accumulate as separate uninvested cash earning 0%, excluded from the plotted portfolio. Deduct annual tax from the investment account; do not simulate extra tax-paying deposits. Losses offset later modeled gains at the same fixed rate; there is no immediate refund.
- **Equity investment company, annual:** apply progressive share-income tax to annual gains net of prior modeled losses, paying it from the account. This is a simplified standalone scenario, not a complete implementation of Danish loss pools, dividends, withholding, or cross-account offset rules. It does not apply to capital-income-classified funds.

Future rates, thresholds and ceilings remain fixed at 2026 values. No forecast of legislation is attempted. Broker dealing costs, currency changes and foreign withholding are excluded from projections. The fee input represents an annual asset-based cost assumption.

With inflation adjustment, each displayed year’s portfolio value, cumulative contributions, cumulative tax, and separate cash are divided by `(1 + inflation)^year`. The goal is interpreted in the chart’s selected unit (future DKK or today’s DKK). Cumulative contributions are displayed in the same year’s purchasing-power unit for a like-for-like comparison.

## ASK contribution-room helper

The helper estimates `max(0, 174200 − valueAt31Dec2025 − netDepositsIn2026)`. It does not track dates within the year, special deposits for tax, overcontribution penalties, transfers, or bank-specific corrections. The bank’s recorded available room controls actual deposits.

## Portfolio ledger

Transactions use an immutable ID, valid date, instrument ID, type, positive units, positive unit price, positive DKK-per-trading-currency rate, nonnegative DKK fees, and an optional note. Same-day ordering follows entry/import order. Backdated sales are validated against the complete chronological ledger. Short positions and future transactions are rejected.

- Buy: increase units and average-cost basis by `units × unitPrice × historicalFX + fees`.
- Sell: remove the proportionate average cost, decrease units, and recognize the difference between proceeds net of fees and removed basis.
- Dividend: record `units × amountPerUnit × historicalFX − fees` as proceeds without changing units or basis.
- Value: remaining units × latest available unadjusted quote × latest available FX. Alpha Vantage's current quote is stored separately from its monthly history. Quote and FX observations can be from different dates. ECB reference FX is an indicative conversion, not a broker execution rate.
- Net invested: purchases plus fees minus sale proceeds net of fees minus recorded dividends net of fees.
- Total gain: current investment value minus net invested. This includes both realized and unrealized results, before tax. It is not time-weighted or money-weighted performance.

If any held position lacks a market quote, aggregate value and profit are unavailable rather than understated. Sold-out positions need no quote. There is no cash account, so sale proceeds are treated as leaving the tracked investments. Average-cost values are an accounting aid, not a tax filing guarantee.

## Historical comparisons

Single-instrument charts default to DKK, with a trading-currency switch. Alpha Vantage monthly observations retain both raw close and provider adjusted close. When all usable selections have split/dividend adjustment metadata, charts, period returns and drawdowns use adjusted closes; mixed adjusted/price-only comparisons use raw closes for every selection. The latest unadjusted quote is used for the price table and holdings valuation, never as an extra adjusted history point. Legacy unadjusted data and demo data remain price comparisons. Personal tax and dealing costs are excluded.

For DKK analysis, each historical value is multiplied by its own dated DKK-per-trading-currency reference rate. The job reads the free ECB daily history: EUR uses DKK/EUR; USD uses (DKK/EUR)/(USD/EUR); native DKK uses 1. It selects the latest reference date on or before the observation, at most seven calendar days earlier. Rates after the close, today's rate, interpolation and unbounded holiday fallback are never used. Missing historical FX makes DKK analysis unavailable while native-currency analysis remains available. Existing price caches remain readable and can be enriched by the updater. Demo FX is generated and labelled as such.

Multi-instrument comparisons normalize the first common observation to 100. Monthly series align by calendar month because exchanges can have different final trading days; daily/legacy series align by exact date. Only overlapping observations are charted. No interpolation, pre-launch backfill, alternate listing or benchmark splice is performed. Metrics for the primary selection use its observations within the displayed common period; no overlap produces an empty chart and unavailable metrics. Missing selected series are disclosed and excluded.

The default window is 20 years ending at the latest common observation, with 1/3/5/10/20-year and full available-history choices. The displayed start/end and count describe the actual data, which can be shorter than the selected window. Drawdown is the largest observed peak-to-trough decline in that window. Monthly sampling can understate losses between observations, and provider adjustments can be revised. The demo remains clearly labelled generated data.

## Holding-period analysis

These results use the primary investment's full available history in the chosen currency, independently of the chart range and comparison dates. Total return is `end / start − 1`. Annualized return is `(end / start)^(365.25 / elapsed UTC days) − 1`, with at least one calendar year required. Unsupported or nonfinite results are unavailable.

Full calendar-year returns use the previous December observation and the completed December observation. Current-year results with that baseline are labelled year to date. Missing baselines or year ends produce explicitly partial years. The current partial month's actual observation may enter the headline and year-to-date return.

Rolling 5/10/20-year returns require respectively 61/121/241 consecutive completed monthly endpoints: exactly 60/120/240 month differences. The current UTC month is excluded. Missing months break a window; no younger fund is extrapolated. The table reports window count, best/worst annualized returns with dates and observed loss share. Windows overlap, so loss share is a historical observation, not a future probability.

## Historical monthly saving

Saved portfolio strategies extend the same month-close timing to multiple
allocations; their specification follows this single-investment section.

The simulator uses full available DKK observations, independently of the chart's currency/range/comparisons. Its selected start and end months must have completed observations, and every intermediate month must be present. The current UTC month is excluded. Start/end dates show the actual observed closes.

The initial investment and first monthly contribution enter at the first selected close. At each later close, multiply the existing balance by the ratio of current to previous DKK return-series values, then add that month's fixed DKK contribution. This assumes fractional exposure. For three adjusted closes of 100 with historical FX 6, 7 and 8, three DKK 1,000 deposits finish at `1000 × 8/6 + 1000 × 8/7 + 1000 = 3476.19`; contributions are DKK 3,000 and gain is DKK 476.19.

Provider adjusted values account for splits and dividend reinvestment; price-only history excludes dividends. Values are nominal DKK before personal tax, dealing fees and currency-conversion charges. Fund expenses reflected in observed prices remain embedded. The simulation writes no portfolio transactions. It accepts contributions up to DKK 1 million/month and an initial investment up to DKK 100 million; nonfinite or balances above the supported safe-number limit are rejected. It is a replay of historical returns, not a forecast or broker execution model.

## Saved portfolio strategies

`shared/portfolio-history.ts` matches completed calendar months across every
investment in both selected strategies. Real portfolios require adjusted return
data and dated DKK FX; demos use generated, labelled price examples. Comparison
months use calendar month-end labels, while original trading/reference dates stay
in the underlying cache. Every intermediate month must exist; missing funds, FX,
gaps or a common range shorter than two months produce no comparison.

Initial money and the first monthly deposit are allocated at the first close by
target weights. Each later month grows each holding by its own DKK return ratio,
then allocates the fixed nominal deposit by target weights. Contribution-only
allocation lets existing weights drift. Annual rebalancing resets all balances to
target weights after the December deposit. Trades, tax and conversion costs are
excluded; fractional exposure and dividend reinvestment are assumed.

Both strategies receive the primary strategy's initial and monthly budget over the
same start/end months, even when the alternative's saved budget differs. The cash
baseline equals cumulative deposits at 0% interest. Results distinguish deposits,
ending value and gain, without writing ledger entries.

The investment index starts at 100. Before each new deposit, multiply it by the
ratio of grown holdings to the prior month's closing invested balance. This
removes external contributions from returns while preserving their effect on
allocation drift. Drawdown uses this index rather than deposit-inflated account
value. Recovery is the elapsed month count from the peak preceding the deepest
observed fall until that index regains its peak; otherwise it is unrecovered at
period end. Worst month is the smallest observed monthly investment return.

Holding-period statistics analyze this strategy's observed index path, not
independently restarted portfolios for every rolling start. No historical return
is copied into a future expected-return input. Budgets, goals, selected tax model
and verified weighted fund charges can be carried deliberately into the planner.
Unknown costs retain the planner's existing explicit fee assumption. See
[fund-fact provenance and tax limits](FUND_FACTS.md).
