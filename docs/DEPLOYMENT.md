# GitHub Pages with Firebase Spark

Project: `eazyinvest-c3887`. Repository: [jacobsbogh/EazyInvest](https://github.com/jacobsbogh/EazyInvest). Expected URL: `https://jacobsbogh.github.io/EazyInvest/`.

**Keep Spark. Do not link billing.** This app uses Firebase Authentication and Firestore. There are no Cloud Functions to deploy. Live prices are optional and can be connected after publication.

## Initial release status

Published on 2026-10-04 at [EazyInvest](https://jacobsbogh.github.io/EazyInvest/) from app commit `d104116`. [CI](https://github.com/jacobsbogh/EazyInvest/actions/runs/37157730911) and [Pages publication](https://github.com/jacobsbogh/EazyInvest/actions/runs/37158087461) passed.

- The free-tier default Firestore database is in Belgium (`europe-west1`), with rules/indexes deployed and `config/access.ownerUid` assigned to the dedicated password account.
- Email/password sign-in is enabled, Google sign-in is disabled, and the Pages/local authorized domains are configured.
- Anonymous Firestore reads are denied. Emulator tests pass for owner save/reload/sign-out, unrelated-account denial, invalid credentials, and accessible desktop/mobile login.
- The actual HTTPS site passes desktop/mobile password-form, accessibility, and all seven demo-screen checks, with no browser errors.
- The owner's direct sign-in/save/reload/sign-out check on the published site remains pending. Enter the password only on the site; automated checks do not use it.

The free historical-data follow-up is documented in [the market-data runbook](MARKET_DATA.md). Recurring development automation remains inactive. The setup instructions below also serve as the runbook for recovery or publication.

## Firebase and owner access

1. In [Firestore](https://console.firebase.google.com/project/eazyinvest-c3887/firestore), use the default database in **production mode**, Standard edition, `europe-west1` (Belgium). Inspect the existing database first; create it only if absent. Location is a lasting choice.
2. Enable **Email/Password** under [Authentication providers](https://console.firebase.google.com/project/eazyinvest-c3887/authentication/providers), with email-link sign-in disabled. Create a dedicated owner account through Authentication → Users if one does not exist. Disable Google sign-in. Enter the app password only in Firebase's account form or the app's sign-in form.
3. In Authentication → Settings → Authorized domains, add `jacobsbogh.github.io`. For local use add both `localhost` and `127.0.0.1`; Vite uses the latter.
4. The EazyInvest web app is registered as `1:13783355390:web:70b6f26128c6e8dd817aaf`. Public configuration is saved in ignored `.env.local` on the setup machine. To regenerate it on another checkout:

```sh
npm run firebase -- login
npm run configure:firebase -- --project eazyinvest-c3887 --app 1:13783355390:web:70b6f26128c6e8dd817aaf --base /EazyInvest/
npm run check:deploy
npm run firebase -- deploy --only firestore:rules,firestore:indexes --project eazyinvest-c3887
npm run verify:backend
```

The helper will not overwrite existing configuration. The public Firebase API key is not a provider secret. The verification script expects anonymous read denial; owner and stranger verification remains necessary.

Copy the dedicated password account's UID from Authentication → Users, then create this document in the privileged Firestore console. Preserve existing fields if it already exists:

```text
Collection: config
Document: access
Field: ownerUid (string) = YOUR_FIREBASE_AUTH_UID
```

Run `npm run dev`, open `http://127.0.0.1:5173/EazyInvest/`, and sign in with that account's email and password. Save a plan and reload to verify persistence. Check that a different authenticated account is denied and signing out removes access. Ordinary app users cannot change the allowlist. The app does not offer public registration or upload demo records automatically.

## GitHub Pages

In [Pages settings](https://github.com/jacobsbogh/EazyInvest/settings/pages), choose **GitHub Actions** as the source. Add these four public [Actions variables](https://github.com/jacobsbogh/EazyInvest/settings/variables/actions):

| Variable                    | Value                                                       |
| --------------------------- | ----------------------------------------------------------- |
| `VITE_FIREBASE_API_KEY`     | The `apiKey` from Firebase web configuration / `.env.local` |
| `VITE_FIREBASE_AUTH_DOMAIN` | `eazyinvest-c3887.firebaseapp.com`                          |
| `VITE_FIREBASE_PROJECT_ID`  | `eazyinvest-c3887`                                          |
| `VITE_FIREBASE_APP_ID`      | `1:13783355390:web:70b6f26128c6e8dd817aaf`                  |

Run [Publish EazyInvest](https://github.com/jacobsbogh/EazyInvest/actions/workflows/pages.yml) → **Run workflow** on `main`. It validates configuration, builds for the actual Pages path, runs unit tests, checks anonymous Firestore access is denied, then publishes. No provider key is needed to publish.

The sign-in page, bundle and source are public. Firebase records are private. A push runs CI; Pages publication is manual.

## Free historical data and current prices

The workflow is `.github/workflows/market-data.yml`. Follow [the market-data runbook](MARKET_DATA.md) for the free-only source, exact-listing validation, historical backfill and limitations.

1. Keep Email/Password enabled in Authentication.
2. Create a dedicated Authentication user for the market job with a strong unique password. It need not receive email. **Do not use the owner account.**
3. Add that UID as the string field `marketWriterUid` in `config/access`, preserving `ownerUid`.
4. Add these [Actions secrets](https://github.com/jacobsbogh/EazyInvest/settings/secrets/actions): `MARKET_SYNC_EMAIL`, `MARKET_SYNC_PASSWORD`, `ALPHA_VANTAGE_API_KEY`. Enter secrets through GitHub's form, not chat, command arguments, or repository files. No admin/service-account key is needed.
5. Deploy the Firestore rules and run **Refresh market data** manually. Verify supported exact listings, historical ranges, price dates and FX dates. Unsupported prices remain missing or retain their previous data.
6. Set the Actions variable `MARKET_SYNC_ENABLED=true` to enable Tuesday–Saturday updates at 05:37 UTC (06:37 Danish winter time / 07:37 summer time), after the previous weekday's close. GitHub can delay runs and disable public-repository schedules after 60 inactive days.

The job can only read/write catalog prices, never personal records. It checks all six instruments, reuses caches younger than 20 hours, and makes at most 18 provider requests/run with thirteen-second spacing. Manual reruns share the free daily allowance. Provider data stays in Firestore, never the public repository. The app's refresh button reads that cache.

## Release checks and references

Verify owner save/reload, sign-out, rejected account access and deep links on the published URL. Export backups privately. When prices are connected, verify symbol, currency, price date, FX date and source. Keep within Spark and provider quotas.

- [Firebase Spark pricing plan](https://firebase.google.com/docs/projects/billing/firebase-pricing-plans)
- [GitHub Pages workflows](https://docs.github.com/en/pages/getting-started-with-github-pages/using-custom-workflows-with-github-pages)
- [GitHub Actions secrets](https://docs.github.com/en/actions/security-for-github-actions/security-guides/using-secrets-in-github-actions)
- [GitHub scheduling limitations](https://docs.github.com/en/actions/reference/workflows-and-actions/events-that-trigger-workflows#schedule)
