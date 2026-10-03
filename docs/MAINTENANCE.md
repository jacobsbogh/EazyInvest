# Recurring improvement workflow

This is a prepared workflow, not an active automation. Connections, model choice, schedule, usage limits, Git permissions, and deployment rules will be configured separately with the owner.

Use this prompt for a future project-scoped scheduled task:

> Improve EazyInvest using one concrete, high-priority item from docs/BACKLOG.md, or fix a reproducible defect that blocks normal use. Read the architecture and calculation specification first. Work in an isolated Git worktree when Git is configured. Define the expected behavior, implement a bounded change, run the relevant checks, and leave a reviewable diff with validation evidence. Update the backlog and implementation notes. Keep demo data clearly labeled and keep missing live data visibly missing. Preserve owner-only access, backend-held provider secrets, CSV validation, and revision protection. Never change real holdings or account configuration, execute trades, purchase services, enable billing, or deploy as part of this maintenance task. If no justified improvement fits the run, report that and stop rather than making cosmetic churn. Report what changed, what was checked, and any remaining limitation.

For financial logic: add independent expected-value cases, explain the assumptions in the UI, and update `docs/CALCULATIONS.md`. Verify changes to Danish tax rules against SKAT, version by tax year, and preserve the source and verification date. Do not infer a fund’s tax classification from its name, distributing/accumulating label, or price history.

For access controls: test signed-out access, a different authenticated account, wrong UID paths, all direct writes, allowlist modifications, and callable authorization. A passing UI login test alone is insufficient.

For presentation: verify desktop and mobile, keyboard interaction, readable contrast, loading/empty/error states, and source/date labels.

Default finish checks: `npm run check`, affected browser tests, and `npm run test:rules` for access-rule changes. Keep commits and pull requests focused. A later owner-approved release process can decide what gets merged and deployed; token availability alone should not drive either decision.

Official scheduled-task behavior and local-machine requirements were researched during planning: [scheduled tasks documentation](https://learn.chatgpt.com/docs/automations?surface=app). A fixed “spend the entire daily Astra allowance” mechanism is not assumed or configured.
