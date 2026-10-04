# Fund comparison milestone

Build a comparison between a Danish equity index fund and a UCITS ETF using the
same starting money, monthly contributions and explicitly entered future return.
Keep historical adjusted returns before personal tax and retain all provenance.

## Implementation plan

1. Complete the approved release of PR 1: matching rules/indexes, verified free
   import, quote-version activation, Pages publication and public browser checks.
2. Implement an independent, tested annual fund scenario. Split distributions
   from total return without adding them twice; track reinvestment, cash, tax
   basis, annual tax and hypothetical sale at the selected horizon.
3. Add a comparison screen with equal budgets, verified ongoing charges, explicit
   optional transaction/max entry/exit charges, user-entered distribution yields,
   ordinary-account/ASK/before-tax choices and dated classification guards.
4. Verify independent cash-flow fixtures, loss handling, progressive tax bands,
   ASK contribution room, unknown facts, browser journeys and accessibility.
   Review and release the complete result through the existing workflow.

## Verified source boundaries — 2026-10-04

[SKAT fund rules](https://skat.dk/borger/aktier-og-andre-vaerdipapirer/skat-af-investeringsbeviser-udstedt-af-investeringsforeninger-og-investeringsselskaber)
state that distributions are taxable and that gains on equity minimum-tax funds
are taxed on sale using average acquisition cost. Investment companies use annual
valuation. Exact share-class classifications remain in the reviewed fund facts.

[SKAT share-income rules](https://skat.dk/borger/aktier-og-andre-vaerdipapirer/skat-af-aktier)
confirm 2026 rates of 27%/42% and a DKK 79,400 threshold (double for eligible
cohabiting spouses). Distributions and realised gains share the year's bands.
Listed-equity losses offset eligible equity income and carry forward; no immediate
refund of losses is assumed beyond tax charged on the same year's modelled income.

[SKAT ASK rules](https://skat.dk/borger/aktier-og-andre-vaerdipapirer/aktiesparekonto)
confirm 17% annual taxation and the 2026 DKK 174,200 contribution ceiling. Cash
inside the account counts towards its value. The illustration models a new account,
pays tax internally and keeps excess planned contributions in separate cash.
Eligibility remains separate from brokerage availability.

## Scenario contract

Future return is a gross total-return assumption before fund charges and tax,
entered by the user. Distribution yield is an assumption expressed as a percentage
of the year-end fund value before distribution; it is not inferred from adjusted
history or presented as a forecast. Monthly contributions enter at month end;
distributions occur at year end. Accumulating share classes distribute zero.

Ordinary minimum-tax equity funds pay tax on distributions each year. Net
reinvestment increases acquisition cost; unreinvested proceeds earn 0% in cash.
Hypothetical terminal sale combines its realised gain/loss with that year's
distributions and available modelled loss carryforward. Annual equity-company
and ASK tax include both distributions and value changes once.

Rates, thresholds and classifications use reviewed 2026 facts and are held fixed
for the scenario. Missing/current-year classifications remain unavailable for tax
models; before-tax comparison remains possible. Optional other annual equity
income consumes progressive-band room but its own tax is outside the comparison.
Foreign withholding, capital-income funds, cross-account reconciliation, repeated
sales, changing law, execution prices and broker/FX charges are outside this model.

Issuer maximum entry/exit charges are optional assumptions, not asserted execution
costs. Missing separately published transaction charges remain disclosed as excluded.
Historical adjusted returns already include fund expenses and are not changed.

## Implemented result and verification

`/compare-funds` compares two exact share classes using one budget, horizon and
gross-return assumption. It supports ordinary-account, new-ASK and before-tax
illustrations, reinvested or retained cash, dated ongoing charges, optional issuer
transaction/max entry/exit estimates, other share income and eligible spouses'
band room. Every result includes retained inside/outside cash and a hypothetical
terminal sale. The general planner's existing distribution-tax guards remain.

The CSV includes input assumptions, exact ISINs, applied charge percentages,
cost review date, classification and annual cash flows. Settings are exploratory
and are not persisted to the private workspace; there is no migration or backend
schema change. Historical prices are not inputs to this future-return scenario.

Sixteen new unit fixtures verify cash flows, average acquisition cost, same-year
progressive bands, sale-loss refunds, annual-loss recovery, ASK room including
cash, entry/exit charges, current-year guards and input limits. Four desktop/mobile
journeys verify equal budgets, missing yield, unknown facts, ASK excess cash,
auditable exports, accessibility and visible card bounds with the table open.
The full local unit suite (151) and demo browser suite (30) pass. See
[review and release checks](FUND_COMPARISON_REVIEW.md).
