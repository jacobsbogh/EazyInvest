# Connect and publish EazyInvest

The code is implemented and pushed to [jacobsbogh/EazyInvest](https://github.com/jacobsbogh/EazyInvest). This is currently a public source repository. No live Firebase project, provider key, or deployed website has been configured during implementation.

## 1. Choose the targets

- Firebase project ID and registered Firebase **web app** ID.
- The Google account that should own this personal workspace.
- GitHub repository: `jacobsbogh/EazyInvest`. Review its source visibility separately from Firebase owner-only data access.
- A Twelve Data account with coverage for the desired catalog symbols. Do not purchase a plan or enable scheduled fetching until coverage and cost are confirmed.

GitHub Pages needs an eligible GitHub plan to publish from a private source repository. The site’s JavaScript and sign-in page remain public; Firestore rules and callable checks protect your financial records. Do not put financial records or private API credentials in source files, repository variables, or the frontend.

## 2. Sign in and obtain public configuration

Use the locally installed CLI through the wrapper. It clears inherited debug flags to keep account/environment details out of verbose logging.

```sh
npm run firebase -- login
npm run firebase -- projects:list
npm run firebase -- apps:list WEB --project YOUR_PROJECT_ID
npm run configure:firebase -- --project YOUR_PROJECT_ID --app YOUR_WEB_APP_ID --base /EazyInvest/
npm run check:deploy
```

The configuration helper verifies the returned project/app, validates the four public values, and creates ignored `.env.local`. It will not overwrite an existing file. For a user site or custom-domain root, use `--base /`. It does not enable services, deploy, write an allowlist, or alter cloud data. Restart the development server after changing configuration.

In the Firebase console, enable Firestore in a suitable European region and Google sign-in under Authentication. Add `localhost` and the GitHub Pages hostname, `jacobsbogh.github.io`, to authorized domains. The hostname has no scheme or repository path. The deployed Functions region is `europe-west1`.

## 3. Configure owner access and provider credentials

Sign in once through the local app to create the Firebase Auth user. Access is denied until the allowlist is installed. Copy that account’s UID from Firebase Authentication and create this Firestore document through the privileged console:

```text
Document: config/access
Field: ownerUid (string) = YOUR_FIREBASE_AUTH_UID
```

All direct client writes are denied, including writes to this document. The owner UID is configuration, not a secret, but granting it must remain an administrative operation.

Cloud Functions deployment requires billing eligibility. Set up budget alerts in the chosen project before activation. Set the provider key through the secret prompt; do not paste it into chat or a command argument:

```sh
npm run firebase -- functions:secrets:set TWELVE_DATA_API_KEY --project YOUR_PROJECT_ID
npm run firebase -- deploy --only firestore:rules,firestore:indexes,functions --project YOUR_PROJECT_ID
npm run verify:backend
```

The deploy command builds Functions in its predeploy hook. The verification script performs anonymous reads of protected Firestore paths and calls both functions without authentication. Expected responses are `PERMISSION_DENIED` and `UNAUTHENTICATED`; a missing function, network failure, or unexpected response fails the check. It does not create users, mutate records, or query the provider. These probes complement the owner/stranger checks below; they cannot certify every deployed rule.

Scheduled data refresh is disabled by default. To enable it later, copy `functions/.env.example` to `functions/.env.YOUR_PROJECT_ID`, set `MARKET_REFRESH_ENABLED=true`, and redeploy Functions. The scheduled function is deployed even while its provider-fetch behavior is disabled; Firebase infrastructure may still incur costs. Keep the frontend region and backend region aligned.

## 4. Configure GitHub Pages

The source repository is already connected. In repository Settings → Pages, select **GitHub Actions**. Add these Actions repository **variables**, using the public values in `.env.local`:

| Variable                    | Firebase web configuration |
| --------------------------- | -------------------------- |
| `VITE_FIREBASE_API_KEY`     | `apiKey`                   |
| `VITE_FIREBASE_AUTH_DOMAIN` | `authDomain`               |
| `VITE_FIREBASE_PROJECT_ID`  | `projectId`                |
| `VITE_FIREBASE_APP_ID`      | `appId`                    |

The provider key stays in Firebase Secret Manager. No Firebase admin credential is required by the Pages workflow. `configure-pages` supplies the URL base path; project sites, user sites, and configured custom domains use their actual Pages path.

Run **Publish EazyInvest** from Actions. It is manually triggered and does not deploy on every push. It validates configuration, builds, runs unit checks, verifies that the live backend denies anonymous access, then publishes `dist`. The separate CI workflow runs backend, rules, demo browser, and cloud browser checks on pull requests and pushes to `main`.

For a local production build with your `.env.local` values:

```sh
npm run build:pages
npm run preview
```

Open the configured base path in the preview URL. Never deploy `.cache/cloud-dist`: it is the emulator browser-test build.

## 5. Release verification

1. Open the deployed URL signed out. Google sign-in and the explicitly labeled demo should be available.
2. Sign in with the owner account. Save a plan, reload, and confirm persistence.
3. Sign out. Open a separate browser profile with a different Google account and confirm access is denied.
4. As the owner, refresh one supported instrument. Verify symbol, currency, price date, FX date, and source. Check coverage before refreshing the rest of the watchlist.
5. Export a JSON backup and keep it privately. Confirm browser deep links and reload work under the Pages repository path.

Production OAuth domain configuration, provider subscription access, billing, and real account permissions can only be verified after connecting the actual accounts. The emulator tests do not claim to verify them.

## References

- [Firebase CLI](https://firebase.google.com/docs/cli)
- [Firebase secret configuration](https://firebase.google.com/docs/functions/config-env)
- [Firebase public API keys](https://firebase.google.com/docs/projects/api-keys)
- [GitHub Pages custom workflows and plan availability](https://docs.github.com/en/pages/getting-started-with-github-pages/using-custom-workflows-with-github-pages)
