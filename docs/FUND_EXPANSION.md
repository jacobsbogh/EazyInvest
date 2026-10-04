# Danish index funds and additional UCITS ETFs

Implemented and verified; production activation remains pending. The
catalog now contains 178 listings: 146 Danish ordinary-share listings, four Danish
index funds, eight UCITS ETFs and twenty US shares. This is a research catalog,
not a recommendation or proof of broker/account availability.

## Implementation

1. Correct investment-company fee/tax classification and resolve Nasdaq
   cancellations/amendments across the complete downloaded sample.
2. Verify exact issuer share classes, separate cost components, income treatment
   and year-specific Danish tax evidence. Validate free-provider listings and
   actual historical coverage independently.
3. Connect the definitions to Explore, saved strategies, DKK history and the
   restricted market writer. Test tax-model guards, permissions, persistence and
   desktop/mobile research flows.

These implementation steps are complete. Matching production rules, the initial
market import and Pages publication follow the release sequence in
[the market runbook](MARKET_DATA.md).

## Reviewed share classes and costs

All facts below were checked on **2026-10-04**. Danish funds distribute income;
the four added UCITS ETFs accumulate it. Fund denomination and trading currency
are separate: IUSN's USD share class is represented by its EUR Xetra listing.

| Catalog ID         | Exact share class / ISIN                                        | Trading listing               | Annual ongoing charge / TER | Primary issuer source                                                                                                                            |
| ------------------ | --------------------------------------------------------------- | ----------------------------- | --------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| sparindex-global   | Sparindex INDEX Globale Aktier KL / DK0060747822                | SPVIGAKL.CO, Copenhagen, DKK  | 0.50% ongoing               | [Sparindex](https://www.sparindex.dk/vores-fonde/index-globale-aktier-kl/)                                                                       |
| sparindex-emerging | Sparindex INDEX Emerging Markets KL / DK0060300762              | SPIEMIKL.CO, Copenhagen, DKK  | 0.50% ongoing               | [Sparindex](https://www.sparindex.dk/vores-fonde/index-emerging-markets-kl/)                                                                     |
| danske-global      | Danske Invest Global Indeks, klasse DKK d / DK0010263052        | DKIGI.CO, Copenhagen, DKK     | 0.40% ongoing               | [Danske Invest](https://www.danskeinvest.dk/w/show_funds.product?p_nFund=1873&p_nFundgroup=75&p_nId=75)                                          |
| nordea-global      | Nordea Invest Globale Aktier Indeks KL 1 / DK0060451623         | NDIGAIKL1.CO, Copenhagen, DKK | 0.35% ongoing               | [Nordea](https://www.nordeafunds.com/da/fonde/globale-aktier-indeks-kl-1)                                                                        |
| spyi               | SPDR MSCI ACWI IMI UCITS ETF (Acc) / IE00B3YLTY66               | SPYI.DE, Xetra, EUR           | 0.17% TER                   | [State Street](https://www.ssga.com/ie/en_gb/intermediary/etfs/state-street-spdr-msci-all-country-world-investable-market-ucits-etf-acc-spyi-gy) |
| sppw               | SPDR MSCI World UCITS ETF (Acc) / IE00BFY0GT14                  | SPPW.DE, Xetra, EUR           | 0.12% TER                   | [State Street](https://www.ssga.com/ie/en_gb/intermediary/etfs/state-street-spdr-msci-world-ucits-etf-acc-sppw-gy)                               |
| eunk               | iShares Core MSCI Europe UCITS ETF EUR (Acc) / IE00B4K48X80     | EUNK.DE, Xetra, EUR           | 0.12% TER                   | [iShares](https://www.ishares.com/uk/individual/en/products/251861/ishares-msci-europe-ucits-etf-acc-fund)                                       |
| iusn               | iShares MSCI World Small Cap UCITS ETF USD (Acc) / IE00BF4RFH31 | IUSN.DE, Xetra, EUR           | 0.35% TER                   | [iShares](https://www.ishares.com/uk/individual/en/products/296576/ishares-msci-world-small-cap-ucits-etf-usd-acc-fund)                          |

Additional Danish-fund cost components are kept separate from ongoing charges:

| Catalog ID         | Estimated annual fund transaction costs | Maximum entry charge | Maximum exit charge |
| ------------------ | --------------------------------------- | -------------------- | ------------------- |
| sparindex-global   | 0.05%                                   | 0.12%                | 0.07%               |
| sparindex-emerging | 0.11%                                   | 0.27%                | 0.29%               |
| danske-global      | 0.10%                                   | 0.10%                | 0.07%               |
| nordea-global      | 0.04%                                   | 0.10%                | 0.05%               |

Sources are the issuer pages above and the exact DKK d row in
[Danske Invest's charges table](https://www.danskeinvest.dk/w/show_list.charges?p_nFundGroup=75&p_nId=75).
The displayed annual strategy charge weights only ongoing charges/TER. Entry,
exit, transaction estimates and broker/FX charges are separate assumptions.
Observed historical fund returns already reflect fund expenses, so historical
simulations do not deduct current published charges again.

## Reviewed 2026 tax facts

The four Danish funds are equity-based distributing funds with share-income
taxation of realised gains and distributions for private ordinary accounts.
Evidence identifies the exact fund/class:

- [Sparindex's tax table](https://www.sparindex.dk/viden/skat/) names both added
  Sparindex funds as distributing equity funds.
- [Danske Invest's prospectus](https://www.danskeinvest.dk/web/show_download.prospectus?p_vIsin=DK0010263052&p_vLanguage=da),
  dated 24 April 2026, classifies Global Indeks DKK d in section 5.33.5 and explains
  ordinary private-account treatment in section 7.2.2.2.
- [Nordea's exact KL 1 facts](https://www.nordeafunds.com/da/fonde/globale-aktier-indeks-kl-1)
  state equity income, realisation taxation and distributions.

The four added ETF ISINs have exact positive matches in the existing reviewed
[official 2026 SKAT workbook](https://skat.dk/media/fo5m24x5/september-2026-abis-liste-2021-2026.xlsx).
Their ordinary-account treatment is annual share-income taxation. The domestic
funds' absence from that investment-company list is displayed independently;
their classification comes from issuer evidence. Absence never establishes tax
treatment. See [SKAT's fund guidance](https://skat.dk/borger/aktier-og-andre-vaerdipapirer/skat-af-investeringsbeviser-udstedt-af-investeringsforeninger-og-investeringsselskaber).

Tax facts expire when the tax year changes without a reviewed replacement.
Historical results remain before personal tax. The current future planner does
not model ordinary-account distribution taxation, so it blocks ordinary-account
handoff for these Danish funds. Before-tax planning remains available; ASK is a
separate existing illustration, with eligibility requiring its own verification.
Annual-tax ETF facts block the tax-on-sale illustration. Unknown investment-company
classifications block ordinary-account tax handoff.

## Actual free historical coverage

A read-only live probe on 2026-10-04 passed all eight listings through the real
Yahoo adapter and dated ECB/identity DKK conversion. These are monthly endpoints
sampled from daily adjusted bars, including the latest partial month:

| Catalog ID         | Monthly observations | First observation | Last observation | Separate quote date |
| ------------------ | -------------------- | ----------------- | ---------------- | ------------------- |
| sparindex-global   | 56                   | 2022-03-31        | 2026-10-02       | 2026-10-02          |
| sparindex-emerging | 56                   | 2022-03-31        | 2026-10-02       | 2026-10-02          |
| danske-global      | 56                   | 2022-03-31        | 2026-10-01       | 2026-10-02          |
| nordea-global      | 168                  | 2012-11-30        | 2026-10-02       | 2026-10-02          |
| spyi               | 186                  | 2011-05-31        | 2026-10-02       | 2026-10-02          |
| sppw               | 93                   | 2019-02-28        | 2026-10-02       | 2026-10-02          |
| eunk               | 205                  | 2009-10-30        | 2026-10-02       | 2026-10-02          |
| iusn               | 103                  | 2018-04-30        | 2026-10-02       | 2026-10-02          |

The first three funds' provider history is shorter than the funds' lives. No
benchmark, alternate share class or invented price extends their history. Sparindex
also [documents a strategy change on 17 November 2017](https://reports.sparinvest.dk/PRIIPSPerformanceScenario_DK0060747822_da.pdf)
for its global fund; earlier issuer history follows the previous policy.

Reproduce the public-source check without Firebase credentials:

```sh
npm run build:jobs
node jobs/lib/jobs/src/verify-market.js --funds
```

The metadata-only result stays in ignored `.cache/market-verification.json`.
Downloaded price datasets stay out of git. This probe does not write production
caches. Demo mode contains definitions/facts but no generated histories for these
new funds. The scheduled job imports them after matching rules and code activation.

## Verification

Frontend/job builds and repository formatting checks passed. Automated checks
passed 127 unit tests, nine Firebase integration tests, sixteen access-rule tests,
twenty-six desktop/mobile demo tests and ten signed-in browser tests: **188 total**.
The eight-fund live probe passed with zero unavailable listings or validation
failures. Tests cover share-class identity, separate cost components, year-specific
tax guards, adjusted DKK returns, retained fund definitions, owner persistence,
writer isolation and Nasdaq cross-file invalidations.

The larger catalog also exposed a loading race: initial cache loading could erase
a listing returned by an owner search. Initial catalog completion now merges
existing discoveries; the signed-in search/queue flow passes.

## Catalog fixes

Artha Optimum, BI Erhvervsejendomme and Ress Life remain ordinary-share listings in
the regulator catalog. Their explicit provider fund classification makes them
participate in cost/tax research: unknown costs remain unknown, rather than zero.
A manager fee alone is insufficient evidence of total ongoing expenses.

Nasdaq trade records now retain transaction identity. Cancellation/amendment
events invalidate earlier records across files before a reference is selected.
Known invalid saved references are removed even if history download fails. Legacy
references without transaction identity are conservatively cleared when a matching
ISIN is invalidated. Valid caches survive unrelated or unavailable report updates.
The bounded sample remains a reported-trade reference, never an official closing
price or input to portfolio valuation/returns.
