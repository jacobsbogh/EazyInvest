# Investment strategy milestone

Build one complete journey: find an investment, allocate a monthly budget, compare
historical portfolios in DKK, save a preferred strategy and return to it from the
dashboard. Free data sources, GitHub Pages and Firebase Spark remain requirements.

## Implementation order

1. **Search and coverage.** Complete the existing listing registry, search queue
   and history requests. Search local names, tickers and ISINs immediately; external
   searches run in the scheduled free-data job. Validate listing identity and expose
   queued, unavailable and ready states. Share a daily provider budget across runs.
   Keep the restricted writer unable to read the owner's workspace.
2. **Saved strategies.** Migrate existing workspaces and backups without losing
   records. Add named strategies with up to five investments, allocations totaling
   100%, starting money, monthly contributions, a goal, account model, rebalancing
   policy and research notes. Validate edits, saving, deletion and preferred choice.
3. **Historical portfolio comparisons.** Use completed, consecutive monthly DKK
   observations over a common date range. Support contribution-only allocation or
   annual rebalancing. Compare two strategies with equal input budgets and a
   zero-return cash baseline. Separate contributions from gains and measure losses
   and recovery on a return index unaffected by deposits. Offer selectable starting
   dates and rolling holding-period results. Never invent pre-inception history or
   bridge missing months; exclude strategies lacking dated FX or adjusted returns.
4. **Connected experience.** Add a strategy page, links from Explore, saved choices
   on Overview and a deliberate handoff to the future planner. Lead with a few
   useful results, with assumptions and detailed tables available below. Keep real
   historical outcomes separate from future return assumptions.
5. **Verified fund facts and Danish context.** Record issuer fund costs with dates
   and source links. Import the current official SKAT investment-company list by
   exact ISIN into a reviewed, year-specific snapshot. Show unknown classifications
   explicitly. Use facts to explain the chosen account illustration; historical
   adjusted fund returns already reflect fund expenses, so do not subtract them
   again. Tax estimates remain illustrations, not filing calculations.
6. **Verification and release.** Run independent calculation fixtures, migrations,
   registry/queue/budget and owner/writer rules tests, cloud save/reload tests and
   desktop/mobile accessible browser journeys. Update calculation and deployment
   documentation. Publish the verified result through the existing release process.

## Completion criteria

- An existing owner workspace and an old JSON backup load without data loss.
- A user finds a listing and understands whether its history is ready or queued.
- A user saves two strategies and compares them using identical contributions and
  dates, including a different starting month.
- Results show contributions, value, gains, investment drawdown and recovery, with
  data ranges and assumptions visible. Missing observations do not produce a result.
- The preferred strategy and notes survive reload and appear on the dashboard.
- A user can carry the strategy's budget into the future planner while setting
  future return assumptions explicitly.
- Fund-cost and tax-list statements link to verified, dated primary sources.
- Anonymous users and the market writer cannot read saved personal strategies.

## Progress

- Search/coverage, saved strategies, historical comparisons, connected dashboard
  and planner, and verified fund facts are implemented.
- Frontend/job builds, 102 unit tests, 8 emulator integration tests, 14 permission
  tests, 20 desktop/mobile demo tests and 8 cloud browser tests pass (152 total).
- Implementation is ready for review. Production rules/index deployment requires
  explicit approval after automatic approval review rejected the live access-control
  change. Publish the matching Pages release after the backend deployment succeeds.
