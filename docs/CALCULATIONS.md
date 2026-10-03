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
- Value: remaining units × latest available close × latest available FX. Quote and FX observations can be from different dates.
- Net invested: purchases plus fees minus sale proceeds net of fees minus recorded dividends net of fees.
- Total gain: current investment value minus net invested. This includes both realized and unrealized results, before tax. It is not time-weighted or money-weighted performance.

If any held position lacks a market quote, aggregate value and profit are unavailable rather than understated. Sold-out positions need no quote. There is no cash account, so sale proceeds are treated as leaving the tracked investments. Average-cost values are an accounting aid, not a tax filing guarantee.

## Historical comparisons

Single-instrument charts show prices in trading currency. Multi-instrument comparisons use only dates common to all loaded selected series, normalize their first common price to 100, and retain trading-currency effects. Missing selected series are explicitly disclosed and excluded. Drawdown is the largest observed peak-to-trough decline in the selected instrument’s window. Sparse sample data understates intra-period variation; the demo discloses that its series is generated.
