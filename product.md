# Product brief: cycling race registration

Status: Draft for discovery and implementation planning  
Working name: CycleReg (name availability not checked)  
Date: November 14, 2026  
First design partner: Berkeley Omnium / Berkeley Bicycle Club (proposed)

## Product decision

Build a cycling-only registration and race-day operations platform for volunteer-run U.S. bike races. **Road racing and criteriums are the primary market and must be fully supported in the first release**, including two-day weekends and omnium entry bundles. Other cycling disciplines are deferred. Expand only after the product demonstrably reduces organizer work.

Berkeley Omnium is the reference scenario, not an approved migration. Its small committee also carries club responsibilities and needs successors. The product must make setup, check-in, exception handling, and handoff easier without requiring the developer to operate every event.

## Problem

Riders need to enter the correct field, understand what they are buying, complete required paperwork, and collect a bib quickly. Organizers need accurate fields, payments, waivers, and start lists across several races and days. Errors become manual work for a few volunteers, often under race-morning pressure.

The opportunity is a guided cycling workflow with clear exception queues and repeatable event templates. A modern appearance alone does not justify replacing an established provider.

## Intended outcome

An organizer can prepare a two-day race weekend, open registration, manage changes, run check-in, and hand the event to a successor from one shared workspace. Riders can register for either day or both without entering the same information repeatedly.

## Users and jobs

| User | Main job | Success looks like |
|---|---|---|
| Race director | Configure and supervise the weekend | Correct categories, limits, fees, and exports with little manual reconciliation |
| Registration lead | Resolve registration exceptions | One prioritized queue with the reason and next action |
| Check-in volunteer | Confirm readiness and issue bibs | Fast lookup and an unmistakable ready/blocked result |
| Rider or parent | Enter eligible races and prepare | Clear fields, total cost, requirements, receipt, and check-in instructions |
| Timer / official | Receive reliable start lists | Stable identifiers and an agreed export format |
| Club treasurer | Reconcile proceeds | Entries, refunds, fees, and payouts trace to one ledger |
| Successor organizer | Take over next season | Reusable setup, role access, history, and an operating guide |

## Positioning and differentiation

Cycling racing is the entire product scope. Prioritize multi-day entries, racing categories, shared field capacities, licensing exceptions, bib allocation, and timer handoffs.

Compete on measured volunteer time saved. Match the practical flexibility organizers need, rather than copying another platform's interface. Do not claim feature parity, equivalent federation integration, lower fees, or better reliability until verified.

## Scope of the first release

### 1. Event and weekend setup

- One weekend contains separate race days, races, registration categories, and start groups.
- A registration category is what a rider enters; a start group can contain multiple categories with a shared capacity. Finishing classifications remain separate where required.
- Templates cover road race, criterium, and a two-day weekend. Copy a previous event without copying participants, payments, or signatures.
- Configure category labels, age and license requirements, distances, start times, field limits, opening/closing times, and fees.
- Offer individual-day entries and a weekend bundle. Show exact contents and one transparent total before payment.
- Flag conflicting schedules and incomplete configuration for organizer review. Publishing requires a preview and checklist.
- Track the year and source of race requirements so last year's rules are not silently treated as current.

### 1a. Road race and criterium category builder — P0

Category configuration is a first-release requirement, not a later enhancement. An organizer must be able to reproduce an approved road-race or criterium registration schedule without developer changes, free-text eligibility workarounds, or spreadsheet-only field limits.

#### Keep the concepts separate

| Concept | Meaning | Example |
|---|---|---|
| Display group/header | Presentation grouping only; does not imply shared limits or starts | Saturday road race; Sunday criterium; junior races |
| Registration category | Purchasable entry option with structured eligibility and price | Masters 35+ Cat 3/4 |
| Start group/field | Riders starting together, subject to one shared field limit | Two separately scored masters categories sharing a start |
| Classification | Label/code sent to the timer for scoring and awards | Separate masters age classifications in one field |
| Capacity pool | Explicit limit shared across selected categories or fields | Approved combined field cap |
| Bundle | Purchase containing an entry in each specified race | Road race + criterium weekend entry |

A display header must never create a capacity rule accidentally. Combining starts must not merge classifications, change prices, or create additional entries. A rider counts once toward a shared start-group capacity even if that rider has multiple classification tags; dual scoring is allowed only when explicitly configured and approved.

#### Required category fields

| Area | Organizer controls |
|---|---|
| Identity | Stable ID, display name, short timing code, description, display group, ordering, draft/published/closed state |
| Race | Road race or criterium; race day; venue/course reference; start group and classification mapping |
| Eligibility | Explicit allowed license categories, license type/status, racing age range, competition gender/class, collegiate eligibility, and organizer-review requirements |
| Schedule | Staging time, start time, time zone, check-in deadline, registration opening/closing times |
| Race length | Road-race distance and units, optional lap count and partial final lap; criterium minutes, laps, or minutes plus laps |
| Capacity | Category cap, shared capacity pools, reserved allocations if used, waitlist policy, and remaining-place visibility |
| Pricing | Base price, free entry, scheduled price changes, day-of surcharge, additional-race discount, bundle inclusion, refund/transfer policy |
| Race information | Prize/purse text and places paid, category notes, required questions and waivers, bib range policy |

Eligibility must use structured rules: AND between independent constraints, OR between allowed alternatives, and explicit exceptions. Do not infer that category numbers form a simple eligibility hierarchy. Store professional status explicitly; support organizer-facing labels such as P/1/2 and Novice with verified mappings. Masters age and license category are independent constraints. Collegiate and domestic category mappings must be explicit and approved, never guessed from display labels.

A rider whose competition class does not match a configured class (for example, a class the event has not defined) is routed to organizer review rather than accepted or refused automatically.

Racing age uses the governing body's approved discipline/season rule, not an assumed birthday calculation. Eligibility and license checks are evaluated for the relevant race date. Unknown or stale verification produces a review status, not an automatic clearance. Changes to federation rules must be versioned and reviewed before reuse next season.

#### Setup workflow

1. Choose road race, criterium, or road race + criterium weekend.
2. Add or duplicate categories in an editable schedule table; bulk-edit selected rows and arrange them under display headers.
3. Set structured eligibility, pricing, race length, and registration windows per category.
4. Combine categories into start groups; configure category caps and shared limits explicitly; preserve separate classifications.
5. Configure category-specific questions, waiver requirements, bib ranges, bundles, and additional-race discounts.
6. Preview the rider-facing schedule and simulate representative rider profiles, including riders eligible for multiple races.
7. Review validation errors and warnings, then publish a versioned configuration.

The schedule table must show category, eligibility summary, start/staging time, distance or duration, price, category cap, shared-field usage, and status. Drafts autosave. Duplicate category and copy-day actions generate new IDs and require review of inherited times, prices, rules, and capacity links. Bulk changes show a before/after preview.

CSV import of category schedules is P0: provide a template, map columns, validate into a draft, and show errors per row before saving. Never silently interpret a label as a federation rule. Export the configured schedule and rules for review; importing competitor exports does not imply access to their private systems or automatic equivalence of their rules.

#### Rider-facing behavior

- Show the complete published schedule, with eligible categories emphasized and clear explanations for unavailable or review-required options. Do not hide the schedule simply because a rider has not entered a profile.
- Display allowed categories, age/class, start time, race length, price, capacity status, and any shared-start/separate-scoring note before entry selection.
- Allow multiple eligible criterium entries when the approved schedule permits them; flag overlapping starts and configurable recovery/transition conflicts.
- A bundle selects a valid category in each component race. Do not assume the same label, eligibility, or available capacity on both days.
- Show an itemized preview of additional-race discounts, bundle pricing, and fees. Define discount precedence and prevent unintended stacking.
- Discount precedence (decided November 14, 2026): at most one bundle applies per order, the one saving the most whose races all have an entry; it covers one entry per bundle race and either takes a fixed discount or sets a fixed bundle price. The additional-race discount then applies outside the bundle in one of two organizer-chosen ways: to every entry after the first full-price entry, or once per order when two or more entries share a day (the demo fixtures use this). An entry never receives two discounts, and free entries receive none. Fees (a flat platform fee and a percentage processing fee on the entries subtotal after discounts, rounded half up to the cent) are added once per order after discounts and shown before payment.

#### Registration windows

Decided November 14, 2026:

- A category accepts new entries from its opening time (inclusive) until its closing time (exclusive), read in the event's time zone. A missing opening or closing time does not limit that side; validation already warns about it.
- The window is checked when places are held. A hold taken while the window is open can be paid within the hold's time even if the window closes meanwhile. A payment that arrives after the hold ended and after the window closed is not confirmed automatically; it goes to the organizer's exception queue.
- Riders see each category's opening or closing time; categories outside their window are shown but cannot be chosen.
- Demo events may let testers register outside the windows (an organizer setting, on by default for demo data). The rider page then labels it "Demo mode" and states when real registration opens. Real events always enforce the windows.

#### Simulated entries before payments exist

Until payments and rider registration exist, organizers can add simulated test entries to a category to check that caps, start group limits, and capacity pools hold. Test entries carry no rider data and no payment, count toward limits exactly like real entries, are labeled as test entries everywhere they appear, and can be removed in one action. They are never exported or published.

Demonstration data must be labeled as examples on every screen and must not be presented as an approved race schedule or as current federation rules.

#### Changes after registration opens

Changes to eligibility, starts, classifications, caps, pricing, or category availability require an impact preview showing affected riders, reservations, orders, and exports. Never silently invalidate or reprice a paid entry. Preserve the rules and price accepted at purchase alongside the current configuration; route affected entries to an explicit resolution workflow.

Do not allow a cap below confirmed entries plus active reservations. Splitting or combining fields requires deliberate remapping, capacity revalidation, rider communication, and a new start-list version. Archive a category with entries instead of deleting its history. Manual exceptions require an authorized role, reason, and audit record; they cannot override hard capacity or mandatory federation requirements.

#### Required category configuration examples

These are illustrative product fixtures, not an approved BHRR schedule or statements of current USAC eligibility.

| Fixture | Required behavior |
|---|---|
| Elite P/1/2 road race | Explicit Pro/Cat 1/Cat 2 eligibility; distance/laps and one field cap |
| Masters 35+ Cat 3/4 | Age threshold AND allowed license category; neither condition alone qualifies |
| Masters 50+ and 60+ sharing a start | Separate registration categories/classifications, category sublimits, one combined cap |
| Women's combined-category criterium | Explicit competition class and allowed categories; timed duration and separate scoring where configured |
| Junior age groups | Configurable racing-age bands and guardian requirements; shared starts only by explicit configuration |
| Collegiate + domestic field | Separate eligibility paths and classification codes with a shared approved capacity |
| Rider entering two criteriums | Two valid entries and an additional-race discount, with schedule conflict checks |
| Weekend entry with different day categories | One order, independently validated category selections, atomic reservation across both days |

### 2. Rider registration

- Mobile-friendly entry with reusable rider details and secure access to receipts and registrations.
- Show the published schedule with eligibility guidance; explain uncertain or blocked eligibility and provide a review path, as defined in the category builder requirements.
- Support parent/guardian entry and the applicable minor-signature workflow, subject to federation acceptance.
- Collect only required profile, contact, emergency contact, team, and license information.
- Display waiver version and signature status. Payment success alone does not mean cleared to race.
- Confirm entries only after authoritative payment confirmation. Handle delayed or failed payments explicitly.
- Permit organizer-configured changes, withdrawals, and refund requests. Show policy before checkout.

### 2a. Clickable demo purchase flow — Phase 1

Status: Implemented as a local prototype using the fake fixtures in [docs/fixtures/](docs/fixtures/README.md); automated tests cover the acceptance criterion below, including both display themes, except testing with real people (see [roadmap.md](roadmap.md#rider-checkout-prototype)). The demo is a Phase 1 prototype for usability testing, not a working checkout.

A rider can click through the whole purchase from start to finish using fake demonstration data only. The demo keeps the project's chosen visual design (set in `DESIGN.md` once one exists) and supports both [display themes](#display-themes).

Steps:

1. **Browse events.** List the demo events with date, location, and races; the rider selects one.
2. **Choose an entry.** Show the event's races and categories with eligibility guidance, start time, race length, price, and capacity status, following the [rider-facing behavior](#rider-facing-behavior) rules. The rider picks one or more entries or a bundle.
3. **Racer details.** Collect and review the required rider details, prefilled from a fake demo rider profile where available.
4. **Waiver.** Show the waiver text with its version; the rider must scroll or otherwise confirm reading, then sign (typed name plus a confirmation checkbox). The demo uses the clearly marked [sample waiver text](docs/fixtures/sample-waiver.md), not the USA Cycling waiver, and makes no claim that a demo signature is valid for any event.
5. **Review order.** Show every line item, discount, and fee from the demo data, with the total, before payment. No fee appears for the first time after this step.
6. **Simulated payment.** The rider completes a simulated payment step. It collects no card numbers or real payment details, contacts no payment provider, and moves no money.
7. **Confirmation.** Show the registration details, waiver signature status, readiness items still outstanding (for example "license needs review"), and a receipt with an order number marked as a demo.

Rules:

- **Navigation.** A visible progress indicator shows the current step. The rider can go back to any completed step without losing entered data, and cannot skip ahead past an incomplete step.
- **Validation.** Required fields are marked. Errors appear next to the field when the rider tries to continue, say what is wrong and how to fix it, are summarized at the top of the step, and are announced to screen readers. See the [accessibility rules](docs/coding-guide.md#accessibility-and-mobile-usability).
- **Simulation labeling.** Every demo screen shows a persistent, readable "Demo" label. The order review, payment step, confirmation, and receipt also state "Simulated payment: no money is charged". Buttons say "Complete simulated payment", never "Pay" or "Buy". The receipt is watermarked as a demo.
- **Separate states.** Entry, payment, and readiness states stay independent in the demo, as in the product. A simulated paid entry is not shown as cleared to race.
- **Fake rider data only.** Demo riders, prices, fees, and the sample waiver are fictional fixtures in [docs/fixtures/](docs/fixtures/README.md), which also lists the worked orders and totals a demo must reproduce. Never use real rider data or present demo prices and fees as real ones. The one real event allowed is the Berkeley Omnium, which its promoter has approved as demo event data: its fields, distances, times, and field limits come from the published race information, while its entries stay simulated and its fees stay placeholders until the promoter sets them.

### 3. Capacity and entry integrity

- Use short-lived capacity reservations during checkout. Release expired reservations.
- Enforce category and shared start-group limits atomically across all checkout paths.
- A weekend bundle reserves all its component entries together; never sell half a bundle silently.
- Distinguish unique riders, race entries, and orders in every report.
- Flag duplicate entries without preventing a rider from legitimately entering different races.
- First release supports organizer-managed waitlists. Automated promotion and charging follow later.

### 4. Organizer workspace

- Search by rider, team, bib, license number, or order.
- Filter incomplete signatures, license review, failed payments, duplicate entries, and pending changes.
- Allow authorized corrections with a reason and an audit trail.
- Record race-specific status separately from order/payment status.
- Provide transactional confirmations and targeted operational messages. Marketing consent is separate.
- Support owner, registration manager, check-in volunteer, timer/export, and finance roles. Owners can transfer responsibility to a successor.

### 5. Race-day operations

Status: check-in search, ready/blocked result, bib ranges, bib history, and repeat-safe check-in are Implemented in the local prototype on fake data (see [roadmap.md](roadmap.md#check-in-prototype)). Start-list snapshots with recorded changes and a sample CSV export are Implemented too (see [roadmap.md](roadmap.md#start-lists-and-timer-export)); the CSV format is not yet agreed with a timer. QR scanning, an agreed export format with a tested round trip, and the printable roster are Planned.

- Search or scan a check-in code; codes identify entries and contain no sensitive rider details.
- Show readiness, missing requirements, race/category, and bib assignment clearly.
- Configure bib ranges per event/day and prevent collisions within the configured scope.
- Preserve bib history when a rider changes fields. Support repeat check-in without duplicate assignment.
- Produce a timestamped start-list snapshot per race and record later changes.
- Export CSV in formats agreed with the actual timer and officials; test round trips before launch.
- Provide a minimal printable roster and exception checklist as a race-day fallback. Keep emergency contacts separate and access-restricted.
- First release requires connectivity for live changes. Full offline synchronization is deferred and must not be advertised.

### 6. Money and reporting

- Use a payment provider's hosted payment flow; do not store card details.
- Establish who collects funds, who is merchant of record, who handles payouts, and who bears disputes before taking live payments.
- Record order totals, line items, discounts, processing/platform fees, refunds, and settlement references.
- Support partial refunds against specific entries with an explicit effect on capacity and bundle pricing.
- Export a reconciliation report that a treasurer can match to provider statements.

## Core flows and acceptance criteria

| Flow | Acceptance criteria |
|---|---|
| Publish a weekend | An organizer can preview both days, correct configuration errors, and publish without developer help |
| Buy both days | Rider details are entered once; both entries and all charges appear before payment; confirmation lists both races |
| Last-place checkout | Two concurrent buyers cannot both receive the final shared-capacity place |
| Payment retry | Duplicate callbacks or refreshes cannot create duplicate orders, charges, or entries |
| License uncertainty | A rider is visibly marked for review; the system never presents an unverified license as valid |
| Category change | Eligibility and capacity are rechecked; price/refund differences and bib changes are explicit and logged |
| Recreate a race schedule | Registration lead reproduces an approved road race and criterium category matrix, questions, headers, pricing, and limits without developer help |
| Shared field cap | With category caps of 40 each and a combined cap of 60, 35 entries in A leave at most 25 places in B; concurrent purchases cannot exceed either limit |
| Category eligibility | Masters age, license category, competition class, and collegiate rules evaluate independently; incomplete verification remains review-required |
| Timed criterium | A race configured as 45 minutes + 3 laps displays and exports that format without inventing a distance or finish time |
| Multi-race discount | Eligible rider purchases two nonconflicting criteriums; configured discount applies exactly once and both entries remain distinct |
| Mixed-category weekend bundle | Each day's selection passes its own rules and limits; either all entries reserve successfully or none does |
| Category import | Valid CSV rows populate a draft; invalid/ambiguous rules produce actionable row errors and cannot publish silently |
| Published configuration change | Impact preview identifies affected entries; accepted prices and rules remain auditable; start-list revisions are visible |
| Check in | Volunteer finds a rider, sees blockers, and issues the correct bib; repeated scans remain safe |
| Export to timer | Agreed fields and IDs survive export/import; withdrawn riders and subsequent changes are clear |
| Refund | Ledger, registration state, capacity, receipt, and provider records agree |
| Organizer handoff | A second authorized organizer can operate the event and access its runbook without the original owner's credentials |
| Demo purchase flow | Using fake data only, a tester goes from event list through entry choice, racer details, waiver signature, order review with all fees, simulated payment, and confirmation without facilitator help; missing required fields block progress with field-level messages; back navigation keeps entered data; every payment-related screen and the receipt are labeled as simulated, and no real payment details are requested |
| Switch display theme | First visit follows the device's light or dark setting; the rider or volunteer can switch with a visible toggle; the choice persists on that device; text, form fields, buttons, focus indicators, errors, and status indicators meet contrast targets in both themes |
| Sign in with MFA | No account of any type reaches signed-in pages without completing a second factor; organizer sensitive actions prompt re-verification; recovery without recovery codes is audited and cannot be self-served by the first factor alone |

## Data model

Organization → Event weekend → Race day → Race → Registration categories / start groups.

Display groups organize category presentation independently of start groups. Each registration category references versioned eligibility/pricing rules, a start group, and explicit classification mappings. Capacity pools have explicit membership and limits; a reservation consumes each applicable pool once per rider/start as configured. Bundle line items reference the selected category for each component race. Race length is structured as distance, laps, duration, or duration plus laps, with units and partial-final-lap information where applicable.

Rider profiles and guardian relationships are separate from event entries. Orders contain entry and fee line items; payment attempts, refunds, waiver signatures, license checks, bib assignments, check-ins, and audit records reference stable IDs.

Keep these states independent:

- Entry: reserved, pending, confirmed, waitlisted, withdrawn, cancelled.
- Payment: pending, paid, failed, partially refunded, refunded, disputed.
- Readiness: needs information, needs waiver, needs license review, cleared, checked in.

Document permitted transitions before implementation. Financial and signature history must remain traceable after profile corrections.

## Integrations and dependencies

| Dependency | Required decision |
|---|---|
| USA Cycling | Confirm partner access, license/category validation, one-day licenses, accepted waiver/guardian workflows, and required reporting directly with USAC |
| Payments | Confirm connected organizer accounts, payouts, refunds, disputes, tax handling, and onboarding with the chosen provider |
| Timer / officials | Obtain actual accepted files and required race-day changes workflow |
| Email | Select a transactional provider with delivery status and suppression handling |
| Existing registrations | Confirm export rights and mappings; never assume signatures or payment tokens transfer |
| Results sites (road-results.com) | Research how results are updated and which registration fields (name, license number, team, category) a timer needs to build the upload file. See [Results site updates](#results-site-updates-research) |

Until USAC integration is approved, prototypes may use clearly labeled simulated checks or an agreed manual-review process. A sanctioned-event pilot requires explicit acceptance of the chosen process by the relevant parties.

### Future USA Cycling waiver and license integration

Status: Planned. No USAC access exists, and nothing in this repository connects to USAC. Build it only after USAC grants access and approves the workflow.

When access is available, the application must be able to:

- **Pull USAC waiver status.** Retrieve whether a rider (and guardian, for minors) has a valid USAC waiver for the event or season, with the waiver version, signature date, and source. Store the reference and status, not a copy of USAC's waiver text unless USAC requires it.
- **Validate rider licenses.** Check license number, name match, license type (annual, one-day, collegiate), status, expiry, discipline, and racing category against USAC for the race date, and feed the result into structured eligibility.

Design now so this can be added without reworking registration:

- Keep waiver and license checks behind a single verification interface with interchangeable sources: manual organizer review, an approved file import (for example a USAC-supplied license list), and a live USAC connection.
- Record every check with its source, timestamp, and raw result. Show freshness to organizers.
- Unknown, stale, failed, or mismatched results set readiness to "needs license review" or "needs waiver". Never clear a rider automatically on missing data, and never let a USAC outage block checkout; it routes the entry to review.
- Re-check before start-list lock and at check-in when the last result is older than an agreed freshness window.
- Keep the USAC result separate from organizer overrides. An override needs an authorized role, a reason, and an audit record, and cannot override mandatory federation requirements.

Acceptance (when access exists): a valid USAC license and waiver clear the matching readiness items; an expired, wrong-category, or missing record leaves the rider in review with the reason shown; a USAC outage leaves entries in review instead of cleared or rejected.

### Results site updates (research)

Status: Research needed. Results publishing stays out of scope; the question is what this product must provide so results reach road-results.com, where riders track results and category upgrade points.

What is known (road-results.com upload page, reviewed November 14, 2026): results are added by an account holder uploading a CSV. All categories go on one sheet with labeled category and column headers, and a name column is the minimum. A file already prepared for USAC results upload can be reused. Timing software such as CrossMgr can produce the upload file directly. No public API was found.

To research before Phase 3:

1. Who uploads for our events today (timer, promoter, or road-results staff), and whether road-results ingests sanctioned results from USAC on its own.
2. Which columns improve rider matching (license number, team, place, category, finish time) and whether our timer export should carry them.
3. Whether the timer export and the road-results CSV can share one format, so organizers do not retype data.
4. How corrections are made after upload, and who owns them.


## Quality requirements

- Phone, tablet, and desktop support; keyboard access, readable labels, clear errors, and accessible checkout.
- Light and dark display themes on every rider and organizer screen. See [Display themes](#display-themes).
- Server-enforced authorization and capacity; encrypted transport and protected secrets; least-privilege access to contact and emergency details.
- Multi-factor authentication (MFA) is required for every account sign-in: riders, guardians, and all organizer roles. A password or emailed link alone never grants access. See [Sign-in and account security](#sign-in-and-account-security).
- No sensitive rider data in public participant lists by default. Define retention and deletion rules before the pilot.
- Audit money, category, waiver, capacity, and permission changes.
- Backups with a demonstrated restore; monitoring for registration/payment failures and stuck capacity reservations.
- Publish a support owner and escalation route for each event. Volunteers must know who handles a race-morning failure.
- Load and recovery checks use twice the expected pilot opening peak, based on the organizer's historical data.

### Display themes

Status: Implemented in the local prototype (organizer, rider, and check-in screens); signed-in sync is Planned. Riders register at night and volunteers check riders in outdoors, so one fixed color scheme will not suit everyone.

- Default to the device's system preference (light or dark) on first visit.
- Provide a visible, keyboard-accessible light/dark toggle on every screen, with an accessible name that states the current theme.
- Remember the user's choice on that device and apply it before the page draws, so the screen does not flash the wrong theme. A signed-in preference may sync across devices later; that is not required for the first release.
- Text, form fields, placeholders, buttons, links, focus indicators, error messages, and status indicators (entry, payment, readiness, check-in ready/blocked) must meet the WCAG 2.2 AA contrast targets in both themes.
- Status keeps its text and icon in both themes; never rely on color alone. The check-in ready/blocked result must stay readable in bright sunlight in either theme.
- Printed or exported material (receipts, start lists, timer exports) is unaffected by the screen theme.

### Sign-in and account security

MFA means a sign-in needs a second, independent proof of identity in addition to the first factor, such as an authenticator app code or a passkey.

- Require MFA at every sign-in for every account type. Enrollment happens during account creation; an account cannot reach rider, guardian, or organizer pages until a second factor is enrolled.
- Offer at least one phishing-resistant option (passkey or security key) and an authenticator-app option. SMS codes, if offered at all, are a fallback only and are not allowed for organizer roles.
- Organizer roles (owner, registration manager, check-in volunteer, timer/export, finance) must re-verify with MFA before sensitive actions: refunds, payout or role changes, ownership transfer, exports containing contact or emergency details, and manual exceptions.
- Account recovery must not bypass MFA. Provide single-use recovery codes at enrollment; recovery without them requires identity checks by an authorized owner or support and is recorded in the audit log.
- Rate-limit sign-in and second-factor attempts, and notify the account holder when a factor is added, removed, or used for recovery.
- Record MFA enrollment, factor changes, and recovery events in the audit history.
- Shared check-in devices still require each volunteer to sign in with their own account and MFA. Do not share organizer credentials.

## Success measures

Targets below are hypotheses, not measured results. Establish the baseline with the existing process first.

| Metric | Proposed pilot target |
|---|---|
| Organizer setup and administration time | At least 30% below the equivalent existing workflow |
| Standard rider checkout | Median under 3 minutes for a returning signed-in rider, excluding external license purchase and first-time MFA enrollment |
| Standard check-in | Median under 30 seconds; 95th percentile under 90 seconds, excluding exceptions |
| Critical integrity failures | Zero oversold places, duplicate charges, lost confirmed entries, or unexplained ledger differences |
| Start-list accuracy | Every confirmed entry appears in the correct agreed export |
| Category setup completeness | Approved road race and criterium schedules can be configured without custom code or spreadsheet-only rules |
| Handoff | Two organizers and two volunteers complete their assigned tasks without developer intervention |

Capture abandonment and support requests without recording payment details or sensitive form content.

## Out of scope initially

Timing hardware, finish-line timing, omnium points/results scoring, rankings, training plans, route/weather tools, federation membership administration, international federation integrations, marketplace discovery, fundraising, and a native mobile app.

Race results and weather may be linked from the event website. They do not belong on the registration critical path. Supplying the rider fields a timer needs for results uploads is in scope once [researched](#results-site-updates-research).

## Business model hypothesis

A transparent per-paid-entry platform fee, with the organizer choosing whether to absorb it or pass it through. Confirm unit economics and rider tolerance before setting a price. Free junior entries need an explicit cost policy. Avoid advertising in checkout.

## Launch criteria

Do not replace Berkeley Omnium's registration merely because the software is available. Require validated federation and payment workflows, correct timer exports, successful event-day rehearsal, measurable workload benefit, and a named support owner. Category setup must pass every configuration fixture and acceptance criterion above using an organizer-approved road race and criterium schedule. Start with a lower-risk cycling event. Berkeley Omnium remains on its existing system until those gates pass.

## Open decisions

1. What specific tasks consume the most volunteer time today, and which are limitations of software rather than staffing?
2. How are both days, multiple entries, shared fields, discounts, and bibs currently configured?
3. Who will fund development and provide operational support after launch?
4. Will USAC approve integration and the proposed license/waiver workflow?
5. Which payment and settlement model works for the club?
6. What timer formats, refund policies, retention periods, and organizer permissions are required?
7. Which MFA methods and recovery process keep rider and guardian checkout usable, especially for occasional riders and race-morning registration? MFA itself is required; the methods are decided in the authentication ADR.
8. How do results reach road-results.com for our events, and what should the timer export include to support it?

## Research baseline

Reviewed November 14, 2026. Product requirements above are proposed; listed sources are reference points, not promised integrations.

- [USA Cycling organizer guidance](https://usacycling.org/host-an-event)
- [road-results.com results upload instructions](https://www.road-results.com/upload)
- [CrossMgr publishing to RoadResults.com](https://www.sites.google.com/site/crossmgrsoftware/project-updates/crossmgrautomaticallypublishtocrossresultscomroadresultscom)
