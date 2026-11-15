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
| Category builder milestone | Implemented (November 14, 2026); partly verified | Local only. See [Category builder milestone](#category-builder-milestone). |
| Rider checkout and demo purchase flow (2a) | Implemented (November 14, 2026); partly verified | Simulated payment only. Meets the [2a](product.md#2a-clickable-demo-purchase-flow--phase-1) behavior in automated tests, including both display themes; usability testing with people is not done. See [Rider checkout](#rider-checkout). |
| Race-day check-in | Implemented (November 14, 2026); partly verified | Local only, fake riders. Ready/blocked result, bib ranges, bib history, repeat-safe check-in. Automated tests written; usability test with volunteers not done. See [Check-in](#check-in). |
| Start lists and sample timer export | Implemented (November 14, 2026); partly verified | Local only, fake riders. Per-race start lists, numbered snapshots with changes since the last one, and a sample CSV. The format is not agreed with a timer and has not been round-tripped. See [Start lists and timer export](#start-lists-and-timer-export). |
| Automated accessibility checks | Implemented (November 14, 2026) | axe-core WCAG 2.2 A and AA checks on the main organizer, check-in, and rider screens in both themes, in CI; two issues fixed. Keyboard, screen-reader, and real-phone passes are not done. See [ACCESSIBILITY.md](ACCESSIBILITY.md#results). |
| Light and dark display themes | Implemented (November 14, 2026); partly verified | Organizer and rider screens: system default, header toggle on every screen, saved per device, applied before first paint, light palette for print. Token contrast checked against WCAG 2.2 AA in the browser; the rider demo has an automated theme switch test. The check-in screen uses it, with fixed high-contrast result fills for sunlight. |
| Timer export review packet | Implemented (November 14, 2026) | Column list, sample CSV of fictional riders, and ten questions for the timer and officials in [docs/timer-export-review.md](docs/timer-export-review.md). Not yet sent; the timer's acceptance is a Phase 1 exit gate item. |
| Phase 1 usability test kit | Implemented (November 14, 2026) | Recruiting, setup, facilitator script, core and optional tasks per role, scoring for the 90% gate, and a results summary template in [docs/usability/](docs/usability/README.md). No sessions have been run. |
| Phase 0: Establish the case to build | In progress | The [discovery kit](docs/discovery/README.md) is implemented (interview guides, workflow map, workload baseline, options comparison, USAC and payment questions, pilot selection, decision memo). One interview is done ([D01](docs/discovery/interviews/D01.md), November 14, 2026: the promoter answering as race director, registration lead, treasurer, and rider; all numbers are estimates). Its largest estimated costs are reconciliation (about 8 hours per event: reports, refund matching, merchandise) and bib assignment across multiple fields (about 1 hour). The current tool is BikeReg. Separate staff interviews, the timer, four more riders or parents, observation, and measurement remain. KC (project owner) owns the USAC contact as of November 15, 2026; no other owners are named. Nothing has been sent to USAC or payment providers. The category builder milestone was built ahead of this gate at the owner's request; it does not replace discovery. Next actions are listed at the end of this document. Send-ready versions of the outreach questions: [questions for USA Cycling](docs/usac-questions.md) and [payment model questions](docs/payment-model-questions.md). |
| Phase 1: Test the experience without live money | In progress | Organizer event builder, rider checkout (one day, both days, junior, uncertain license), and the registration exception queue are implemented. The race-day check-in and sample timer exports are implemented too. Usability tests with people have not been run (the [test kit](docs/usability/README.md) is ready). A [pilot run of the kit](docs/usability/pilot-run-2026-11-14.md) on November 14, 2026 completed every task, fixed five problems (including check-in ignoring Enter from a scanner), and corrected the kit; it is not gate evidence. The export format is not yet agreed with a timer. |
| Phase 2: Build the registration core | In progress | Decisions: ADR 0003 and 0004 accepted, 0005 Proposed. First build step done: the local build stores data in PostgreSQL with per-event transaction locks (November 15, 2026). Nothing is hosted. Depends on Phase 1 and a settled payment model. |
| Phase 3: Make race day operable | Planned | USAC acceptance gates live sanctioned use. |
| Phase 4: Run a controlled live pilot | Planned | Depends on Phase 3. |
| Phase 5: Prove a two-day weekend and handoff | Planned | Depends on a successful Phase 4. |
| Phase 6: Expand only from observed demand | Planned | P2. |

## Planned expansion approved November 14, 2026

The product owner requested Stripe payments, communications, rider self-service, promotions, reporting, race-day registration, explicit omnium/stage-race setup, cross-organization bundles such as season passes, participant management, automatic/bulk bib assignment, and reusable credits/deferrals. These are Planned requirements, not claims of implemented behavior. The current build and live-use gates remain as described below.

| Work | Status | Delivery placement and dependencies |
|---|---|---|
| Selective Liquid Glass visual refinements | Planned; documentation direction only | Apply in future rider/organizer UI work under [DESIGN.md](DESIGN.md); depends on composited contrast, opaque fallback, keyboard/mobile, and reduced-motion checks. No existing milestone is marked complete or reprioritized |
| Stripe hosted Checkout, refunds, and reconciliation | Planned; provider selected | Phase 2. [ADR 0002](docs/decisions/0002-stripe-payments.md) selects Stripe; merchant, dispute, tax, payout, and Connect operating model still gate live money |
| Transactional and targeted operational communications | Planned | Phase 2 after accounts/permissions and email-provider decision; delivery status and safe retry required |
| Rider self-service changes and withdrawals | Planned | Phase 2 after MFA, policy controls, entry-change engine, and Stripe charge/refund handling; existing organizer actions remain implemented |
| Coupon codes and basic promotion controls | Planned | Phase 2 after accepted-price snapshots and atomic redemption limits; referral offers and registration-count tiers in Phase 6 |
| Participant management | Planned beyond event-level queue | Phase 2: reusable identity, scoped workspace, saved views, history, and guarded bulk actions; Phase 5: cross-event history and authorized duplicate-resolution workflows |
| Automatic and bulk bib assignment | Planned beyond check-in-time assignment | Phase 3 after reusable identity, confirmed-entry lifecycle, bib scopes, access control, and audit; preview/apply and atomic collision enforcement required |
| Reusable credits and deferrals | Planned | Phase 5 after Phase 2 payment/refund ledger, identity, policy and self-service controls; same-organization first. Cross-organization redemption in Phase 6 only after explicit funding/liability and settlement approval |
| Operational/finance reporting | Planned beyond existing start-list exports | Phase 2 with role-scoped exports and Stripe reconciliation; prior-year/cross-event reporting in Phase 5 after reusable identity |
| Race-day registration and payment desk | Planned | Phase 3 after registration/payment core, staff permissions, accepted waivers, and capacity/waitlist enforcement |
| Dedicated omnium and stage-race setup, including TT | Planned beyond existing same-event package pricing | Phase 1 requirements exercise; implementation and rehearsal in Phase 5 after the single-event pilot; no results scoring |
| Reusable organizer templates and category presets | Planned later enhancement | Phase 5 after editable category/start/capacity configuration, copy/remapping safeguards, versioned provenance, and organization permissions; stage-race starters also depend on TT support |
| Cross-event, cross-organization bundles / season passes | Planned | Phase 6 after single-organization operation is proven, participating-organizer approvals, global reservations, isolation controls, and a separate accepted multi-organization Stripe settlement decision |

“Event package” means entries across races within one event. “Bundle / season pass” can span different events and organizations. The existing code/UI's “bundle” is a same-event package only. This terminology change does not migrate data or imply cross-organization purchase support.

The expanded scope requires fresh estimates before implementation; existing effort ranges are baseline estimates, not commitments for these additions. No live Stripe account, email provider, deployment, or federation integration is authorized or configured by this documentation change.

## Category builder milestone

Built November 14, 2026, on the stack in [ADR 0001](docs/decisions/0001-stack-for-category-builder-milestone.md). It covers the organizer side of the [road race and criterium category builder](product.md#1a-road-race-and-criterium-category-builder--p0) and runs only on a local computer. Setup: [docs/runbooks/local-setup.md](docs/runbooks/local-setup.md).

**Implemented:** organizations and draft events from road race, criterium, and two-day weekend templates; editable race days and races; categories that can be created, duplicated (flagged for review), reordered, archived, and edited; structured eligibility (AND within a path, OR between paths, organizer review and guardian flags); prices with scheduled changes and day-of surcharge; registration windows; distance, laps, or minutes plus laps; start groups with start and staging times and field limits; separate classification codes; category caps and shared capacity pools; simulated test entries that exercise the limits; a rider-facing preview with an eligibility checker; validation that blocks publishing on errors and requires warnings to be acknowledged; immutable published versions; autosaved drafts with stale-save protection (SQLite at first, PostgreSQL since November 15, 2026); labeled demonstration data.

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

**Copy-day and bulk edit (added November 14, 2026):** in **Event setup**, "Copy <day>'s races to" copies every race on a day, with its start groups and categories, to another day. Copies get new IDs, "(copy)" race names, "-COPY" timing codes, and the "Review copy" flag; shared capacity pools are not copied. On the category schedule, checkboxes select categories for **Bulk edit** of entry price, day-of surcharge, cap, registration opening or closing, or open/closed, with a before/after preview; a cap below current entries or a window that would close before it opens is shown and that row is left unchanged. Covered by unit tests in `tests/bulk.test.ts` (run in CI) and checked by hand in the browser.

**Per-category questions, waiver addenda, and bib ranges (added November 14, 2026):** the category editor can add up to five rider questions (free text or a list of choices, each optional or required), a waiver addendum riders must accept on top of the event waiver, and a category bib range. Checkout asks the questions on the racer details step and shows each addendum on the waiver step; both are checked on the rider page and again by the server, and stored with the order. Registrations shows the answers and accepted addenda, and the entries CSV adds a `category_answers` column. At check-in, a rider whose race that day has a category bib range gets the next free bib from it (earliest race first); otherwise the event or day range applies. Validation blocks a backwards range or an empty question or addendum, and warns on overlapping category ranges. Covered by unit and API tests in `tests/categoryExtras.test.ts` (run in CI) and checked by hand in the browser.

**Change resolution workflow (added November 14, 2026):** publishing a change that touches paid entries opens one item per affected entry under **Changes to resolve** on Registrations, listing what changed. The organizer records the outcome (kept as is, transferred, or withdrawn), confirms the rider was told, and adds a note; the server refuses an outcome that does not match the entry (a withdrawal or transfer must have happened on the entry first). A later change to the same entry adds to its open item instead of opening another. Covered by API tests in `tests/resolutions.test.ts` (run in CI) and checked by hand in the browser. Contacting riders happens outside the app.

**Not built yet (still required by product.md):** nothing beyond the hosted Phase 2 work; the local rider checkout is described under [Rider checkout prototype](#rider-checkout-prototype).

**Pending external dependencies, shown as pending in the interface:** USA Cycling license and waiver checks, Stripe payments, and sign-in with required MFA. Until sign-in exists the app must not be hosted or shared.

## Rider checkout

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

**Organizer exports (added November 14, 2026):** Registrations has **Download entries (CSV)** (one row per entry: order, `rider_id` following rider links, name, team, racing age, license category, category, race, entry and order status, amount paid, license review, waiver signer) and **Download ledger (CSV)** (for orders where money arrived: each entry price, discount, and fee, an order total equal to the rows above it, then logged transfer differences and withdrawals marked as not settled; every row notes that payment was simulated). Both come straight from the database and leave out contact, emergency, and license-number details until role-based access exists; text is guarded against spreadsheet formulas. Covered by API tests in `tests/exports.test.ts` (run in CI) and checked by hand in the browser. Not reconciled against a payment provider, because none is connected.

**Not built yet:** real payments, refunds, and payouts; rider accounts and access to past receipts; rider-initiated change requests; emergency contact collection (deferred until role-based access exists); email receipts. (Check-in and bib assignment: see [Check-in](#check-in); start lists and exports: see [Start lists and timer export](#start-lists-and-timer-export).)

**Pending external dependencies:** a payment provider, USA Cycling license and waiver checks, and sign-in with required MFA. Rider data entered in the app stays in the local database; use made-up details.

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

## Check-in

Built November 14, 2026, on the same stack, building on the rider checkout. It covers the Phase 1 deliverable "check-in showing ready/blocked states and bib assignment" and part of [product.md section 5](product.md#5-race-day-operations). Fake riders only; open it from the builder rail under **Race-day check-in**.

**Implemented:** search by name, team, bib, or check-in code (with or without the dash; a code that matches one rider opens it on Enter); a ready/blocked result that needs a confirmed simulated payment and every readiness item for that day's entries, so an unreviewed license blocks and paying alone never clears a rider; blockers that tell the volunteer to send the rider to the registration desk rather than override; bib ranges for the whole event or per race day; the next free bib or a chosen one, with no two active riders on the same bib in a range (enforced by a database index); repeat check-in returns the first time and bib; bib changes need a reason and keep the history; a day summary (riders, checked in, blocked, bibs issued); fictional demo riders for a published demo event. Volunteers see name, team, racing age, entries, readiness, and bib only: no email, phone, emergency contact, license number, or payment amount.

**Verified:** checked by hand in the browser on desktop and phone widths in both themes. Automated tests in `tests/checkin.test.ts` cover the rules, bib collisions and ranges, repeat check-in, bib history, per-day bibs, code lookup, and the absence of contact and payment details; they run in CI. A Playwright test (`e2e/checkin.spec.ts`) checks that Enter right after a scanned code or a unique name opens that rider, and that a blocked rider gets no check-in button.

**Not built yet:** sign-in and the check-in volunteer role (anyone with the local app can use the screen).

**QR check-in codes (added November 14, 2026):** the rider confirmation shows the check-in code as a QR image as well as text, drawn in the browser with the `qrcode` package (1.5.4, added with the owner's approval). The check-in screen has **Scan with camera**, which reads the QR with the browser's built-in barcode detector (Chrome and Edge) and opens the rider the same way a typed or USB-scanned code does; other browsers show a message to type the code or use a USB scanner. Video stays on the device and is not recorded. Checked in the browser: the QR renders with an accessible name and decodes back to the check-in code with the same detector, and a blocked camera shows a clear message. A Playwright test checks the QR on the confirmation. Not yet checked: live scanning with a real camera, which the browser pane used for testing blocks.

**Rider identity across orders (added November 14, 2026):** Registrations suggests orders that look like one rider (same license number, or same full name and email) under **Same rider?**. Policy (decided by the project owner, November 14, 2026): nothing is linked automatically; the organizer chooses **Link as one rider** or **Not the same rider**, and can **Unlink**. Linked orders become one rider at check-in (one card, entries combined, ready only when every linked order is paid, one bib and one check-in), on start lists (one `rider_id`), and on the fallback roster. Linking is refused when both orders already hold a bib or check-in. Covered by unit and API tests in `tests/identity.test.ts` (run in CI) and checked by hand in the browser (two orders linked, one rider on both days with one bib).

**Measured check-in times (added November 14, 2026):** the check-in screen times each standard check-in from the first keystroke or scan into an empty search to the successful check-in, and the day summary shows the median and 95th percentile against the [product.md](product.md#success-measures) targets (median under 30 seconds, 95th percentile under 90). Blocked riders cannot be checked in, so exceptions are left out; a rider opened from the list without searching is not timed, and a time over 10 minutes is treated as interrupted. A repeat check-in keeps the first measurement. Covered by unit and API tests in `tests/checkin.test.ts` (run in CI) and checked by hand in the browser. These are local test measurements, not pilot results.

**Undo a check-in (added November 14, 2026):** a checked-in rider's card has **Undo check-in**, which needs a reason. It removes that day's check-in so the rider can be checked in again, releases the bib (unless the same bib also covers another day the rider is still checked in for), and keeps the record under "Undone check-ins" and in the bib history. Covered by API tests in `tests/checkin.test.ts` (run in CI) and checked by hand in the browser.

**Printable fallback roster (added November 14, 2026):** **Fallback roster** on the check-in screen opens a print-ready page with one section per race day: every rider by surname with team, racing age, races in start order, status (checked in, ready, or NOT READY with the reason), and bib; an exception checklist of blocked riders with what is missing, what to do, and a space to record who cleared it; and blank rows for riders not on the list. Each section shows when it was printed and that later changes are not shown. It prints black on white whatever the screen theme, and carries no email, phone, emergency contact, license number, or payment amount. A blocked rider is never printed as cleared, even with a check-in on record. Covered by unit tests (`tests/roster.test.ts`) and a Playwright test that run in CI; checked by hand in the browser at desktop and phone widths. A paper print through a real printer has not been checked, and the roster has not been used in a rehearsal.

## Start lists and timer export

Built November 14, 2026, building on the check-in. It covers the Phase 1 deliverable "timer export samples" and part of [product.md section 5](product.md#5-race-day-operations). Open it from the builder rail under **Start lists and timer export**.

**Implemented:** a start list per race from confirmed entries only (unpaid, cancelled, and released entries and simulated test entries are left out), in start order with bibs from check-in; numbered, timestamped snapshots tied to the published schedule version; changes since the last snapshot and between snapshots (added, removed, changed bib, category, start group, start time, name, team, or license number), matched by stable entry ID; a sample CSV per race, per snapshot, or for all races in one file. Columns: race date, race, start time, start group, category code, category, race length as configured (for example "45 min + 3 laps", never an invented distance or finish time), bib, last and first name, team, license number, racing age, competition class, license status, checked in, entry ID, rider ID. Values that a spreadsheet would run as a formula are prefixed with an apostrophe. No email, phone, guardian, emergency contact, or payment data is exported.

**Verified:** checked by hand in the browser. Automated tests in `tests/startlists.test.ts` cover CSV quoting and formula guarding, start order, the diff, confirmed-only rows, snapshots and later changes, CSV headers and stable IDs, and the absence of contact data; they run in CI.

**Start-list lock (added November 14, 2026):** **Lock start list** on a race saves a snapshot and marks it as the list sent to the timer, with a link to download that locked version. Policy (decided by the project owner, November 14, 2026): the organizer locks each race's list; changes after the lock (new entries, transfers, withdrawals, check-in bibs) are still allowed and appear as "Revisions since the lock" for the timer, never blocked. **Lock again at current list** moves the lock to a new snapshot. Covered by an API test in `tests/startlists.test.ts` (run in CI) and checked by hand in the browser (a check-in after the lock showed as a bib revision).

**Not built yet:** a format agreed with the actual timer and a round trip through timing software (the open research questions in [product.md](product.md#results-site-updates-research)); the timer/export role and sign-in (anyone with the local app can download).

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

## Berkeley weekend review priorities

Status: Planned follow-up to the November 14, 2026 [code-based expert review](docs/usability/pilot-run-2026-11-14.md#berkeley-weekend-case-study-code-based-expert-review). Executed shared-rule probes and 85 existing pricing/eligibility/capacity/order/check-in/identity tests passed; no participant research, official Berkeley partnership, live payments, or federation approval was established. Existing phases and live-use gates remain in force.

| Priority / placement | Work and dependencies | Completion evidence required |
|---|---|---|
| P0, before live minor registration | Close guardian bypass for minors in adult/open categories. Confirm age convention and accepted guardian policy; enforce consistently in browser, server, transfers, and readiness. | Tests for junior and adult/open categories, missing guardian and wrong signer; parent task succeeds with clear signer responsibility. No minor silently self-signs through an unflagged category. |
| P0, Phase 1 correctness/recovery validation | Exercise package contents and server-side intent, split discount explanations, recovery versus overlap, final-place rollback, window/surcharge boundaries, decline/refresh/expiry recovery. Preserve accepted prices. Existing organizer-confirmed post-order links do not provide pre-admission identity, so do not deduplicate capacity across separate orders without a verified identity design. | [Product case criteria](product.md#berkeley-weekend-acceptance-criteria), technical concurrency/retry evidence, and participant teach-back of included races, savings, totals, and next steps. Price quote alone never authorizes an invalid selection. |
| P0, Phase 1 formative study | Run [3–5 riders/parents and 2–3 staff](docs/usability/README.md#berkeley-weekend-initial-round), then fix/re-test critical findings and expand to the existing gate panel. No recruitment is performed by this docs change. | Task-level completion, errors, assistance, time, and price/clearance understanding; record missing-waiver probe as hypothetical, not UI completion. No invented feedback or gate pass. |
| P0, Phase 0 decisions; Phase 2/3 implementation | Obtain USAC platform/electronic-waiver and guardian acceptance or an explicitly accepted paper/manual alternative; license access/freshness/fallback policy; Stripe merchant/settlement decision. Dependencies are tracked in existing [external requirements](docs/discovery/external-requirements.md) and [USAC questions](docs/usac-questions.md). | Written answers/acceptance with owner, source and date before sanctioned use. Implement/rehearse waiver resolution and independent readiness; sample signatures and license notes do not establish approval. |
| P0, Phase 3 rehearsal | Demonstrate paid-but-blocked lookup, waiver/guardian and license resolution under accepted rules, safe bib issuance, repeat checks, and timer handoff. Depends on accepted verification process and access control. | No blocked rider receives a bib; every blocker has a next action. Ready-control median under 30 seconds is measured separately from exception handling; timer accepts exports and support/fallback owners are named. |
| Required across UI changes | Apply [DESIGN.md](DESIGN.md): stable opaque forms/pricing/tables, selective glass, readable contrast, keyboard/mobile recovery, reduced motion/transparency. Correctness precedes visual refinements; keep current opaque UI until alternatives are verified. | Manual keyboard/screen-reader and safe real-device checks in both themes, 360px/200% zoom, composited contrast and fallback checks when glass is implemented. Automated checks alone do not verify these tasks. |
| Later, existing Phase 5/6 sequence | Dedicated omnium/stage-race configuration, then separate-event/cross-organization packages or season passes. | Keep same-event demo packages distinct; do not expand before single-event correctness, sanctioned-use gates, and separate settlement decisions are satisfied. |

## Phase 1 — Test the experience without live money

Indicative effort: 2–3 weeks. Depends on Phase 0. Priority: P0.

Deliverables:

- Clickable rider checkout for one day, both days, a junior entry, and an uncertain-license case.
- End-to-end demo purchase flow on fake demonstration data: browse events, choose an entry, racer details, waiver signature, order review with fees, clearly labeled simulated payment, and confirmation with registration details, waiver status, and receipt. Uses the fixtures in [docs/fixtures/](docs/fixtures/README.md). See [product.md](product.md#2a-clickable-demo-purchase-flow--phase-1).
- Organizer event builder and registration exception queue.
- Check-in showing ready/blocked states and bib assignment.
- Light and dark themes with a toggle that defaults to the system preference and remembers the choice. See [product.md](product.md#display-themes).
- Draft category/start-group model, state transitions, and timer export samples.
- Design explicit omnium/stage-race setup and review requirements for a TT component and overall participation; remain simulated and separate from results scoring.
- Start with the Berkeley formative round (3–5 riders/parents and 2–3 organizers/volunteers), then expand to at least two organizers, two check-in volunteers, and five riders/parents for the exit gate. Participants may overlap with discovery; count role/task exposure explicitly.

Exit gate: Participants complete the core tasks without facilitator rescue; all serious confusion is resolved; the timer accepts the proposed sample format; scope is small enough to operate with the identified team. Proposed usability threshold: at least 90% unassisted completion across the core tasks, with no unresolved critical blocker. The smaller initial round and expert review do not satisfy this gate. Record exact task attempts, errors, assistance, times, and package/clearance teach-back. Every unsafe clearance, bib, guardian, capacity, or unintended-price outcome is critical even once; fix and re-test with a new participant. No manual accessibility or real-device pass is implied by automated tests.

## Phase 2 — Build the registration core

Indicative effort: 5–7 weeks. Depends on Phase 1 and a settled payment model. Priority: P0.

Decisions first (November 14, 2026): three decision records were drafted; 0003 and 0004 were accepted by the owner on November 14, 2026, and 0005 remains Proposed: [ADR 0003](docs/decisions/0003-sign-in-and-mfa.md) sign-in with required MFA (recommends a managed identity service), [ADR 0004](docs/decisions/0004-hosted-stack-and-database.md) hosted stack and database (recommends keeping TypeScript and React, with managed PostgreSQL on a managed application platform), and [ADR 0005](docs/decisions/0005-merchant-and-settlement-model.md) merchant and settlement model (recommends each club as merchant through its own connected Stripe account). 0003 chose Clerk Pro with SMS off (a test-account spike is a follow-up); 0004 chose Render and Render Postgres on Pro (treasurer cost approval and legal review of minors' data are follow-ups before production). No live keys or live payments until 0005 is accepted. The Phase 1 exit gate is still open; starting Phase 2 decisions now is the owner's choice.

Progress (November 15, 2026):

- Implemented: persistence moved from SQLite to PostgreSQL per ADR 0004. The twelve migrations were translated; capacity, holds, payments, bibs, and ledger writes take a per-event transaction lock; the API tests run against disposable PostgreSQL databases and CI starts a PostgreSQL service. Verified by the full Vitest suite (including last-place and repeated-payment races across two connections) and the Playwright tests against PostgreSQL. See [DATA_MODEL.md](DATA_MODEL.md#capacity-and-concurrency).
- Not started: deployment to Render, hosted backups and a restore rehearsal, sign-in (ADR 0003). No accounts or cloud resources exist.

Build:

- Organization access, roles, ownership transfer, audit history, and event templates.
- Required multi-factor authentication (MFA) for every account, step-up re-verification for sensitive organizer actions, and audited account recovery. See [product.md](product.md#sign-in-and-account-security).
- Event/day/race/category/start-group setup and publishing checks.
- Mobile registration, guardian data, accepted waiver flow, and license-review status, behind one verification interface that can later use a live USAC source without reworking registration. See [product.md](product.md#future-usa-cycling-waiver-and-license-integration).
- Individual entries and same-event packages with transparent totals; cross-organization season passes remain Phase 6 work.
- Capacity reservations and atomic enforcement of shared limits.
- Stripe hosted Checkout in sandbox first, signature-verified payment notifications, delayed-payment handling, idempotent fulfillment, receipts, entry-level refunds, and a reconciliable ledger. Provider selection is settled in ADR 0002; the merchant and settlement model remains a live-use gate.
- Registration lookup, manual corrections, cancellation, and organizer-managed waitlists.
- Participant management foundation: reusable rider identity, role-scoped workspace, saved filters/columns, event history, permitted CSV exports, and previewed bulk actions using individual-entry rules.
- Transactional confirmations, receipts, waitlist offers, payment/refund/change notices, targeted operational email, delivery tracking, and suppression/retry handling. Marketing consent remains separate.
- MFA-protected rider self-service, policy/eligibility/capacity checks, financial previews, organizer approval where required, and an audit trail.
- Basic fixed/percentage coupons with eligibility windows, explicit discount precedence, and atomic redemption caps.
- Role-scoped operational and finance reports that distinguish riders, entries, orders, discounts, fees, refunds, and unsettled exceptions.

Verification:

- Concurrent checkout for the last place, expired reservations, and bundle rollback.
- Stripe sandbox payment failure, delayed success, timeout, duplicate/out-of-order notifications, refund retry, and cancellation scenarios.
- Duplicate email prevention, failed-delivery visibility, and waitlist-offer expiry.
- Self-service changes with paid differences/refunds, blocked capacity/eligibility, concurrent final coupon redemption, and report/export reconciliation.
- Role access, private-data visibility, waiver/version integrity, and keyboard/mobile use.
- Participant workspace saved-view/export isolation, stable person/entry/order counts, and bulk-action previews with visible refused-record reasons.
- Contrast and readability of text, forms, buttons, errors, and status indicators in both light and dark themes; theme choice persists without a flash of the wrong theme.
- MFA enforcement for every account type, step-up prompts on sensitive organizer actions, recovery paths that cannot bypass MFA, and attempt rate limits.

Exit gate: Sandbox money and entry states reconcile; no overselling or duplicate processing in concurrency/retry tests; core flows pass with realistic categories. Verify the Berkeley package, extra-entry, guardian-in-adult-category, and recovery criteria, with no partial package or silently repriced paid entry. Stripe sandbox evidence must cover authoritative notification/retry/refund reconciliation, not simulated app buttons. No public paid launch yet.

## Phase 3 — Make race day operable

Indicative effort: 3–5 weeks. Depends on Phase 2; USAC acceptance gates live sanctioned use. Priority: P0.

Build:

- Agreed license verification and exception-review workflow, with freshness/source visible.
- Search and QR check-in, bib-range rules, conflict detection, and repeat-scan handling.
- Opt-in automatic bib assignment on confirmed entries; deterministic previewed bulk allocation with explicit scopes/ranges, stable tie-breaks, preservation of manual/issued/checked-in assignments, atomic apply, and historical reassignments.
- Race-day walk-up/mobile/kiosk registration using the same rules as advance entry, staff permissions, explicit surcharges/windows, confirmed Stripe hosted payment, bib handoff, and start-list updates. Physical terminals and cash/check recording need a separate approved workflow.
- Timer export fields agreed from the road-results research, so results uploads need no retyping.
- Timestamped start lists, change reports, and tested timer exports.
- Minimal printable fallback roster and an access-restricted emergency-contact process.
- Payment/email failure alerts, backup/restore, incident handling, and support runbook, following the operating model in [docs/operations.md](docs/operations.md).
- Organizer handoff guide and role-specific volunteer instructions.

Rehearsal:

- Run an entire mock weekend with sample data and staff other than the developer.
- Include field changes, missing licenses/signatures, refunds, duplicate names, and a lost-connection scenario.
- Measure check-in speed and validate every export with the timer.
- Exercise simultaneous automatic/manual/bulk bib allocation, exhausted ranges, stale previews, repeated confirmation, and protected manual/checked-in assignments. Failed batches must leave no partial assignments.
- Exercise a walk-up rider, a full field with a waitlist, a minor needing a guardian, failed payment, and repeated staff actions without duplicate charges or entries.
- Reconcile the financial report with provider records and demonstrate backup recovery.

Exit gate: Registration lead, timer, treasurer, and pilot organizer accept the workflow; all P0 defects are closed; contingency and support ownership are documented. Before sanctioned use, record explicit acceptance of the USAC platform/electronic-waiver path or approved alternative, guardian process, and license review/freshness fallback. Rehearse missing waiver and license blockers through accepted resolution, including server refusal to issue a bib while blocked; retain independent payment/entry/readiness evidence. Confirm live payment responsibilities and operating approval before Phase 4.

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

- Exercise same-event omnium packages, separate day entries, category changes, combined capacities, and bib rules in a full two-day rehearsal.
- Implement dedicated omnium/stage-race setup with reviewed cross-day category mappings, overall-participation controls, component pricing, TT scheduling support, and atomic full-package reservations. Rehearse the $130 Berkeley package and the Planned $160 TT/road-race/criterium package with fake riders; points, time aggregation, and results scoring remain out of scope.
- Extend participant management with authorized cross-event rider history, duplicate-resolution safeguards, saved views/exports, and historical registration-pace reporting after reusable identity and access isolation are verified.
- Implement same-organization reusable credits and deferrals: auditable balance/expiry/restrictions, atomic reservation/redemption, partial credit plus Stripe, zero-cash fulfillment, destination capacity checks, source/destination linkage, and clear effects on packages/overall participation.
- Verify partial and concurrent credit spending, failed mixed-payment checkout, repeated refunds/deferrals, expired credit, and unavailable future events. Reconcile cash versus credit liability and never issue cash plus credit for the same value.
- Validate discounts, partial refunds, reporting per day, and final weekend reconciliation.
- Add reusable organizer templates built from event formats, selectable/editable category presets, and explicit separate/shared-start configuration, rather than one full-event template per field combination. Include a labeled Berkeley example and organization-saved reviewed setups with source/version/season provenance.
- Verify separate versus shared masters starts from the same category presets; day-specific collegiate/junior/women's category choices; fresh IDs and valid remapped references; missing/stale values in the review checklist; no copied riders/payments/signatures; and no changes to existing events after editing a template. Stage-race starters wait for TT support. Retain normal publish and change-impact checks.
- Use the [six template case studies](docs/case-studies/organizer-templates/README.md) and paper exercises T01-T10 as organizer-review inputs. Resolve the ten-day versus seven-day model gap, TT/circuit representation, category availability overrides, program approval boundaries, and source conflicts before claiming those cases are supported. These are documented research, not executed acceptance tests or permission to add invitational/team registration or flexible pass entitlements.
- Confirm that a successor organizer can clone the setup, update rules, and operate it without the original owner.
- Agree on support coverage and a rollback/cutover plan before any Berkeley Omnium adoption.

Exit gate: The committee explicitly chooses adoption based on demonstrated workload savings and operational readiness. Migrate only before registration opens, unless an exceptional migration plan has been separately agreed. Never assume existing waiver signatures or payment credentials can be moved.

## Phase 6 — Expand only from observed demand

Priority: P2. Estimates follow pilot evidence.

Planned expansion and candidate improvements; sequence within this phase depends on pilot evidence:

1. Automated waitlist offers with expiring reservations and explicit payment consent.
2. Broader self-service and participant-to-participant transfers beyond the core Phase 2 policy flow, with recipient consent and new waivers.
3. Cross-organization bundles and season passes: explicit race list, participating-organizer approvals, fixed pricing and financial allocations, all-component reservations, per-organization data isolation, Stripe reconciliation, partial-cancellation policies, and repeat-safe fulfillment. Extend credits/deferrals across organizations only after every affected organization agrees to eligibility, liability, funding, reporting, and settlement rules; never treat a credit as reserved race capacity. First settle the multi-organization merchant/Connect model in a further ADR. Verify two organizations selling one pass without overselling, duplicate payouts, or unauthorized data access.
4. Referral promotions, count-based price tiers, and reusable season bib assignments.
5. Live USAC waiver pull and license validation, as soon as USAC grants access and approves the workflow. This moves ahead of other P2 items when access arrives.
6. Additional cycling disciplines and other federation integrations.
7. Offline check-in synchronization, only with a defined conflict-resolution model.
8. Public event discovery once organizer operations are reliable.

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
| Federation access unavailable | Seek approval early; build with labeled simulation; keep a verification interface ready for a live USAC source | No accepted licensing/waiver workflow: no sanctioned-event launch |
| Incumbent already solves the problem | Benchmark real tasks before building | No material workload benefit: improve existing setup |
| Money or capacity inconsistency | Transactional state design, retry protection, reconciliation tests | Any unresolved critical integrity defect blocks pilot |
| Timer incompatibility | Test actual files with the actual timer | No accepted export blocks race-day adoption |
| Weak connectivity | Connectivity requirement, printed fallback, incident rehearsal | No workable event-day contingency blocks launch |
| Successor cannot operate it | Early role testing, templates, ownership transfer, runbook | Developer remains essential to routine operations: defer expansion |

## Next actions

1. Assign a product owner and registration lead for discovery, and record them in the [decision memo](docs/discovery/decision-memo.md#team-and-owners).
2. Obtain an anonymized existing category setup, timer export, exception list, and reconciliation example.
3. Schedule one workflow observation and the remaining interviews (D01 is done; the timer, four more riders or parents, and anyone else who handles registration remain), and contact USA Cycling about API access for license checks (D01's follow-up; see [external requirements](docs/discovery/external-requirements.md)), using the [interview guides](docs/discovery/interview-guides.md), [workflow map](docs/discovery/workflow-map.md), and [workload baseline](docs/discovery/workload-baseline.md).
4. Submit federation and payment-model questions before choosing the production stack, using [questions for USA Cycling](docs/usac-questions.md) and [payment model questions](docs/payment-model-questions.md); track owners and status in [external-requirements.md](docs/discovery/external-requirements.md). ADR 0001 covers only the local build.
5. Research the road-results.com update process with the timer and a recent promoter. Send the timer the [timer export review packet](docs/timer-export-review.md) and record the answers there.
6. Run the category builder with the registration lead on an anonymized real schedule, and the rider checkout with at least five riders or parents, recording where each needed help (Phase 1 usability test). Use the [usability test kit](docs/usability/README.md).
7. Complete the build-versus-improve decision with the [options comparison](docs/discovery/options-comparison.md), shortlist a pilot with [pilot-selection.md](docs/discovery/pilot-selection.md), and revise estimates from evidence in the [decision memo](docs/discovery/decision-memo.md).
