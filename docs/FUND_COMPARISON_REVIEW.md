# Fund comparison review — 2026-10-04

Reviewed the complete change against the previously released `main`, including
the shared model, UI, exports, calculation contract and recorded production data.

The model splits total return and distributions once, adds net reinvestment to
average acquisition cost, combines ordinary-account final gains/losses with the
same year's dividends, and carries annual-model losses before charging later
gains. A hypothetical sale never reduces following years' holdings. New-ASK
contribution room uses all inside assets; excess budget stays visible outside.
Terminal exit costs adjust the same year's annual tax where relevant.

Verified cost/tax facts resolve by exact ISIN. Missing distributing-fund yields,
unknown tax classifications and unreviewed tax years stay unavailable; before-tax
research remains possible. The UI discloses separate charge inclusion, frozen
2026 assumptions, distinct fund exposures, zero-interest cash and excluded costs.
Exports include the actual applied charge rates and review date. The private
workspace schema, history loading, access controls and general-planner guards
are preserved.

Visual review identified table-induced mobile card overflow hidden by the global
overflow clip. Grid children now shrink to available width; the table scrolls
inside a labelled, keyboard-focusable region. A regression checks actual card
bounds while the table is open, alongside axe and desktop/mobile screenshots.
The new screen loads separately so the initial app bundle stays below its
configured warning threshold.

Local validation: frontend/job builds, 151 unit tests, all 30 demo browser tests
and formatting pass. Final focused mobile/table tests pass after the layout fix.
Before merge, CI must also pass the 12 backend integration, 17 rules and 12 signed-in
browser tests (222 tests total). Production publication follows the reviewed merge
and receives public desktop/mobile checks. Source merging alone does not publish.

No remaining merge-blocking finding. This is an isolated deterministic scenario,
not tax filing or a projection from observed historical returns. Other share income
consumes band room, but its own tax/loss offsets and other holdings are outside
the totals. The first scheduled market update and the owner's live sign-in check
remain operational follow-ups, separately documented in the production record.
