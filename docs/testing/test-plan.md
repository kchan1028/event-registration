# Test plan

Status: Implemented (adopted November 15, 2026). This plan says how changes to CycleReg are tested, who verifies them, and what evidence is kept. It applies only to this repository.

It does not hold requirements or delivery status. [product.md](../../product.md) is the source for requirements and acceptance criteria, and [roadmap.md](../../roadmap.md) is the source for priorities, phase gates, and what is Verified. Domain test requirements (what each area must prove) stay in the [coding guide](../coding-guide.md#what-must-be-tested); this plan says when to run them.

## Commands

These are the repository's real commands ([package.json](../../package.json), [local setup](../runbooks/local-setup.md)). Unit and API tests need the local PostgreSQL server from the setup guide.

| Purpose | Command |
|---|---|
| Typecheck | `npm run typecheck` |
| Unit and API tests for one file | `npx vitest run tests/<file>.test.ts` |
| Unit and API tests that import changed source files | `npx vitest related <src/file.ts> ... --run` |
| Browser tests for one file | `npx playwright test e2e/<file>.spec.ts` |
| Full unit and API suite | `npm test` |
| Full check: typecheck, unit and API tests, build | `npm run check` |
| Full browser suite (builds the app, resets the `cyclereg_e2e` database) | `npm run test:e2e` |

Browser tests run in desktop Chrome (Playwright's `desktop` project). Several check-in tests also run at phone width inside that project. No other browser engine is automated.

## 1. Pull request testing

A pull request tests what it changes, not the whole application.

- **Changed behavior.** Run `npm run typecheck` and the unit and API test files for the changed code. When a screen changes, run the browser tests for that screen. New or changed behavior gets a new or updated test, including the failure case for money, capacity, eligibility, waivers, permissions, or personal data.
- **Affected integrations.** When the change touches shared code (`src/shared/`), sign-in or roles, the database schema, dependencies, or a flow in the [risk table](#2-risk-based-coverage), also run the test files listed there for every flow that uses what changed. `npx vitest related` finds the unit and API files that import a changed source file.
- **Relevant regressions.** Add the test files for behavior the change could plausibly break, such as the flow that calls a changed function.
- **Explain the scope.** The pull request says which test files ran and why that set covers the change, and names anything left out.
- **Not for a pull request:** `npm run check` and the full `npm run test:e2e` run locally only at the [predeployment gate](#4-predeployment-testing).
- **CI.** [CI](../../.github/workflows/ci.yml) runs the typecheck, the full unit and API suite, the build, and the full browser suite on every pull request that changes more than documentation. For a documentation-only change those jobs report as skipped. The `main` ruleset requires both test jobs to pass before a merge. Do not repeat CI's full run locally.
- **Documentation-only changes** run no tests. Say so in the summary.

## 2. Risk-based coverage

When a change touches one of these areas, run that row's tests in addition to the changed files. What each area must prove is in the [coding guide](../coding-guide.md#what-must-be-tested) and the [acceptance criteria](../../product.md#core-flows-and-acceptance-criteria).

| Area | Unit and API tests | Browser tests |
|---|---|---|
| Payments and refunds | `tests/payments.test.ts`, `tests/refunds.test.ts`, `tests/refundPolicy.test.ts`, `tests/orders.test.ts`, `tests/pricing.test.ts`, `tests/coupons.test.ts` | `e2e/checkout.spec.ts` |
| Concurrent capacity reservations | `tests/capacity.test.ts`, `tests/api.test.ts` (last place across two connections), `tests/orders.test.ts`, `tests/waitlist.test.ts`, `tests/transfers.test.ts` | `e2e/organizer.spec.ts` (shared cap) |
| Eligibility | `tests/eligibility.test.ts`, `tests/validation.test.ts`, `tests/impact.test.ts` | `e2e/checkout.spec.ts` (uncertain license) |
| Guardian consent and waivers | `tests/juniors.test.ts`, `tests/categoryExtras.test.ts` (waiver addenda), `tests/orders.test.ts` | `e2e/checkout.spec.ts` (junior with guardian) |
| Permissions | `tests/auth.test.ts`, `tests/lookup.test.ts`, `tests/juniors.test.ts` | `e2e/sign-in.spec.ts`, `e2e/checkin.spec.ts` (volunteer limits) |
| Participant privacy | `tests/exports.test.ts`, `tests/startlists.test.ts`, `tests/roster.test.ts`, `tests/checkin.test.ts` (no contact or payment details) | `e2e/checkin.spec.ts` (fallback roster) |
| Exports | `tests/exports.test.ts`, `tests/startlists.test.ts`, `tests/csv.test.ts` | `e2e/csv.spec.ts` |
| Race-day check-in and bibs | `tests/checkin.test.ts`, `tests/automatic-bibs.test.ts`, `tests/bib-reassignment.test.ts`, `tests/roster.test.ts`, `tests/identity.test.ts` | `e2e/checkin.spec.ts` |
| Published configuration changes | `tests/impact.test.ts`, `tests/resolutions.test.ts`, `tests/bulk.test.ts` | `e2e/organizer.spec.ts` |
| Screens and themes | none | `e2e/accessibility.spec.ts` and the spec for the changed screen |

Concurrency and idempotency tests must run requests in parallel or replay events; a single-threaded test does not prove them. Use fictional data only.

### Walk-up phone handoff

`e2e/walkup.spec.ts` verifies separate fictional staff/rider sessions, public event-only URL generation, QR fallback address, unpublished-event suppression, declined payment without bib issuance, participant-owned confirmation and staff check-in with one start-list entry. Run receipt QR/guardian and check-in browser regressions when changing the shared QR renderer. Existing server tests remain authoritative for windows, day-of pricing, capacity, guardian consent and readiness. A localhost emulation is not physical-phone scanning, real provider operation or a completed race-day rehearsal.

### Volunteer runbook rehearsal

The [check-in guide](../runbooks/race-day-check-in.md) is documentation for existing behavior, not a completed staff rehearsal. Have a second organizer and volunteers use their own role-scoped accounts with fictional data and without developer rescue. Record the source commit, environment, device/role, task, expected and actual result, assistance, defects and untested areas in a dated rehearsal report. Test:

- Correct event/day selection, ready-rider lookup and bib issue; returning to a checked-in rider does not cause another physical bib handover.
- Duplicate names resolved by the existing confirmation code and listed details; a missing/day-mismatched entry escalates without creating a replacement.
- Paid-but-blocked rider, guardian/review requirement and incomplete payment: no bib until the accepted resolution and current readiness permit it. Missing external approval remains a blocked scenario, not a pass.
- Separate-account phone registration, closed/full category and waitlist, failed payment and existing-order recovery without another entry or charge.
- Individual bib correction with preview/reason/issued-bib acknowledgement, physical recovery of an old bib before correction/undo makes its number reusable, escalation when the physical bib cannot be recovered, wrong-rider undo, missing/exhausted ranges and stale/conflicting previews.
- Lost response during check-in: reconnect, inspect the recorded result, retry safely and coordinate physical inventory. Do not infer payment or readiness from an old screen.
- Print every day's timestamped roster; simulate connectivity loss and shift handoff. Confirm printed rows do not authorize offline entry or clearance. Paper issuance/reconciliation cannot pass without an accepted contingency procedure and named owner.
- Reach the assigned lead/deputy, route payment questions to finance and send changes to the timer liaison. Record acknowledgement separately from creating a start-list revision.

Real phone, printer, sign-in/provider, timer and staff-independence checks remain manual under section 5; source review and automated scenarios do not satisfy them. No new product acceptance threshold is added.

### Check-in connection recovery

`e2e/checkin-recovery.spec.ts` uses a separately signed-in fictional Check-in volunteer at desktop and 390px phone widths. Interrupt before the individual check-in reaches the server, then separately let it commit and drop only its response. Verify the error is shown, inspect the durable state, and look up the same rider before retrying an uncommitted action. Require one bib/history entry, unchanged payment/entries/readiness, the original timestamp after a committed retry, and the next number for a different rider. Run the existing repeat-check-in API case in `tests/checkin.test.ts` and the failed-list-refresh browser regression in `e2e/checkin.spec.ts`. A concurrent lookup may already refresh a committed bib; do not assume a lost action response leaves the entire screen stale. The earlier action warning can remain beside fresh confirmation ([#153](https://github.com/kchan1028/event-registration/issues/153)); clarity remains an owner review item. Browser response interception is not physical network-loss, offline operation, physical bib handover or volunteer acceptance evidence.

### Printable roster recording limits

When changing the fallback roster, run `tests/roster.test.ts` and the fallback-roster scenario in `e2e/checkin.spec.ts`. Check the notice on every day, including no-entrant/no-exception states: printed notes do not register a rider, record payment, clear requirements or record check-in. Missing-rider rows are lookup questions, not a paper entry/bib form. Unassigned snapshot bibs say Not assigned; there is no paper check-in tick column. Preserve NOT READY blockers and snapshot status/bib labels. Check desktop, phone width and print media; the notice must print while navigation controls do not. Real pagination, printer output and accepted staff contingency/reconciliation remain separate manual evidence. No paper policy is approved by a rendering check.

### Phone roster layout

`e2e/roster.spec.ts` checks the approved [phone roster decision](../../product.md#phone-roster-review-decision) in both themes at 320/390/640 CSS pixels, with long valid names/teams, checked-in/ready/blocked riders and empty days. Require full snapshot readiness, bib/races and next-step guidance without horizontal clipping, row/order parity with desktop data, coherent heading levels, visible missing-rider guidance, one visible/accessible presentation and no private fields. At 641px and desktop, preserve table columns; print from a phone must hide stacked entries and show the existing tables, exception checklist and write-in rows. Run `tests/roster.test.ts` and existing fallback browser regressions when changing shared display helpers. Automated axe/Chromium checks do not replace real phone, screen-reader, printer/pagination or volunteer rehearsal evidence.

### Organizer handoff rehearsal

`e2e/handoff.spec.ts` rehearses existing team controls with separate fictional accounts: successor first sign-in, preparatory membership, cancel/confirm, one actor-attributed transfer, outgoing retained Registration manager access with owner/team/ledger denial, successor check-in and saved start-list export. Run the existing ownership-transfer case in `tests/auth.test.ts` and the organizer sign-in browser regression. Reload both sessions after membership changes. An automated rehearsal is not actual Clerk delivery, staff independence, provider settlement handoff or timer acceptance. Human acceptance still follows section 5 and the [handoff guide](../runbooks/organizer-handoff.md).

### Check-in navigation targets

`e2e/checkin-navigation.spec.ts` checks Builder and the clickable race-day labels at 320, 390 and 1440 CSS pixels in both themes with fine/coarse pointer contexts. Require 44px minimum target dimensions even for short day labels, no page overflow, Tab focus into the day group, arrow-key day selection with visible focus, and keyboard activation of Builder into the category workspace. Run existing check-in accessibility scenarios and phone-handoff regressions when changing header target styles. These are Chromium emulations, not real-phone or screen-reader acceptance.

### Shared responsive account headers

`e2e/header.spec.ts` checks Home, My registrations, event catalog and registration at 320, 360, 390, 720, 768 and 1440 CSS pixels in light/dark themes. Require no page overflow, horizontally contained theme/account actions, keyboard focus order, functional registration lookup/sign-out, and 44px account/interactive brand-link targets with an emulated coarse pointer. Verify the registration brand returns to the event catalog and the My registrations brand returns Home; the Home wordmark is a non-interactive span. Compare desktop header/control geometry and page height in the same DOM against the original CSS declarations; this is not a second baseline build or a claim about all application routes. Run the affected sign-in and organizer/rider accessibility scenarios because the Home header is shared. Real devices, screen readers and actual browser zoom remain separate manual checks.

### Checkout-session concurrency and retry parameters

`tests/payments.test.ts` drives the installed Stripe SDK through a fake HTTP transport, not a mocked `sessions.create`, for simultaneous requests and exhausted conflict retries. Force two requests to overlap; return `idempotency_key_in_use` while the first runs; verify one recorded session, the same request key/body and both redirects. Exhaust the configured retry budget, verify a retryable 503 and unchanged held order, advance the clock, then retry successfully with exactly the same key/body and reuse the saved session. Verify signed expiry/late-success ordering and duplicate-charge refund handling. These checks do not replace a real-provider sandbox rehearsal. Apply the payment risk-table regressions above.

### Registration correction and reservation recovery

Focused browser scenarios in `e2e/checkout.spec.ts` cover [#127](https://github.com/kchan1028/event-registration/issues/127) and [#128](https://github.com/kchan1028/event-registration/issues/128):

- Failed-submit summary links focus the field; sequential typing retains focus and full values. A new failed submission focuses the updated summary.
- Lose the response after a reservation commits, refresh, and retry with exactly the original payload/key; recover the same order and one entry set. Rapid submission produces one request.
- Unknown server/network, auth and rate-limit outcomes preserve recovery and disable submitted-data edits; a late waitlist offer must not overwrite the pending draft. Definitive rejection allows correction.
- Publish new waiver/addendum terms during an unknown outcome, with and without an original commit. Recover the accepted snapshot when committed; otherwise refresh terms and require renewed agreement.
- A recovered cancelled order cannot be paid and permits reselection.

Run order/guardian/addendum API regressions and rider accessibility checks in both themes. Browser automation is not a screen-reader or real-phone pass. Provider session creation (#84) is separate and is not proved by these reservation tests.

### Berkeley rider pricing and race discovery

When changing these workflows, cover the approved [Berkeley pricing](../../product.md#combined-berkeley-demo-event) and [rider-facing behavior](../../product.md#rider-facing-behavior):

- Single-race, fixed-package and extra-criterium prices for each rider rate, overlapping qualifications, unknown facts, and day-of pricing. Check coupon precedence and accepted-order snapshot preservation.
- Rate scopes after category deletion/duplication, changed-rate publication impact, and transfer price comparisons. Missing-race rate references must remain an ignored-price warning rather than a publication dead end.
- The rate comparison is visible before selection and reads published configuration; check phone/desktop widths, both themes, table semantics and contrast.
- All races remains the default. The opt-in shortcut for racing age 50/Cat 4 shows the six expected category choices, preserves shared-start counts, and moves focus to the schedule and brings the results heading into view.
- Review-required choices remain reachable in All races. Keep selected/offered entries visible after profile changes, support empty matches, and retain All races after required details are cleared and re-entered.

Focused coverage lives in `tests/pricing.test.ts`, `tests/berkeley-events.test.ts`, `tests/orders.test.ts`, `tests/transfers.test.ts`, `tests/impact.test.ts` and the Berkeley scenarios in `e2e/checkout.spec.ts`. Existing validator regression checks remain in `tests/validation.test.ts`; the missing-race rider-rate case is in `tests/pricing.test.ts`. Apply the risk table above for affected integrations; these scenario lists do not replace it. Browser automation is not a real-phone or assistive-technology rehearsal.

## 3. Independent verification

The agent that writes a change never verifies it alone.

- **Who verifies.** Claude Code checks changes Codex wrote. Codex checks changes Claude Code wrote. From the repository root, the author asks for it with `codex review --base main` (Codex verifying) or `claude -p "Test and review the changes on this branch against main (PR #<n>). Do not edit, commit, push, or merge. Rank findings by severity and mark each blocking or non-blocking."` (Claude Code verifying). The verifier does not edit, commit, push, or merge.
- **The author still tests.** The author runs the checks in [section 1](#1-pull-request-testing) before handing off. Verification is in addition to them.
- **The verifier thinks independently.** It checks the change against the requirement in `product.md`, edge cases, and regressions in the [risk areas](#2-risk-based-coverage), and writes its own scenarios where they matter. Rerunning the author's commands is not enough.
- **Findings.** Material findings are fixed in the same pull request and retested before verification counts as complete, for at most three rounds. A finding deferred past the merge becomes a GitHub issue, labeled as the [coding guide](../coding-guide.md#labels-and-milestones-on-issues) describes.
- **Unavailable verifier.** If the other agent is unavailable, record verification as **Pending**. Never report it as passed.

Where a finding from any kind of testing (QA, security, user acceptance, usability, accessibility, performance) is recorded:

- **On an open pull request:** a pull request comment; the author fixes it in that pull request.
- **On `main`, or outside the change's scope:** a GitHub issue with a severity and the [labels](../coding-guide.md#labels-and-milestones-on-issues), plus a line under "Open questions". A defect touching money, capacity, eligibility, waivers, permissions, or personal data is a `release-blocker`. When it changes the launch picture, also add or update the finding in [AUDIT.md](../../AUDIT.md).
- **A security weakness or exposed private data:** never a public issue, comment, or document. Report it privately as [SECURITY.md](../../SECURITY.md) describes; it blocks a release until fixed.
- **An observation, not a bug** (usability, or acceptance feedback asking for different behavior): an issue labeled `usability` recording what the person tried, expected, and saw. The owner decides before anyone codes a change; a changed flow goes into `product.md` first.
- **A failed acceptance criterion** from `product.md` is a bug, not an observation; the roadmap item stays incomplete until it passes.
- Never name a tester or include real rider data in an issue.

Each pull request records this in its description:

```text
Author: Claude Code | Codex
Verifier: Codex | Claude Code | Pending (reason)
Tested commit: <full SHA>
Author checks: <commands run> -> <results>
Verifier checks: <commands and scenarios> -> <results>
Remaining gaps: <untested areas, blocked checks, assumptions>
```

## 4. Predeployment testing

Nothing is deployed today ([deploy runbook](../runbooks/deploy-render.md)). Before any deployment, including a staging deploy, record evidence for all of these on the commit being deployed:

1. **Full automated suite:** `npm run check` and `npm run test:e2e` pass locally on that commit, and CI passed on it.
2. **Critical user journeys:** each flow in [product.md acceptance criteria](../../product.md#core-flows-and-acceptance-criteria) that the release includes, checked against the running build with fictional data. At minimum: publish a weekend, buy both days, last-place checkout, payment retry, refund, check in, and export to timer.
3. **Applicable integration checks:** for each provider the release turns on (Clerk sign-in, Stripe test mode, Amazon SES), a check against that provider's test or sandbox instance, not a stub. A provider still Planned or unverified in [roadmap.md](../../roadmap.md) stays unverified until that check runs.
4. **Operational readiness:** `GET /api/health` answers 200 on the deployed instance; backups and a demonstrated restore, monitoring, support owner, and a way back to the previous version, as [operations.md](../operations.md#changes-and-releases) requires for the environment.

## 5. Manual checks

Automated tests do not replace these. Record what was observed separately from what was not tested.

| Check | Required when | How |
|---|---|---|
| Usability | Before a Phase 1 exit gate decision, and when a core rider, organizer, or volunteer flow changes in a way testers have not seen | [Usability test kit](../usability/README.md); thresholds in [roadmap.md](../../roadmap.md#phase-1--test-the-experience-without-live-money) |
| Accessibility | Before calling a flow Verified; checkout and check-in first | The four checks in [ACCESSIBILITY.md](../../ACCESSIBILITY.md#how-accessibility-will-be-checked): automated, keyboard-only, a screen reader, a real phone |
| Mobile and browser compatibility | When layout, navigation, forms, or check-in screens change; again before the pilot | Phone width (375 px) and desktop in Chromium for every such change; Safari on a real iPhone and one other desktop browser before calling a flow Verified or deploying |
| Race-day rehearsal | Phase 3 exit gate, and before each pilot event | Mock weekend in [roadmap.md](../../roadmap.md#phase-3--make-race-day-operable), including blocked riders, bib issuance, fallback roster, timer handoff, and a backup restore |

The [prelaunch readiness assessment](../research/prelaunch-readiness.md) maps existing requirements to focused interrupted-reservation, provider/reconciliation and race-day recovery scenarios. Its [measurement specification](../research/prelaunch-readiness.md#proposed-launch-measurement-specification) is Proposed: use synthetic replay and report timing coverage/exclusions; it does not add instrumentation, new sample thresholds or an accepted release gate. Keep execution results in the PR or dated rehearsal report.

### Local logical restore rehearsal

Use the [isolated restore procedure](../runbooks/local-backup-restore.md) with fresh fictional source/target/rejection databases. Verify table hashes/counts and selected schema/sequence metadata before opening the recovered application; then verify health, persisted check-in/bib and start-list lock, paid-but-blocked readiness and repeat-safe operations. Reject a populated source and demonstrate single-transaction rollback on a deliberate target conflict. Confirm cleanup after a partial failure touches only databases whose successful creation was logged; skip uncreated names. A second operator repeats it with a new run ID. Do not touch working/hosted databases or use real rider records. Application suites need not run for procedure-only documentation; execute the specific rehearsal instead. Keep individual results and limits in the PR/rehearsal record. Hosted backups, off-site copies, recovery objectives, provider reconciliation and staff acceptance remain separate gates.

## 6. Release blockers

A release does not go out while any of these is true:

- A required CI check fails, or the [predeployment](#4-predeployment-testing) evidence is incomplete.
- An open issue labeled `release-blocker`: a defect touching money, capacity, eligibility, waivers, permissions, or personal data ([labels](../coding-guide.md#labels-and-milestones-on-issues)).
- A critical defect as [operations.md](../operations.md#incident-severity) defines it: oversold place, duplicate charge, lost confirmed entry, unexplained ledger difference, private data exposed.
- Payment, entry, and capacity records disagree: the ledger, provider records, order state, and capacity counts do not reconcile.
- Independent verification is Pending or Fail for a change in the release.
- An unresolved launch dependency for the environment, as listed in [roadmap.md](../../roadmap.md): for example the merchant and settlement decision, the USA Cycling waiver and license path, a real Clerk instance, or the [final pre-launch security gate](../../roadmap.md#final-pre-launch-security-gate-planned) before real rider data or live payments.

Security weaknesses are reported privately as [SECURITY.md](../../SECURITY.md) describes, never in this repository's public issues or documents.

## 7. Evidence template

Use one row per scenario in the pull request description, a linked file under `docs/testing/`, or the roadmap item's evidence link.

| Requirement | Scenario | Expected result | Actual result | Environment | Commit | Verifier | Evidence | Status |
|---|---|---|---|---|---|---|---|---|
| [Last-place checkout](../../product.md#core-flows-and-acceptance-criteria) | Two riders pay for the final shared place at once | One order confirmed; the other refused; capacity not exceeded | | Local, PostgreSQL 17, fictional data | | | | Not Run |

Status values:

- **Pass:** ran, and the actual result matched the expected result.
- **Fail:** ran, and the actual result did not match.
- **Blocked:** could not run (missing provider keys, environment, or an earlier failure). Say what blocks it.
- **Not Run:** in scope but not attempted yet.

Only Pass is evidence that a requirement works. Planned integrations stay Not Run or Blocked until they run against a real test instance.

## 8. Keeping this plan current

Every change reviews whether this plan needs updating, and updates it in the same pull request when the change introduces or modifies:

- User workflows or acceptance criteria.
- Integration behavior, failure handling, or operational risks.
- Test commands, environments, fixtures, or CI checks.
- Required coverage, verification responsibilities, or release gates.

Individual execution results stay in the pull request or a linked test report (see the [evidence template](#7-evidence-template)). Reusable scenarios and testing policy stay here.

Every pull request states one of these in the `Test plan` line of its change summary ([CONTRIBUTING.md](../../CONTRIBUTING.md#change-summary)):

- **Test plan updated:** what changed and why.
- **No test plan update needed:** a brief reason.
