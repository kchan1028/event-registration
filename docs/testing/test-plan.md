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
- **Full local suite timing:** run `npm run check` and the full `npm run test:e2e` at phase completion, before deployment, or when the owner explicitly requests them. Do not run the full local unit/API or browser suite for each ordinary change; use the targeted checks above.
- **CI.** [CI](../../.github/workflows/ci.yml) runs the typecheck, the full unit and API suite, the build, and the full browser suite on every pull request that changes more than documentation. For a documentation-only change those jobs report as skipped. The `main` ruleset requires both test jobs and the Documentation links job to pass before a merge. Do not repeat CI's full run locally for an ordinary pull request; use the full local suite timing above.
- **Documentation-only changes** run no application tests. Run `npm run check:docs`; CI's Documentation links job also runs it on every change, documentation-only or not, and it is a required check. Fix every broken link or anchor in the same pull request before merging, including one the change exposes in a file it did not edit. Say so in the summary.

### Phase completion and requested full runs

Owner decision, November 17, 2026: reserve full local suite runs for phase completion, predeployment, or an explicit owner request. Before marking a phase complete, run `npm run check` and `npm run test:e2e` on its completion commit and record the commit, commands, results and gaps in the existing pull request or linked test report. Passing automation does not replace that phase's provider, manual or other acceptance gates. An explicitly requested full run records the same evidence. Ordinary changes still require targeted checks, independent verification and required CI; CI's full-suite policy is unchanged.

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

### Category editor drawer

In `e2e/organizer.spec.ts`, verify initial focus and focus return after using the close button at a 390px viewport, where the drawer fills the screen. At 600px, verify that clicking the exposed backdrop closes the drawer and returns focus. The click point must stay outside the settled drawer throughout its opening transition.

### Walk-up phone handoff

`e2e/walkup.spec.ts` verifies separate fictional staff/rider sessions, public event-only URL generation, QR fallback address, unpublished-event suppression, declined payment without bib issuance, participant-owned confirmation and staff check-in with one start-list entry. A separate phone handoff distinguishes a category past its closing time from a full field with an open waitlist. It verifies the closed category cannot be selected and the waitlist join creates no registration, check-in candidate, bib or start-list change. The junior phone handoff checks that check-in blocks bib issuance after the guardian signs and reserves the entry, then allows it after the guardian completes simulated payment in a separate session. Run receipt QR/guardian and check-in browser regressions when changing the shared QR renderer. Existing server tests remain authoritative for windows, day-of pricing, capacity, guardian consent and readiness. A localhost emulation is not physical-phone scanning, real provider operation or a completed race-day rehearsal.

### Volunteer runbook rehearsal

The [check-in guide](../runbooks/race-day-check-in.md) is documentation for existing behavior, not a completed staff rehearsal. Have a second organizer and volunteers use their own role-scoped accounts with fictional data and without developer rescue. Record the source commit, environment, device/role, task, expected and actual result, assistance, defects and untested areas in a dated rehearsal report. Test:

- Correct event/day selection, ready-rider lookup and bib issue; returning to a checked-in rider does not cause another physical bib handover. The scanner cleanup case in `e2e/checkin.spec.ts` delays a synthetic camera stream until after **Stop camera** and verifies the returned track ends and typed lookup stays available. The lookup case simulates denied camera permission and verifies the fallback message, then checks that a typed code still opens the rider and permits check-in. A simulated detector result verifies rider lookup, stream release and an unchanged check-in record. Physical camera, permission prompts and QR decoding still need device rehearsal.
- Duplicate names resolved by the existing confirmation code and listed details; a missing/day-mismatched entry escalates without creating a replacement. Local coverage in `e2e/checkin.spec.ts` uses a fictional volunteer at phone width to verify an ambiguous name leaves the detail panel unopened, selecting each match opens the correct team, racing age and race entries, each code opens the corresponding rider, and only the ready rider receives a recorded bib. The wrong-day case uses a paid rider with an entry on one day to verify the screen blocks issuance and the API refuses it without recording a bib or check-in. Selecting the entered day enables valid check-in without a replacement entry.
- Paid-but-blocked rider, guardian/review requirement and incomplete payment: no bib until the accepted resolution and current readiness permit it. Local coverage in `e2e/checkout.spec.ts` checks the license blocker for a paid rider and verifies that a simulated organizer review allows bib issuance for the same entry. Missing external approval remains a blocked scenario, not a pass.
- Separate-account phone registration, closed/full category and waitlist, failed payment and existing-order recovery without another entry or charge.
- Individual bib correction with preview/reason/issued-bib acknowledgement, physical recovery of an old bib before correction/undo makes its number reusable, escalation when the physical bib cannot be recovered, wrong-rider undo, missing/exhausted ranges and stale/conflicting previews. Local coverage in `e2e/checkin.spec.ts` verifies that missing and exhausted ranges show different recovery instructions and leave the ready rider without a bib or check-in. After an organizer extends the range, the volunteer retries successfully and the earlier assignment is preserved. The wrong-rider undo test exercises cancel, recorded undo and reissue of the released bib to the intended rider using the organizer screen at phone width. The individual correction test changes the configured range after preview, verifies that the stale apply leaves the rider record intact, then verifies that a competing claim prevents applying the proposed bib and preserves both assignments. It applies a fresh preview with a free number without checking the rider in.
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

### Organizer simulation execution controls

Run `e2e/execution-controls.spec.ts`, adjacent plan/impact/receipt/Registrations tests and the affected execution/financial/permission API regressions. The execution check must use the same mode, financial, overlap and test-entry preparation as the writer. Prove separate acknowledgement, duplicate-submit prevention, ignored delayed eligibility responses after a new plan or refresh, committed and uncommitted lost responses, exact retry across refresh, a null read that does not clear intent, actor/event isolation and role revocation. Validate durable refusal replay after temporary blockers clear, a lost refusal response, concurrent duplicate refusals, and known-write rollback versus identity-conflict/unknown-write failure, authoritative saved evidence (including another operator), failed lookup/refresh, blocked/corrupt storage and explicit reset of only completed references. Inspect eligible, pending, refused, blocked and saved states at phone/desktop widths in both themes with automated accessibility. No automatic POST or new identity may resolve an unknown result. These workflow and recovery changes need coverage because cancellation affects capacity and financial test records.

Terminal refusal regressions must cover changed normalized plan input without replacement or a no-action marker, event-scoped identity isolation, authorized replay retaining the original rejecting actor, and migration constraints rejecting mismatched request identities or unsupported statuses.

Public event-detail closure regressions cover empty status before execution, event/day/race selections, exact safe projection including stripping unexpected stored fields for every scope, exclusion of persisted refusals, execution ordering by timestamp and then ID, repeated reads without writes, republishing persistence, unpublished-event refusal and existing unauthenticated-route boundaries. Run execution, order and auth API tests; screen labels are covered below.

Run `e2e/public-cancellation.spec.ts` with checkout and cancelled-receipt regressions for registration labels. Cover event/day/race notices and affected versus unaffected schedule headings, cancellation before capacity/offer promises, disabled new selections/waitlists/packages, explicit uncheck and continuation after a saved package becomes unavailable, offer status check failure with in-page retry and duplicate activation guard, cancellation before retry, a distinct message for superseded offer status responses, signed-out and invalid-token isolation, stale offered-link prefill exclusion, explicit removal of saved selections, blocked restored details and waiver drafts, existing review order after refresh and cancellation, unaffected races, unchanged unresolved reservation payload/retry, refresh failure/retry and historical missing-label fallbacks. Inspect both themes at phone/desktop widths with scoped accessibility checks. No refund or readiness promise follows from these public labels.

For waitlist offer retry, verify focus stays on the checking button, duplicate activation is ignored, a repeated failure updates the same live alert, and a terminal result moves focus before the retry control disappears. Scan the checking state for accessibility. Manual verification requires a screen reader to announce the same failure again after retry and confirm the focus handoff. Track the result in [Accessibility](../../ACCESSIBILITY.md#results) and [issue #213](https://github.com/kchan1028/event-registration/issues/213).

Cancellation CSV download regressions run execution, exports, start-list and auth API tests. Verify event/day/race current filename/header labels, unaffected files and unrelated-event isolation, plans/refusals staying unlabelled, current empty cancelled lists, unchanged CSV header schemas and snapshot bytes/rows, historical download context, DEMO/SAMPLE markers and unchanged export permissions. Timer round-trip and printable-roster/in-file notices are separate gates.

Printable cancellation notices run `e2e/roster-cancellation.spec.ts` and `e2e/roster.spec.ts` with check-in and cancelled-receipt browser regressions, plus cancellation execution/check-in/roster/auth/start-list API tests. Cover event/day/race scope, unaffected days, plan-only exclusion, safe projection, empty-day notices, retained reference-only instructions, screen/print visibility, both themes and phone/desktop containment/accessibility. Each day is independently loaded; no cross-day atomic snapshot, financial settlement or manual assistive-technology acceptance is implied.

Public catalog labels run `e2e/catalog-cancellation.spec.ts` with public registration and research-example browser tests. Cover unlabelled plans, event versus scoped text, configured-count wording, retained keyboard detail navigation, actual themes and responsive accessibility. API regressions cover committed-only safe summary fields, unpublished drafts/events, republishing persistence, unrelated events, public access and shared export classification. Scoped labels must not imply any remaining availability.

Protected CSV audit regressions run `tests/protectedExportAudit.test.ts` with migration, case-study reset, exports, reconciliation, start-list and auth tests. Verify actor and event attribution for authorized GETs, current and historical scope, no record for HEAD or a denied or invalid request, and no file sent when auditing fails. Upgrade starts with an empty audit, and case-study reset removes only its own fictional rows. Financial and entry evidence must remain unchanged.

Local reconciliation CSV changes run `tests/reconciliation.test.ts` with exports/payments/refunds/auth/orders/lookup regressions. Cover all four source kinds, missing versus zero amounts, references and exact stored timestamps for each source, chronological ordering with source kind and record ID as tie-breakers, simulated and Stripe test-mode payment attempts, inactive orders, unlinked/unrelated exclusion, safe finance-only fields, formula escaping, repeat-read business record nonmutation, generation/filename metadata and existing ledger authority. Fixtures with provider records are fictional local evidence, not a real sandbox or settlement test. Run `e2e/reconciliation-download.spec.ts` with case-study and refund-policy browser regressions for the organizer control. Verify actual file name/content and event-wide scope despite registration filters, interpretation guidance, preparing status color and ARIA-disabled state with retained keyboard focus, and exactly one request after a repeat Enter during preparation and completion of the initial download, a 44px action target, failure/retry, owner/finance visibility, unpublished-event hiding and the actual server denial after revocation. Inspect the changed region in both actual themes at phone/desktop widths with accessibility/containment checks. Physical-device and manual assistive-technology acceptance remain separate.

### Atomic simulated cancellation

Run `tests/cancellationExecution.test.ts`, migration tests and affected order/payment/refund/waitlist/transfer/summary/export/start-list/auth regressions. Cover separate acknowledgement, original partial-package allocation and fees, atomic rollback after refund work, two-application concurrent replay, request/plan conflicts, current roles and revocation, stale/unreviewable/unsupported financial state, test-entry refusal, and event/day/race closure through republishing/new categories, blocked placement moves into/out of closed scopes and blocked publication of an earlier draft move. Day selection must hash identically after database JSON round trips. Live holds block; late payment after expiry and cancellation must enter review without restoring entries. Active waitlists/offers are removed, snapshots remain historical and current start-list revisions omit cancelled rows.

Run `e2e/cancellation-execution.spec.ts` and adjacent receipt/Registrations preview regressions. Cancel through the API, verify receipt/organizer labels, separate cancelled counts and absent readiness/check-in promises when no active entries remain; inspect both themes at phone/desktop widths with scoped automated accessibility. This new state needs browser coverage even though no execution control is added. Cancelled entries with reviewed or unreviewed licenses must not be ready, check in or receive manual/automatic bibs; retain earlier audit history and allow the existing acknowledged correction of an already-issued bib without restoring readiness. Status and cancellation timestamp must be constrained together. Schema upgrades must infer no execution or refusal history; fixture reset must preserve unrelated terminal refusals. Schema upgrade must infer no execution, and fixture reset must preserve unrelated execution evidence. Provider/credit/message execution and real-device/manual acceptance remain separate gates.

### Cancellation execution financial preflight

Run `tests/cancellationFinancialPreflight.test.ts` with the existing confirmation/allocation and affected auth/refund/payment tests. The new preflight needs proof that a financially eligible partial-package assessment preserves original paid allocations, untouched entries and all write-side evidence. Cover stale/unreviewable plans, held/unsettled orders, absent/credit/rider-choice policies, missing/mismatched settlement, provider references/sessions/events, failed and nonfailed refund history, and current finance authority/revocation/event isolation. Repeated/concurrent reads must change nothing; unknown infrastructure failures must propagate instead of claiming eligibility. Eligibility remains simulation-only, the standalone preflight makes no provider call and is not execution authority, and no browser change is included.

### Reviewed cancellation plan confirmation

For the screen, run `e2e/plan-confirmation.spec.ts`, `e2e/cancellation-preview.spec.ts` and adjacent `e2e/refund-policy-preview.spec.ts`. Cover reason/acknowledgement validation, busy duplicate refusal, a committed lost response across order changes/refresh, identical retry, server-verified saved lookup/error/focus recovery, explicit separate review for an unavailable completed reference without replacing evidence, historical scope labels, stale-impact re-review and request-conflict preservation. Verify actor/event isolation, no automatic resend, blocked-storage page-only recovery, corrupt-data refusal and no payment/refund/entry side effects beyond explicit test actions. Inspect form/record, pending, failed-lookup and blocked/corrupt storage states at phone/desktop widths in both themes and scoped automated accessibility. Physical-device/screen-reader/provider acceptance remains pending.

Run `tests/cancellationConfirmations.test.ts`, `tests/cancellationAllocations.test.ts`, `tests/migrations.test.ts` and affected auth/financial/capacity risk-table files. Cover fresh versus changed publication/capacity/transfer/hold/financial state, no-record classification for removed scopes and unreviewable fresh data, historical replay before that failed review, effective hosted-session expiry, unchanged nominal totals after refund changes, day/race JSON round trips, normalized Unicode reasons and explicit plan-only acknowledgement. Verify concurrent same-request confirmation across two app instances yields one record, changed payload conflicts, historical exact replay retains actor/time after state changes, current finance access/revocation and event isolation, failed-insert rollback and schema-33 upgrade without inferred confirmations. Validate request-ID Unicode character bounds against database constraints. Run `tests/case-studies.test.ts` and verify generated-fixture reset after plan review preserves unrelated evidence and waits for held event locks. Preview/confirmation changes no entries, capacity, waitlists, payment/refund/provider/message state. Actual execution/overlap safety, settlement, retention and manual acceptance remain separate gates.

### Cancellation operational impact

Run `e2e/cancellation-preview.spec.ts` and the adjacent `e2e/refund-policy-preview.spec.ts` for screen changes. Use actual API data for published-versus-draft labels, startup registration loading, scope changes, failed-request retry with preserved focus, duplicate busy activation, ignored old responses, cleared results after withdrawal, empty results and finance/manager visibility. Reject a request crossing publication and verify retry. Check no refund is submitted, paid order remains unchanged by preview, both themes at phone/desktop widths, horizontal containment and scoped automated accessibility. Screen-reader/physical-device and real-provider acceptance stay separate.

Run `tests/cancellationAllocations.test.ts` with capacity, waitlist, order, transfer, start-list, auth, refund and payment regressions. Cover paid/held selection, unaffected package components, original paid allocations, shared-pool distinct riders retained in unaffected components, active versus expired/accepted waitlists, linked-offer audience de-duplication, event-wide references to removed races, immutable snapshot references and no contact/token disclosure or mutation. Validate strict published scope and owner/finance access. Hypothetical capacity includes test reservations and offers and must not be presented as availability for resale. This API does not establish provider reconciliation, message delivery, confirmation/execution or manual acceptance.

### Paid cancellation allocations

Run `tests/cancellationAllocations.test.ts` with the financial risk-table files, auth and transfer regressions. Cover current published event/race/day selection after transfer, original discounted quote allocation and accepted policy after republishing, excluded whole-order fees, unchanged unaffected package component, no order/payment/refund mutation, and explicit credit/rider-choice/missing-policy review. Refuse unsigned/non-finance/cross-organization requests, mixed or unknown scope fields and race/day IDs not in the published event. Verify unpaid holds and withdrawn entries are outside this confirmed-paid-only view, and nonfailed refund history requires reconciliation without a payout suggestion; failed-only history does not add that flag. Cover published placement changes, transfer targets added after purchase and unpublished draft changes. Unknown current placement must block even a different race scope because exclusion cannot be established; a selected entry with no accepted price allocation must fail for review rather than inventing amounts. This is not the full cancellation impact/confirmation/execution, credit ledger, refundable-balance computation or communications workflow; it establishes no provider/physical/manual acceptance.

### Whole-order refund-policy preview

Run `tests/refundPolicy.test.ts` and `tests/refunds.test.ts` with payment/order/pricing/coupon regressions. Cover inclusive deadlines in the accepted event time zone, rounded integer-cent percentages, paid bundle allocations and excluded fees, frozen rules after republishing, distinct organizer cancellation/withdrawal outcomes, missing structured policy, credit/rider-choice review, unpaid/unreconciled orders, a still-confirmed order with withdrawn/inactive entries, existing refunds, owner/finance permission and outsider/other-role denial. Preview must preserve entries, quote, waiver evidence and refund history and never call the provider. It is a whole-order read-only preview, not a partial race/day cancellation, credit ledger or policy enforcement.

Run `e2e/refund-policy-preview.spec.ts` with failed-refund/refund-recovery browser regressions for the finance screen: actual accepted policy responses for cash, credit, rider choice and absent rules; network failure/retry with retained keyboard focus; busy state and ignored repeated activation; a delayed pre-withdrawal response discarded after fresh review-only results; explicit scenario and whole-order scope; unchanged amount field and zero refund POSTs; same-page entry withdrawal invalidating an in-flight preview and subsequent inactive-entry review guidance; fresh results after returning from entry scope; no order/waiver/payment mutation; both themes at 360/390/1440 widths and region-scoped axe. The screen does not establish manual screen-reader, real-provider or physical-device acceptance.

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

### Support-approved profile claims

Run `tests/profileClaims.test.ts`, `tests/migrations.test.ts` and guardian/auth/order/payment/rollback regressions. Cover the day before and exact 18th birthday in the rider’s recorded zone, midnight across zones and February 29 becoming eligible on March 1 in non-leap years; racing age must not substitute for DOB. Require explicit age 18 and an account-ID support allowlist, with no default/operator-role inheritance. Refuse missing/invalid DOB/zone, unsigned/unallowlisted/organizer/guardian/viewer/rider approval, self-approval, a missing claimant account or an active-guardian claimant. Strict input accepts a reference, not identity-document copies.

Verify schema 31 upgrades preserve grants/viewers and infer no DOB/claims; unique profile/request and account/profile references; atomic revocation of both guardians, retirement of viewing and pending invitations; claimed rider order authority; unchanged order/price/payment/waiver evidence and original placer; identical/changed and concurrent replay, including preserved rider-supplied zone aliases rather than runtime canonical names; invitation acceptance racing approval; and rollback when a later viewer write fails. Probe constraints and deletion restrictions only in disposable databases. Run guardian acceptance/management and checkout browser regressions for shared authority SQL. No claim screen, real identity/legal age, minor-consent/retention approval, manual support rehearsal or deletion procedure is established by these tests; issue #170 remains open.

### Post-claim junior checkout

Run the post-claim cases in `tests/profileClaims.test.ts` with claims/guardian/auth/order/migration and affected checkout regressions. Refuse either former guardian, including one removed before the later claim or on a source profile later merged through a chain into the claimed profile, for the claimed profile’s saved normalized block name (case/accent/whitespace and legacy-key coverage), including a later profile correction that must not bypass the recorded-name block. Refusal must preserve original paid order/waiver/quote and create no order, entry, profile, grant or hold; client-supplied review flags grant no bypass. Keep unrelated same-name households and a different child available. Race claim approval against a new junior checkout: either the new order commits first under the original profile and transfers with it, or checkout is refused; no replacement profile/grant survives. Also cover checkout committing first deterministically and the claim-first refusal; the parallel test checks the serialization invariant without assuming scheduler order. Existing nonce replay remains subject to current authority. Verify schema-32 upgrade captures only a current enforcement-name baseline for old claims, preserves all original approval evidence, and automatically captures new names when an older writer omits the new column. Migration 33 also indexes the historical account/profile lookup; no historical claim-time name, DOB or review evidence is inferred. No review queue, real identity proof or unblock procedure is established.

### Guardian write rollback

`tests/guardian-rollback.test.ts` installs rejecting triggers only in per-test disposable databases. Fail the combined initial profile/grant insert and require the enclosing order transaction to roll back; fail acceptance-evidence update after the second grant insert; fail replacement insertion after cancelling the old invitation. Require no partial profile/order/grant, unchanged open invitation and purchase/waiver evidence, no recipient access after failed acceptance, and safe successful retry once the injected failure is removed. Database cleanup follows the existing test harness. These checks establish local transaction rollback, not approved privacy/retention, identity evidence or deletion/support policy; issue [#170](https://github.com/kchan1028/event-registration/issues/170) remains open for those gates.

### Waiver acceptance evidence

Run `tests/orders.test.ts`, `tests/juniors.test.ts` and `tests/migrations.test.ts` for server-derived signer account/declared racing age/time, ignored forged client evidence, identical checkout replay, correction preservation and schema upgrade leaving old evidence unknown. The evidence stays behind existing order authorization. These checks do not establish actual legal age, a valid official waiver, real identity or an approved retention policy. This increment changes data/API behavior, not screens.

### Expired invitation recovery

Run `tests/auth.test.ts` for real expiry at sign-in, no expired-role grant, recipient-only notice access, denial of team access and disappearance after a later grant. `e2e/invitation-recovery.spec.ts` explicitly stubs notice responses for presentation: both themes, 390/1440 widths, panel-scoped axe, load failure and refresh recovery. The browser fixture does not prove real expiry or identity-provider behavior; those remain separate API and external acceptance checks.

### Fictional weekend close-out

`e2e/case-studies.spec.ts` follows a fictional two-day purchase through organizer license review, weekend bib reuse, repeat check-in and locked per-race CSV downloads. After a second-day withdrawal and simulated partial refund, verify the exact remaining entry with its original bib and checked-in status in the current export, the removal in the lock revision, one refund ledger row and identical saved CSV contents. Timer import, provider reconciliation and staff rehearsal are separate acceptance gates.

### Concurrent bib allocation

Run `tests/automatic-bibs.test.ts` with check-in, bib reassignment and start-list regressions. Queue a pending post-close job, a desk check-in and an overlapping bulk apply behind the same event advisory lock in a disposable database. Verify all three are waiting before releasing the lock. The lock order is not prescribed. If the bulk request applies first, preserve every previewed bib. If another writer assigns a selected rider first, refuse the batch with no partial assignment. The adjacent check-in tests also exercise successful apply and stale fingerprint rejection directly. Verify one active bib per rider, no duplicate bibs in the weekend scope, one desk check-in and a completed automatic job.

### Rider check-in code retrieval

`e2e/sign-in.spec.ts` completes fictional checkout and simulated payment, then uses a fresh phone-sized session to verify that the registration history screen prompts for sign-in. The rider signs back in and opens the confirmed receipt, which shows the original check-in code and QR. This uses the local test provider; real emailed-code delivery and race-morning timing require an operational rehearsal.

### Organizer handoff rehearsal

`e2e/handoff.spec.ts` rehearses existing team controls with separate fictional accounts: successor first sign-in, preparatory membership, cancel/confirm, one actor-attributed transfer, outgoing retained Registration manager access with owner/team/ledger denial, successor check-in and saved start-list export. Run the existing ownership-transfer case in `tests/auth.test.ts` and the organizer sign-in browser regression. Reload both sessions after membership changes. An automated rehearsal is not actual Clerk delivery, staff independence, provider settlement handoff or timer acceptance. Human acceptance still follows section 5 and the [handoff guide](../runbooks/organizer-handoff.md).

The timer handoff in `e2e/handoff.spec.ts` uses a separate fictional Timer and exports account. Lock and download the selected race, verify the server denies check-in reads/writes and ledger download for that account, then issue a bib from the organizer session. Confirm the timer sees the bib revision while the locked CSV remains byte-identical. Actual timing software import and timer acknowledgement remain manual.

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

### Phase 2 Stripe sandbox acceptance

Use the [Stripe sandbox rehearsal](../runbooks/local-setup.md#phase-2-stripe-sandbox-rehearsal) with the owner's existing sandbox and a disposable fictional local event. Record real signed notification and refund evidence, exact reconciliation by provider reference, and any blocked scenarios separately from local fixture results. Test mode does not establish live settlement or payout acceptance.

### Local logical restore rehearsal

Use the [isolated restore procedure](../runbooks/local-backup-restore.md) with fresh fictional source/target/rejection databases. Verify table hashes/counts and selected schema/sequence metadata before opening the recovered application. Verify health, persisted check-in/bib and start-list lock, paid-but-blocked readiness and repeat-safe operations. Then confirm attributed export rows survive and a new ledger download appends one row without rewriting restored audit or business records. Reject a populated source and demonstrate single-transaction rollback on a deliberate target conflict. Confirm cleanup after a partial failure touches only databases whose successful creation was logged; skip uncreated names. A second operator repeats it with a new run ID. Do not touch working/hosted databases or use real rider records. Application suites need not run for procedure-only documentation; execute the specific rehearsal instead. Keep individual results and limits in the PR/rehearsal record. Hosted backups, off-site copies, recovery objectives, provider reconciliation and staff acceptance remain separate gates.

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
