# Market release — 2026-10-04

The owner approved production activation. Reviewed PR 1 was merged as
`8b7873d4f22f20c09bd4dff8eae09969e1f4a2da`.

- Matching Firestore rules and queue indexes deployed to `eazyinvest-c3887`.
  Anonymous access checks passed. Belgium `europe-west1` remains Spark free tier.
- The [manual import](https://github.com/jacobsbogh/EazyInvest/actions/runs/37220658229)
  succeeded on attempt 2: 178 caches checked/updated, zero failures. The first
  attempt stopped before importing prices; existing caches were retained. Its
  top-level log did not identify the cause. Index readiness was checked before
  retrying, and the retry succeeded with unchanged source.
- Production cache verification found 178 registry entries and 178 valid,
  identity-matched quotes, with no missing mapped quote or schema mismatch.
  Observations range from 17 September to 2 October: older last trades remain
  explicitly dated and subject to the existing stale-quote warnings.
- Fourteen sampled histories (all twelve funds, Novo B and Microsoft) passed
  schema/listing checks. Novo has 310 monthly observations from January 2001.
  Three domestic funds start in March 2022; Nordea starts in November 2012.
  Existing Alpha Vantage caches retain their original provenance.
- `MARKET_DATA_VERSION=2` and `MARKET_SYNC_ENABLED=true` now enable scheduled
  Tuesday–Saturday 05:37 UTC updates. The first subsequent scheduled run remains
  to be observed; GitHub scheduling can be delayed.
- [Pages publication](https://github.com/jacobsbogh/EazyInvest/actions/runs/37221759126)
  passed for the same reviewed commit. Public desktop/mobile checks passed for
  the password form, accessibility and original demo journeys without browser
  errors. These checks use no owner credentials or personal workspace records.

Metadata-only local verification artifacts remain ignored. No prices, credentials
or owner records were added to source. The owner's own live sign-in check remains
distinct from emulator persistence tests and public browser checks.
