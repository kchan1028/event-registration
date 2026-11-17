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
| Relative links and heading anchors in every tracked Markdown file | `npm run check:docs` |

Browser tests run in desktop Chrome (Playwright's `desktop` project). Several check-in tests also run at phone width inside that project. No other browser engine is automated.

## 1. Pull request testing

A pull request tests what it changes, not the whole application.

- **Changed behavior.** Run `npm run typecheck` and the unit and API test files for the changed code. When a screen changes, run the browser tests for that screen. New or changed behavior gets a new or updated test, including the failure case for money, capacity, eligibility, waivers, permissions, or personal data.
- **Affected integrations.** When the change touches shared code (`src/shared/`), sign-in or roles, the database schema, dependencies, or a flow in the [risk table](#2-risk-based-coverage), also run the test files listed there for every flow that uses what changed. `npx vitest related` finds the unit and API files that import a changed source file.
- **Relevant regressions.** Add the test files for behavior the change could plausibly break, such as the flow that calls a changed function.
- **Explain the scope.** The pull request says which test files ran and why that set covers the change, and names anything left out.
- **Not for a pull request:** `npm run check` and the full `npm run test:e2e` run locally only at the [predeployment gate](#4-predeployment-testing).
- **CI.** [CI](../../.github/workflows/ci.yml) runs the typecheck, the full unit and API suite, the build, and the full browser suite on every pull request that changes more than documentation. For a documentation-only change those jobs report as skipped. The `main` ruleset requires both test jobs and the Documentation links job to pass before a merge. Do not repeat CI's full run locally.
- **Documentation-only changes** run no application tests. Run `npm run check:docs`; CI's Documentation links job also runs it on every change, documentation-only or not, and it is a required check. Fix every broken link or anchor in the same pull request before merging, including one the change exposes in a file it did not edit. Say so in the summary.

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

### Refund creation recovery

Run `tests/refunds.test.ts`, `tests/payments.test.ts` and `tests/migrations.test.ts` for required request identity, lost-response replay, changed payload refusal, competing submissions, distinct intentional partial refunds, original actor preservation across finance replay, manager denial, retained caps, historical unknowns and provider retry cutoff/late signed recovery. Fixture caller changes also require case-study/bib regressions. These tests use fake providers and disposable databases; they do not establish real settlement.

`e2e/refund-recovery.spec.ts` interrupts both POST and lookup before/after a commit, retains the exact payload across refresh, retries one request and verifies one refund with unchanged confirmed entries. Check ordinary submission progress versus unknown response, the exact returned refund status (including a failed replay), initial action focus and focus return after recovery, keyboard status lookup, both themes at 360/390/1440 and region-scoped axe. Verify phone header actions and allowed long unbroken reasons wrap, both during recovery and in the saved history, so the finance screen does not expand sideways. Storage-blocked recovery, manual screen-reader/real-device and provider/operator acceptance remain separate gates. No policy-price calculation is introduced.

### Failed refund result recovery

`e2e/failed-refund.spec.ts` starts a separate app on an ephemeral loopback port and a uniquely named local `_e2e` database (on the `E2E_DATABASE_URL` server when configured, otherwise `TEST_DATABASE_URL` or its local default), using an injected fake payment provider and local-only email. It obtains a confirmed order and a failed refund through actual APIs, loses the refund response and status lookup, then replays the original request and checks the exact Failed status/live region, focus return, one refund record, one provider call and unchanged confirmed entries/total. Cover both themes, phone/desktop widths and region-scoped axe. With storage available, reload recovers the original tab request; with refund storage blocked, recovery is tested only while the page stays open, without promising refresh persistence. Cleanup drops only the database whose creation succeeded. An interrupted or killed worker can leave that disposable database behind; after an interrupted run, inspect the local database list for that run’s exact `cyclereg_failed_refund_<pid>_<timestamp>_e2e` name, confirm its worker has exited, and remove only that disposable database. The fake provider's call count and notification parser verify the local provider interface only, not real Stripe duplicate protection, signature or settlement behavior. Provider rejection and later webhook failure remain separate from this returned-failed-result browser scenario. Manual screen-reader, physical-device and real-provider reconciliation remain open under issue #169.

### Guardian invitation records

Run `tests/juniors.test.ts`, `tests/auth.test.ts`, `tests/orders.test.ts` and `tests/migrations.test.ts` for private invitation creation/list/cancellation, schema upgrade without inferred invitations, normalized address validation, exact expiry boundary, same-address concurrent replay without extending the period, concurrent replacement with one pending record, and cancellation replay not closing a replacement. Check household/viewer/organizer isolation, no access on recipient sign-in, no outgoing mail or extra grant, and source-profile merge cancellation/history preservation with the correcting actor. Recipient acceptance, removal and management screen coverage are described below. No real email-provider behavior is established.

### Explicit guardian acceptance and shared access

Run the guardian/auth/order/migration files and `tests/payments.test.ts` for schema-29 upgrade preservation, acknowledgement and exact invited-email checks, current inviter authority, expiry/cancellation/viewer refusal, a two-guardian cap, concurrent/idempotent acceptance, acceptance racing cancellation and unchanged purchase/waiver provenance. Check either guardian's subsequent registration reuses the shared profile, legacy adoption happens before sharing, household collisions roll back, merges refuse different guardian sets/viewer identities and retain source evidence, and inactive grants cannot regain order access through original-placement or checkout nonce replay. Direct database grant invalidation tests the boundary; it does not prove a removal API exists. Negative SQL constraint probes cover incomplete acceptance/cancellation, duplicate pending rows and linked profile deletion.

`e2e/guardian-access.spec.ts` uses actual local API acceptance with separate fictional guardian/viewer sessions, through the screen, then renders My registrations in both themes at 390/1440, checks provenance wording, width, keyboard order navigation and main-region axe, and opens the shared confirmation. Recipient acceptance controls are exercised with real local APIs, acknowledgement, invitation-list load-error refresh, interrupted committed acceptance with either retry or invitation refresh (including refreshed orders/juniors), success focus and refreshed order/junior lists. Physical-phone/manual-screen-reader/real identity-provider acceptance remain open.

### Guardian removal API

Run `tests/juniors.test.ts`, `tests/auth.test.ts`, `tests/orders.test.ts` and `tests/migrations.test.ts` for either guardian removing the other, actor/reason/acknowledgement evidence, identical and changed replay, self-removal refusal, outsider/viewer/organizer isolation, opposing concurrent removals leaving one guardian, and preserved purchase/waiver/viewer state. Removed original purchasers cannot read/pay/cancel/replay linked orders; accepted invitation replay must not restore authority. Verify schema-30 upgrades leave historical revocation evidence unknown and incomplete/invalid explicit removal evidence fails constraints. This API increment does not prove screens, mail, disputed restoration, claims, real identity or legal guardianship.

### Guardian management controls

Run `e2e/guardian-management.spec.ts` with the guardian invitation/acceptance browser regression and relevant sign-in/header/accessibility checks. Exercise screen invitation creation/cancellation, refused junior-viewer invitations, success focus and a fresh invitation accepted by a separate fictional account; current guardian refresh and server-derived own-account identity; cancellation of a removal; reason/acknowledgement before removal; shared Unicode reason validation; lost committed removal response followed by either saved-state refresh or identical removal replay; one remaining guardian and one removal record; unchanged quote/waiver evidence; both themes, phone/desktop widths and region-scoped axe. Run guardian/auth/orders/migrations/payments API regressions for the shared removal schema. Local browser interception does not prove real network loss, email delivery, legal guardianship, physical-device or manual screen-reader acceptance.

### Guardian relationship foundation

Run `tests/migrations.test.ts`, `tests/juniors.test.ts`, `tests/orders.test.ts` and `tests/auth.test.ts` for a schema-27 upgrade preserving order/payment/waiver evidence and junior viewing, one historical relationship per profile with unknown actor, one atomic initial relationship on profile creation, no duplicate on profile reuse, and existing household isolation/name-correction behavior. Verify unique active pairs and account references. Migration 30 changes authority to active explicit grants; acceptance coverage follows below. Explicit removal API coverage is described above; claim workflows and real identity-provider verification remain separate.

### Support-approved profile claims (Planned)

When implementing the approved claim policy, cover actual DOB calendar age immediately before and on the 18th birthday, independently of racing age, using the rider’s recorded time zone rather than support/server time. Cover opposite sides of midnight across zones, missing/invalid recorded time zones preventing approval, and February 29 birthdays remaining ineligible on February 28 and becoming eligible on March 1 in non-leap years; missing/invalid DOB and missing explicit age configuration; no unilateral claim by a viewer or guardian; required product-owner/support approval; no organizer-role override; and audit evidence for approval and the end of guardian access. Support records the verified DOB and rider-confirmed time zone, retaining only a review reference rather than identity-document copies; verify those fields are restricted to the approved support flow. Original orders, prices, payments and waiver evidence must remain unchanged. Do not mark these scenarios passed until the workflow exists and runs. Real identity, DOB provenance, minor-consent and retention approval remain separate gates.

### Guardian write rollback

`tests/guardian-rollback.test.ts` installs rejecting triggers only in per-test disposable databases. Fail the combined initial profile/grant insert and require the enclosing order transaction to roll back; fail acceptance-evidence update after the second grant insert; fail replacement insertion after cancelling the old invitation. Require no partial profile/order/grant, unchanged open invitation and purchase/waiver evidence, no recipient access after failed acceptance, and safe successful retry once the injected failure is removed. Database cleanup follows the existing test harness. These checks establish local transaction rollback, not approved privacy/retention, identity evidence or deletion/support policy; issue [#170](https://github.com/kchan1028/event-registration/issues/170) remains open for those gates.

### Waiver acceptance evidence

Run `tests/orders.test.ts`, `tests/juniors.test.ts` and `tests/migrations.test.ts` for server-derived signer account/declared racing age/time, ignored forged client evidence, identical checkout replay, correction preservation and schema upgrade leaving old evidence unknown. The evidence stays behind existing order authorization. These checks do not establish actual legal age, a valid official waiver, real identity or an approved retention policy. This increment changes data/API behavior, not screens.

### Expired invitation recovery

Run `tests/auth.test.ts` for real expiry at sign-in, no expired-role grant, recipient-only notice access, denial of team access and disappearance after a later grant. `e2e/invitation-recovery.spec.ts` explicitly stubs notice responses for presentation: both themes, 390/1440 widths, panel-scoped axe, load failure and refresh recovery. The browser fixture does not prove real expiry or identity-provider behavior; those remain separate API and external acceptance checks.

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

### Self-service help (Proposed)

Applies once help from [product.md](../../product.md#7-self-service-help-and-guidance) is built; nothing exists to test yet. For a change that adds or edits a guide, help link, or error message: check that each bold label in the guide exists on its screen, that a role-restricted guide is not linked for other roles, that opening help keeps a held place and entered details, and that the support contact is reachable from an unrecoverable error on a phone-width screen, by keyboard, without signing in. Guidance must be visible without hover. Run the browser spec for the changed screen and `e2e/accessibility.spec.ts`.

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

Each pull request records this in its description, naming roles rather than AI tools or agents ([CONTRIBUTING.md](../../CONTRIBUTING.md#change-summary)):

```text
Author: <author>
Verifier: <independent verifier> | Pending (reason)
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
