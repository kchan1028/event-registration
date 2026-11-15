# Roadmap: cycling race registration

Status: Proposed; no migration or delivery date committed  
Date: November 14, 2026  
Related brief: [product.md](product.md)

## Delivery status

Status values: Planned, In progress, Implemented, Verified, Blocked. Work is Verified only after its acceptance criteria or exit gate have been checked. See [docs/documentation-guide.md](docs/documentation-guide.md#status-vocabulary).

| Item | Status | Notes |
|---|---|---|
| Repository and documentation foundation | Implemented (November 14, 2026) | Supporting work, not a roadmap phase. |
| Demo purchase flow fixtures | Implemented (November 14, 2026) | Fake events, riders, fees, worked order totals, and sample waiver text in [docs/fixtures/](docs/fixtures/README.md), used by the rider demo. Phone numbers corrected to 10 digits to match the fixture's own phone rule. |
| Category builder milestone (organizer prototype) | Implemented (November 14, 2026); partly verified | Local-only prototype. See [Category builder milestone](#category-builder-milestone). |
| Rider checkout prototype and demo purchase flow (2a) | Implemented (November 14, 2026); partly verified | Simulated payment only. Meets the [2a](product.md#2a-clickable-demo-purchase-flow--phase-1) behavior in automated tests, including both display themes; usability testing with people is not done. See [Rider checkout prototype](#rider-checkout-prototype). |
| Race-day check-in prototype | Implemented (November 14, 2026); partly verified | Local only, fake riders. Ready/blocked result, bib ranges, bib history, repeat-safe check-in. Automated tests written; usability test with volunteers not done. See [Check-in prototype](#check-in-prototype). |
| Start lists and sample timer export | Implemented (November 14, 2026); partly verified | Local only, fake riders. Per-race start lists, numbered snapshots with changes since the last one, and a sample CSV. The format is not agreed with a timer and has not been round-tripped. See [Start lists and timer export](#start-lists-and-timer-export). |
| Automated accessibility checks | Implemented (November 14, 2026) | axe-core WCAG 2.2 A and AA checks on the main organizer, check-in, and rider screens in both themes, in CI; two issues fixed. Keyboard, screen-reader, and real-phone passes are not done. See [ACCESSIBILITY.md](ACCESSIBILITY.md#results). |
| Light and dark display themes | Implemented (November 14, 2026); partly verified | Organizer and rider prototype screens: system default, header toggle on every screen, saved per device, applied before first paint, light palette for print. Token contrast checked against WCAG 2.2 AA in the browser; the rider demo has an automated theme switch test. The check-in screen uses it, with fixed high-contrast result fills for sunlight. |
| Timer export review packet | Implemented (November 14, 2026) | Column list, sample CSV of fictional riders, and ten questions for the timer and officials in [docs/timer-export-review.md](docs/timer-export-review.md). Not yet sent; the timer's acceptance is a Phase 1 exit gate item. |
| Phase 1 usability test kit | Implemented (November 14, 2026) | Recruiting, setup, facilitator script, core and optional tasks per role, scoring for the 90% gate, and a results summary template in [docs/usability/](docs/usability/README.md). No sessions have been run. |
| Phase 0: Establish the case to build | In progress | The [discovery kit](docs/discovery/README.md) is implemented (interview guides, workflow map, workload baseline, options comparison, USAC and payment questions, pilot selection, decision memo). No interviews, observations, or measurements have been done, no owners are named, and nothing has been sent to USAC or payment providers. The category builder milestone was built ahead of this gate at the owner's request; it does not replace discovery. Next actions are listed at the end of this document. Send-ready versions of the outreach questions: [questions for USA Cycling](docs/usac-questions.md) and [payment model questions](docs/payment-model-questions.md). |
| Phase 1: Test the experience without live money | In progress | Organizer event builder, rider checkout (one day, both days, junior, uncertain license), and the registration exception queue are implemented as prototypes. The race-day check-in prototype and sample timer exports are implemented too. Usability tests with people have not been run (the [test kit](docs/usability/README.md) is ready). A [pilot run of the kit](docs/usability/pilot-run-2026-11-14.md) on November 14, 2026 completed every task, fixed five problems (including check-in ignoring Enter from a scanner), and corrected the kit; it is not gate evidence. The export format is not yet agreed with a timer. |
| Phase 2: Build the registration core | Planned | Depends on Phase 1 and a settled payment model. |
| Phase 3: Make race day operable | Planned | USAC acceptance gates live sanctioned use. |
| Phase 4: Run a controlled live pilot | Planned | Depends on Phase 3. |
| Phase 5: Prove a two-day weekend and handoff | Planned | Depends on a successful Phase 4. |
| Phase 6: Expand only from observed demand | Planned | P2. |

## Category builder milestone

Built November 14, 2026, on the stack in [ADR 0001](docs/decisions/0001-stack-for-category-builder-milestone.md). It covers the organizer side of the [road race and criterium category builder](product.md#1a-road-race-and-criterium-category-builder--p0) and runs only on a local computer. Setup: [docs/runbooks/local-setup.md](docs/runbooks/local-setup.md).

**Implemented:** organizations and draft events from road race, criterium, and two-day weekend templates; editable race days and races; categories that can be created, duplicated (flagged for review), reordered, archived, and edited; structured eligibility (AND within a path, OR between paths, organizer review and guardian flags); prices with scheduled changes and day-of surcharge; registration windows; distance, laps, or minutes plus laps; start groups with start and staging times and field limits; separate classification codes; category caps and shared capacity pools; simulated test entries that exercise the limits; a rider-facing preview with an eligibility checker; validation that blocks publishing on errors and requires warnings to be acknowledged; immutable published versions; autosaved drafts in SQLite with stale-save protection; labeled demonstration data.

**Verified by automated tests** (Vitest unit and API tests, Playwright end-to-end tests, all passing on November 14, 2026):

| Acceptance criterion in product.md | What was checked |
|---|---|
| Shared field cap | Caps of 40 and 40 with a combined 60: 35 entries in one leave 25 in the other; the 61st rider is refused; two simultaneous requests for the last place across two database connections give exactly one entry |
| Category eligibility | Masters age and license category, competition class, collegiate path, and junior age bands evaluate independently; unknown data returns review, never cleared |
| Timed criterium | 45 minutes + 3 laps displays as entered with no invented distance (export not built) |
| Category configuration fixtures | Elite P/1/2, Masters 35+ Cat 3/4, Masters 50+ and 60+ sharing a start, women's combined criterium, junior bands, collegiate plus domestic field all load, validate, and behave as listed |

**Implemented, not yet verified with organizers:** "Publish a weekend" and "Recreate a race schedule" pass end-to-end tests with example data, but the criteria require an organizer to do it with an approved schedule and no developer help. That is a Phase 1 usability test.

**CSV import and export (added November 14, 2026):** template download, column matching by name with manual override, per-row errors by line number, import of valid rows only after confirming the skipped ones, start and display groups matched or created, and an export in the same format. Eligibility comes only from explicit columns; a name that looks like a rule but has no license column gets a warning. Verified by unit tests (including a full export and re-import of the demonstration weekend) and a Playwright test. Format: [docs/csv-category-format.md](docs/csv-category-format.md).

**Change impact preview (added November 14, 2026):** after a version is published, **Review and publish** compares the saved draft with it and lists every category with entries whose rules change (who can enter, start group, start or staging time, race length, timer code, cap, field limit, capacity pool, price, availability, or registration window), with paid entries, held places, orders, and rider names. Publishing such a change needs a separate "I have reviewed who these changes affect" tick, and the preview says paid entries keep the price and rules they were sold under and when the start list needs a new snapshot. Covered by unit and API tests in `tests/impact.test.ts` (run in CI); checked by hand in the browser: a price change on a category with a paid order showed that rider, and after publishing the order kept its original total. The server refuses such a publish without the acknowledgement, as it does for warnings. The resolution workflow (contacting riders, transfer, refund) is not built.

**Not built yet (still required by product.md):** a guided resolution workflow for entries affected by a published change (organizers can transfer or withdraw affected entries one at a time from Registrations); bulk edit and copy-day; category-specific questions, waivers, and bib ranges; rider registration and checkout; exports.

**Pending external dependencies, shown as pending in the interface:** USA Cycling license and waiver checks, payments, and sign-in with required MFA. Until sign-in exists the prototype must not be hosted or shared.

## Rider checkout prototype

Built November 14, 2026, on the same stack. It covers the Phase 1 deliverable "clickable rider checkout for one day, both days, a junior entry, and an uncertain-license case" and the organizer exception queue, with **simulated payment only**.

**Implemented:** a rider registration page for the latest published version; an "about you" check that marks every category as qualifying, needing organizer review, or not eligible, with the full schedule still visible; a start-ordered schedule that flags same-start, overlapping, tight-recovery, and unknown-finish conflicts; a live order summary with bundle and additional-race discounts under the precedence rule in product.md; rider details entered once; guardian details and guardian waiver acceptance for junior entries; a versioned sample waiver; places held for 10 minutes for the whole order, all or nothing; simulated payment with decline and retry; idempotent payment notifications; confirmation with a check-in code and a readiness checklist per entry; an organizer Registrations view filtered by license review, needs attention, and unpaid holds, where an organizer records a license review with a reason and sees each paid order's check-in code; bundle, discount, recovery, refund policy, and waiver settings in event setup.

**Verified by automated tests** (Vitest and Playwright, all passing November 14, 2026):

| Acceptance criterion in product.md | What was checked |
|---|---|
| Buy both days | One set of rider details; both entries, the bundle discount, and the total shown before payment; confirmation lists both races |
| Last-place checkout | A held place counts toward shared limits, so a second rider cannot take it; an expired hold releases the place |
| Payment retry | Repeating a payment notification, or sending a second one, creates no second confirmation, entry, or check-in code; a repeated order request returns the same order |
| License uncertainty | An unknown license is marked for organizer review and never shown as valid; paying does not clear it |
| Multi-race discount | Two non-conflicting criteriums get the additional-race discount exactly once and stay distinct entries |
| Mixed-category weekend bundle | Each day's category passes its own rules; if any place is full, nothing is held |

**Berkeley Omnium package (added November 14, 2026):** implemented demo bundle for both races at an organizer-set fixed price of $130 ($80 road race + $60 criterium separately, saving $10), with a separate podium nomination saved in the accepted order quote. Nomination remains subject to organizer review. Pricing and order snapshot tests cover both-day pricing, single-day exclusion, an extra criterium entry, and simulated confirmation. Award rules, approval tools, and points/results calculation remain unbuilt.

**Registration windows (added November 14, 2026):** checkout refuses categories outside their opening and closing times, read in the event's time zone; a hold taken while a window is open can still be paid within the hold, and a late payment after the window closed goes to the organizer's queue. Demo events can let testers register at any time; the rider page then says "Demo mode" and when real registration opens. Verified by unit, API, and Playwright tests.

**Organizer-managed waitlists (added November 14, 2026):** the organizer turns a waitlist on per category in the category editor. A full category with a waitlist lets a rider join from the race list (name, email, and the "About you" answers, checked for eligibility). While anyone waits or holds an offer, the category is not sold to the public. On **Registrations**, the organizer offers a place to the next rider once a place is free; the offer holds it for 24 hours and gives a private link that preselects the category at checkout. Paying marks the offer accepted; an unused offer expires. Covered by unit and API tests in `tests/waitlist.test.ts` (run in CI) and checked by hand in the browser from joining through to a confirmed order. Not built: email delivery of offer links (the organizer copies the link), automated promotion, and charging.

**Organizer transfers and withdrawals (added November 14, 2026):** on **Registrations**, each paid entry has **Transfer** and **Withdraw**, both requiring a reason. A transfer rechecks eligibility, capacity, the waitlist, schedule conflicts, and the guardian waiver, then moves the entry; a withdrawal frees the place, removes the entry from start lists and check-in, and shows "Withdrawn" on the rider's confirmation. Neither changes the order total: each change is logged with what was paid for that entry (after discounts), the new category's price, and the difference owed or due, to settle outside the app. Covered by API tests in `tests/transfers.test.ts` (run in CI) and checked by hand in the browser (a bundle entry moved to a $50 category showed $41.67 paid and $8.33 owed; a withdrawal logged $33.33 paid with no refund processed). A transfer keeps any bib already issued, including when it moves the rider to another race day (decided by the project owner, November 14, 2026). Not built: real refunds and rider-initiated change requests.

**Not built yet:** real payments, refunds, and payouts; rider accounts and access to past receipts; rider-initiated change requests; emergency contact collection (deferred until role-based access exists); email receipts. (Check-in and bib assignment: see [Check-in prototype](#check-in-prototype); start lists and exports: see [Start lists and timer export](#start-lists-and-timer-export).)

**Pending external dependencies:** a payment provider, USA Cycling license and waiver checks, and sign-in with required MFA. Rider data entered in the prototype stays in the local database; use made-up details.

**Demo purchase flow (product.md 2a), added after the first checkout build:** a browse-events step; the four fixture riders as a demo rider picker that prefills racer details; emergency contact; a waiver that must be read to the end (or confirmed) and signed with a typed name plus a checkbox, signed by the guardian for a minor; "Complete simulated payment" with no "Pay" or "Buy" buttons; a persistent "Demo" label, "Simulated payment: no money is charged" on review, payment, confirmation, and receipt, a DEMO order number, and a watermarked receipt; an error summary at the top of each step with field-level messages from the fixtures; a progress indicator that returns to completed steps without losing data; the fixture events, capacities, fees, second-race discount, and fixed-price weekend bundle.

| 2a check | How it was verified |
|---|---|
| Worked order totals ($59.65, $80.25, $18.45, $39.05) | Unit tests on the quote and API tests on real orders |
| Full category, ineligible category, minor without guardian, half-selected bundle | Unit and Playwright tests |
| Missing required fields block progress with field messages and a summary | Playwright test |
| Back navigation keeps entered data | Playwright test |
| Simulated labeling on every payment-related screen and the receipt | Playwright test |
| Uncertain license is paid but not cleared | API and Playwright tests |

**Still open for 2a:** the "without facilitator help" part needs a usability test with people. Display themes come from the shared theme work (PR #11) and the rider screens now carry the same header toggle.

**Three-day series demo specification (November 14, 2026):** Previously requested Planned fixture using Berkeley category definitions with a Friday TT ($50), Saturday road race ($80), Sunday criterium ($60), and a $160 all-three package. No executable fixture exists. Time-trial model and scheduling support, approved category rules, dates, fees, and award requirements must be resolved before implementation. This adds no live series capability or change to phase priority. The current [events.md reference](docs/fixtures/events.md) lists only standalone Berkeley road race and criterium examples; the series is not part of that reference.

**Standalone Berkeley local demo (November 14, 2026):** implemented dedicated seed for separate published road-race ($80) and criterium ($60) events, with no package, fees, surcharges, or prefilled entries. Unit/API tests cover category references, prices, persistence, and safe reruns. [Demo setup](SETUP.md) documents a dedicated local database. Existing sample loaders remain available; no live capability or phase priority changes.

## Check-in prototype

Built November 14, 2026, on the same stack, building on the rider checkout prototype. It covers the Phase 1 deliverable "check-in prototype showing ready/blocked states and bib assignment" and part of [product.md section 5](product.md#5-race-day-operations). Fake riders only; open it from the builder rail under **Race-day check-in**.

**Implemented:** search by name, team, bib, or check-in code (with or without the dash; a code that matches one rider opens it on Enter); a ready/blocked result that needs a confirmed simulated payment and every readiness item for that day's entries, so an unreviewed license blocks and paying alone never clears a rider; blockers that tell the volunteer to send the rider to the registration desk rather than override; bib ranges for the whole event or per race day; the next free bib or a chosen one, with no two active riders on the same bib in a range (enforced by a database index); repeat check-in returns the first time and bib; bib changes need a reason and keep the history; a day summary (riders, checked in, blocked, bibs issued); fictional demo riders for a published demo event. Volunteers see name, team, racing age, entries, readiness, and bib only: no email, phone, emergency contact, license number, or payment amount.

**Verified:** checked by hand in the browser on desktop and phone widths in both themes. Automated tests in `tests/checkin.test.ts` cover the rules, bib collisions and ranges, repeat check-in, bib history, per-day bibs, code lookup, and the absence of contact and payment details; they run in CI. A Playwright test (`e2e/checkin.spec.ts`) checks that Enter right after a scanned code or a unique name opens that rider, and that a blocked rider gets no check-in button.

**Not built yet:** QR scanning with a camera; sign-in and the check-in volunteer role (anyone with the local app can use the screen); rider identity across separate orders (two orders for one rider count as two riders); undoing a check-in; measured check-in times.

**Printable fallback roster (added November 14, 2026):** **Fallback roster** on the check-in screen opens a print-ready page with one section per race day: every rider by surname with team, racing age, races in start order, status (checked in, ready, or NOT READY with the reason), and bib; an exception checklist of blocked riders with what is missing, what to do, and a space to record who cleared it; and blank rows for riders not on the list. Each section shows when it was printed and that later changes are not shown. It prints black on white whatever the screen theme, and carries no email, phone, emergency contact, license number, or payment amount. A blocked rider is never printed as cleared, even with a check-in on record. Covered by unit tests (`tests/roster.test.ts`) and a Playwright test that run in CI; checked by hand in the browser at desktop and phone widths. A paper print through a real printer has not been checked, and the roster has not been used in a rehearsal.

## Start lists and timer export

Built November 14, 2026, building on the check-in prototype. It covers the Phase 1 deliverable "timer export samples" and part of [product.md section 5](product.md#5-race-day-operations). Open it from the builder rail under **Start lists and timer export**.

**Implemented:** a start list per race from confirmed entries only (unpaid, cancelled, and released entries and simulated test entries are left out), in start order with bibs from check-in; numbered, timestamped snapshots tied to the published schedule version; changes since the last snapshot and between snapshots (added, removed, changed bib, category, start group, start time, name, team, or license number), matched by stable entry ID; a sample CSV per race, per snapshot, or for all races in one file. Columns: race date, race, start time, start group, category code, category, race length as configured (for example "45 min + 3 laps", never an invented distance or finish time), bib, last and first name, team, license number, racing age, competition class, license status, checked in, entry ID, rider ID. Values that a spreadsheet would run as a formula are prefixed with an apostrophe. No email, phone, guardian, emergency contact, or payment data is exported.

**Verified:** checked by hand in the browser. Automated tests in `tests/startlists.test.ts` cover CSV quoting and formula guarding, start order, the diff, confirmed-only rows, snapshots and later changes, CSV headers and stable IDs, and the absence of contact data; they run in CI.

**Not built yet:** a format agreed with the actual timer and a round trip through timing software (the open research questions in [product.md](product.md#results-site-updates-research)); a start-list lock; the timer/export role and sign-in (anyone with the local app can download); rider identity across separate orders.

## Delivery approach

Validate that the product saves volunteer time before building a replacement registration system. Deliver in dependency order, using phase exit criteria rather than a fixed launch date. Do not anchor the first live use to Berkeley Omnium's registration opening.

Effort ranges below are planning estimates for a dedicated product engineer with part-time design, QA, and organizer input. They are not calendar commitments. External approvals, payment onboarding, and event availability can extend delivery. Re-estimate after discovery; an intermittently available volunteer team will need longer.

## Phase 0 — Establish the case to build

Indicative effort: 2–3 weeks. Priority: P0.

Deliverables:

- Observe the current registration workflow and interview the race director, registration lead, treasurer, timer, and at least five riders/parents.
- Map the road race and criterium setup, shared fields, discounts, changes, exceptions, check-in, and exports.
- Measure organizer hours, check-in times, errors, and support requests.
- Compare improving the current setup, purchasing additional support, and building a new platform.
- Contact USAC about integration and accepted waiver/license processes, including future access to pull waiver status and validate licenses. Assess payment-provider operating models.
- Research how results reach road-results.com for comparable events: who uploads, the CSV columns that matter, and whether the timer export can serve both. See [product.md](product.md#results-site-updates-research).
- Identify a smaller pilot event, its accountable organizer, and a support owner.

Exit gate: A specific, recurring problem has a measurable workload cost; a custom product has a credible advantage; a team and budget exist; external requirements have named owners. If not, recommend improving the incumbent workflow and stop the build.

Tools: the [discovery kit](docs/discovery/README.md) has a file for each deliverable and a [decision memo](docs/discovery/decision-memo.md) that records the exit-gate evidence. Phase 0 is Verified only when the product owner signs that memo.

## Phase 1 — Test the experience without live money

Indicative effort: 2–3 weeks. Depends on Phase 0. Priority: P0.

Deliverables:

- Clickable rider checkout for one day, both days, a junior entry, and an uncertain-license case.
- End-to-end demo purchase flow on fake demonstration data: browse events, choose an entry, racer details, waiver signature, order review with fees, clearly labeled simulated payment, and confirmation with registration details, waiver status, and receipt. Uses the fixtures in [docs/fixtures/](docs/fixtures/README.md). See [product.md](product.md#2a-clickable-demo-purchase-flow--phase-1).
- Organizer event builder and registration exception queue prototype.
- Check-in prototype showing ready/blocked states and bib assignment.
- Light and dark themes with a toggle that defaults to the system preference and remembers the choice. See [product.md](product.md#display-themes).
- Draft category/start-group model, state transitions, and timer export samples.
- Test with at least two organizers, two check-in volunteers, and five riders/parents. Participants may overlap with discovery.

Exit gate: Participants complete the core tasks without facilitator rescue; all serious confusion is resolved; the timer accepts the proposed sample format; scope is small enough to operate with the identified team. Proposed usability threshold: at least 90% unassisted completion across the core tasks, with no unresolved critical blocker.

## Phase 2 — Build the registration core

Indicative effort: 5–7 weeks. Depends on Phase 1 and a settled payment model. Priority: P0.

Build:

- Organization access, roles, ownership transfer, audit history, and event templates.
- Required multi-factor authentication (MFA) for every account, step-up re-verification for sensitive organizer actions, and audited account recovery. See [product.md](product.md#sign-in-and-account-security).
- Event/day/race/category/start-group setup and publishing checks.
- Mobile registration, guardian data, accepted waiver flow, and license-review status, behind one verification interface that can later use a live USAC source without reworking registration. See [product.md](product.md#future-usa-cycling-waiver-and-license-integration).
- Individual entries and two-day bundles with transparent totals.
- Capacity reservations and atomic enforcement of shared limits.
- Hosted payment flow, verified payment notifications, receipts, refunds, and a reconciliable ledger.
- Registration lookup, manual corrections, cancellation, and organizer-managed waitlists.
- Transactional email and basic operational reporting.

Verification:

- Concurrent checkout for the last place, expired reservations, and bundle rollback.
- Payment failure, timeout, duplicate notification, refund retry, and cancellation scenarios.
- Role access, private-data visibility, waiver/version integrity, and keyboard/mobile use.
- Contrast and readability of text, forms, buttons, errors, and status indicators in both light and dark themes; theme choice persists without a flash of the wrong theme.
- MFA enforcement for every account type, step-up prompts on sensitive organizer actions, recovery paths that cannot bypass MFA, and attempt rate limits.

Exit gate: Sandbox money and entry states reconcile; no overselling or duplicate processing in concurrency/retry tests; core flows pass with realistic categories. No public paid launch yet.

## Phase 3 — Make race day operable

Indicative effort: 3–5 weeks. Depends on Phase 2; USAC acceptance gates live sanctioned use. Priority: P0.

Build:

- Agreed license verification and exception-review workflow, with freshness/source visible.
- Search and QR check-in, bib-range rules, conflict detection, and repeat-scan handling.
- Timer export fields agreed from the road-results research, so results uploads need no retyping.
- Timestamped start lists, change reports, and tested timer exports.
- Minimal printable fallback roster and an access-restricted emergency-contact process.
- Payment/email failure alerts, backup/restore, incident handling, and support runbook, following the operating model in [docs/operations.md](docs/operations.md).
- Organizer handoff guide and role-specific volunteer instructions.

Rehearsal:

- Run an entire mock weekend with sample data and staff other than the developer.
- Include field changes, missing licenses/signatures, refunds, duplicate names, and a lost-connection scenario.
- Measure check-in speed and validate every export with the timer.
- Reconcile the financial report with provider records and demonstrate backup recovery.

Exit gate: Registration lead, timer, treasurer, and pilot organizer accept the workflow; all P0 defects are closed; contingency and support ownership are documented.

## Phase 4 — Run a controlled live pilot

Indicative effort: 2–4 weeks of preparation and review, plus the chosen event date. Depends on Phase 3. Priority: P0.

Scope:

- One lower-risk cycling event with a named support team and manageable participant volume.
- Monitor registrations, payment callbacks, capacity, email delivery, and support demand.
- Use the new system as the single authoritative source for pilot entries. Any comparison exports must be read-only; avoid duplicate live payments or competing registration lists.
- Establish cancellation, outage, and communication procedures before opening entries.
- Collect rider/volunteer feedback and measure workload against the baseline.

Exit gate: No critical integrity failures, financial reconciliation is complete, exports are correct, and workload targets show meaningful improvement. If targets fail, fix the workflow and repeat a small pilot before expanding.

## Phase 5 — Prove a two-day weekend and handoff

Indicative effort: 3–5 weeks plus event scheduling. Depends on a successful Phase 4. Priority: P1.

Deliverables:

- Exercise both-day bundles, separate day entries, category changes, combined capacities, and bib rules in a full two-day rehearsal.
- Validate discounts, partial refunds, reporting per day, and final weekend reconciliation.
- Confirm that a successor organizer can clone the setup, update rules, and operate it without the original owner.
- Agree on support coverage and a rollback/cutover plan before any Berkeley Omnium adoption.

Exit gate: The committee explicitly chooses adoption based on demonstrated workload savings and operational readiness. Migrate only before registration opens, unless an exceptional migration plan has been separately agreed. Never assume existing waiver signatures or payment credentials can be moved.

## Phase 6 — Expand only from observed demand

Priority: P2. Estimates follow pilot evidence.

Candidate improvements, in likely order:

1. Automated waitlist offers with expiring reservations and explicit payment consent.
2. Better rider self-service changes, transfers, and refunds under organizer rules.
3. Series registration and reusable season bib assignments.
4. Live USAC waiver pull and license validation, as soon as USAC grants access and approves the workflow. This moves ahead of other P2 items when access arrives.
5. Additional cycling disciplines and other federation integrations.
6. Offline check-in synchronization, only with a defined conflict-resolution model.
7. Public event discovery once organizer operations are reliable.

Omnium scoring, timing hardware, weather, training tools, and general event ticketing remain outside this roadmap unless discovery establishes a compelling need.

## Priority definitions

| Priority | Meaning | Examples |
|---|---|---|
| P0 | Required before a safe, usable pilot | Correct capacity/payments, MFA sign-in, accepted waivers, license review, check-in, exports, support |
| P1 | Required for the intended two-day adoption | Validated weekend operations, successor handoff, complete day-by-day reconciliation |
| P2 | Improves a proven product | Automated waitlists, series features, additional disciplines |

## Responsibilities

These are roles to assign, not assumed staffing commitments.

| Role | Accountable for |
|---|---|
| Product owner | Scope, research, baseline, priorities, and go/no-go recommendation |
| Technical lead | Architecture, implementation, integrity, deployment, and recovery |
| Registration lead | Category rules, exception handling, check-in, and volunteer acceptance |
| Treasurer | Payment operating model, refunds, fees, payouts, and reconciliation |
| Federation liaison | USAC permissions and accepted licensing/waiver workflows |
| Timer / officials liaison | Start lists, export acceptance, and race-day change handling |
| Support owner | Opening-day and race-day response, incidents, and communications |

## Critical risks and decision points

| Risk | Response | Stop / change condition |
|---|---|---|
| Too little volunteer capacity | Dedicated delivery/support ownership; brief scheduled research sessions | No funded capacity or support owner: do not commit to a live event |
| Federation access unavailable | Seek approval early; prototype with labeled simulation; keep a verification interface ready for a live USAC source | No accepted licensing/waiver workflow: no sanctioned-event launch |
| Incumbent already solves the problem | Benchmark real tasks before building | No material workload benefit: improve existing setup |
| Money or capacity inconsistency | Transactional state design, retry protection, reconciliation tests | Any unresolved critical integrity defect blocks pilot |
| Timer incompatibility | Test actual files with the actual timer | No accepted export blocks race-day adoption |
| Weak connectivity | Connectivity requirement, printed fallback, incident rehearsal | No workable event-day contingency blocks launch |
| Successor cannot operate it | Early role testing, templates, ownership transfer, runbook | Developer remains essential to routine operations: defer expansion |

## Next actions

1. Assign a product owner and registration lead for discovery, and record them in the [decision memo](docs/discovery/decision-memo.md#team-and-owners).
2. Obtain an anonymized existing category setup, timer export, exception list, and reconciliation example.
3. Schedule one workflow observation and the initial interviews, using the [interview guides](docs/discovery/interview-guides.md), [workflow map](docs/discovery/workflow-map.md), and [workload baseline](docs/discovery/workload-baseline.md).
4. Submit federation and payment-model questions before choosing the production stack, using [questions for USA Cycling](docs/usac-questions.md) and [payment model questions](docs/payment-model-questions.md); track owners and status in [external-requirements.md](docs/discovery/external-requirements.md). ADR 0001 covers only the local prototype.
5. Research the road-results.com update process with the timer and a recent promoter. Send the timer the [timer export review packet](docs/timer-export-review.md) and record the answers there.
6. Run the category builder with the registration lead on an anonymized real schedule, and the rider checkout with at least five riders or parents, recording where each needed help (Phase 1 usability test). Use the [usability test kit](docs/usability/README.md).
7. Complete the build-versus-improve decision with the [options comparison](docs/discovery/options-comparison.md), shortlist a pilot with [pilot-selection.md](docs/discovery/pilot-selection.md), and revise estimates from evidence in the [decision memo](docs/discovery/decision-memo.md).
