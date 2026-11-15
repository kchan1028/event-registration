# Product brief: cycling race registration

Status: Draft for discovery and implementation planning  
Working name: CycleReg (name availability not checked)  
Date: November 14, 2026  
First design partner: Berkeley Omnium / Berkeley Bicycle Club (proposed)

## Product decision

Build a cycling-only registration and race-day operations platform for volunteer-run U.S. bike races. **Road racing and criteriums are the primary market and must be fully supported in the first release**, including two-day weekends and omnium entry bundles. Time trials are Planned for stage-race registration after the initial road-race/criterium pilot. Other cycling disciplines are deferred. Multi-organization season passes are Planned after single-organization purchase and reconciliation are proven.

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
| Event package | Purchase containing an entry in each specified race within one event | Road race + criterium omnium package |
| Bundle / season pass | Purchase across explicitly participating events and organizations | A season pass for races hosted by several clubs |

Terminology decision (November 14, 2026): the current code and organizer UI call same-event packages "bundles". That implementation is retained for compatibility; it does not support the Planned cross-event, cross-organization bundle defined above. An omnium or stage-race package does not by itself create a separate award classification.

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

The schedule table must show category, eligibility summary, start/staging time, distance or duration, price, category cap, shared-field usage, and status. Drafts autosave. Duplicate category and copy-day actions generate new IDs and require review of inherited times, prices, rules, and capacity links. Bulk changes show a before/after preview. Status: duplicate, copy-day, and bulk edit with preview are Implemented in the local build (see [roadmap.md](roadmap.md#category-builder-milestone)). Per-category rider questions, waiver addenda, and bib ranges are Implemented too.

CSV import of category schedules is P0: provide a template, map columns, validate into a draft, and show errors per row before saving. (Implemented November 14, 2026: an import only adds categories to the draft, rows with errors are skipped only after the organizer confirms it, and the format is documented in [docs/csv-category-format.md](docs/csv-category-format.md).) Never silently interpret a label as a federation rule. Export the configured schedule and rules for review; importing competitor exports does not imply access to their private systems or automatic equivalence of their rules.

#### Rider-facing behavior

- Show the complete published schedule, with eligible categories emphasized and clear explanations for unavailable or review-required options. Do not hide the schedule simply because a rider has not entered a profile.
- Display allowed categories, age/class, start time, race length, price, capacity status, and any shared-start/separate-scoring note before entry selection.
- Allow multiple eligible criterium entries when the approved schedule permits them; flag overlapping starts and configurable recovery/transition conflicts.
- A bundle selects a valid category in each component race. Do not assume the same label, eligibility, or available capacity on both days.
- Show an itemized preview of additional-race discounts, bundle pricing, and fees. Define discount precedence and prevent unintended stacking.
- Current same-event package discount precedence (the code calls a package a bundle; decided November 14, 2026): at most one bundle applies per order, the one saving the most whose races all have an entry; it covers one entry per bundle race and either takes a fixed discount or sets a fixed bundle price. The additional-race discount then applies outside the bundle in one of two organizer-chosen ways: to every entry after the first full-price entry, or once per order when two or more entries share a day (the demo fixtures use this). An entry never receives two discounts, and free entries receive none. Fees (a flat platform fee and a percentage processing fee on the entries subtotal after discounts, rounded half up to the cent) are added once per order after discounts and shown before payment.

Berkeley Omnium demo package (November 14, 2026): one independently eligible category in Berkeley Hills Road Race and one in Berkeley Streets Criterium cost $130 as a fixed-price package. The organizer set individual entry prices at $80 for the road race and $60 for the criterium across all demo categories, so the package saves $10 before any configured fees. The applied bundle records one omnium podium nomination with the two selected category IDs and a `needs_review` status in the order quote. This is separate from each race's classifications and creates no third race entry or capacity consumption. A nomination on a held order is provisional; only confirmed orders represent entered packages. The organizer must approve award categories, cross-day category combinations, participation requirements, and final eligibility. Points, results, podium calculation, and nomination approval tools are not built. These prices were supplied by the organizer for the local build; purchases remain simulated. Existing seeded events and published orders are unchanged; load a new Berkeley demo to use this package.

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

Changes to eligibility, starts, classifications, caps, pricing, or category availability require an impact preview showing affected riders, reservations, orders, and exports. Never silently invalidate or reprice a paid entry. Preserve the rules and price accepted at purchase alongside the current configuration; route affected entries to an explicit resolution workflow. Status: the impact preview and an organizer resolution workflow (record kept, transferred, or withdrawn, and that the rider was told) are Implemented in the local prototype.

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

### Reusable organizer templates

Status: Planned enhancement for later implementation, beyond the existing format templates and Berkeley demo loaders. Current road-race, criterium, and weekend templates create event structure without categories. This enhancement does not replace the category builder or add a separate template for every possible field combination.

Use three reusable layers:

| Layer | Contents | Organizer choices |
|---|---|---|
| Event format | Day/race structure and package setup appropriate to the format | Road race, criterium, omnium; stage race only when TT support exists |
| Category presets | Editable names, explicit eligibility paths, guardian requirements, and classification definitions | Elite, novice, masters age/license combinations, junior age bands, collegiate; select individual categories from each set |
| Start configuration | Deliberate category membership in starts, separate classifications, and explicit capacity links | Separate starts or a shared start with separate scoring and a configured field limit |

- Organizers choose a starter, add/remove/edit category presets, arrange starts, and set event-specific dates, times, lengths, prices, windows, capacities, and package/overall-participation rules. Changes remain editable in the regular builder. Applying a preset is an explicit configuration action, never an inference from a display label.
- Provide a named Berkeley example assembled from these layers, clearly labeled as draft/example data. Reuse the road-race and criterium category sets independently: shared masters starts, collegiate/domestic paths, junior groupings, and women's race choices can differ by day. Do not assume identical cross-day categories or awards. Do not generate every age/license/class combination automatically.
- Let an organizer save a reviewed setup for their organization and copy a previous edition without copying riders, entries, payments, signatures, bib assignments, or check-in records. Template visibility and editing require appropriate organization permissions; public sharing is not implied.
- Record template version, source event/version where applicable, season, rule source, and review status. Applying or copying creates fresh configuration IDs and remaps all included category/start/classification/capacity/package references. Later template edits must not mutate existing drafts, published versions, or paid orders.
- Never treat missing values as approved defaults. Unset caps, ambiguous eligibility, dates, start/staging times, prices, capacity relationships, and outdated rule sources appear in a required review checklist. Starter values may be retained only with their provenance and explicit review; the normal publish validation still applies. A template is not current federation approval.
- Provide a before/after preview when adding presets to a populated draft, showing duplicate labels/codes and affected references. Never silently merge categories, classifications, starts, or capacity pools. Existing post-publication impact checks remain mandatory.

Acceptance: an organizer uses the same two masters category presets to configure separate road-race starts and a shared criterium start with separate classifications, without creating separate full-event templates. A second organizer loads the named Berkeley example, edits it, saves an organization template, and creates next season's draft with fresh IDs and no participants or financial/signature history. Unknown rules/limits remain visible for review, and later source-template changes do not modify previously created events. Verify with organizers before calling the workflow complete.

#### Template case-study coverage

Status: Research documented November 14, 2026; reusable template implementation remains Planned. The [case-study set](docs/case-studies/organizer-templates/README.md) covers Redlands Bicycle Classic, Chicago Grit, Tulsa Tough, Berkeley Omnium, Golden State Race Series, and California Bicycle Racing (CBR, confirmed by the product owner).

Use their proposed setup exercises to validate selectable presets, per-day category availability, independent staging/start times, shared starts versus classifications, package membership versus overall participation, copied-event overrides, and unresolved-source review. These are representative research cases, not approved event configurations or implemented acceptance tests. Their source editions and original publication links are recorded per case; never import real rider records or infer federation approval.

The cases expose design dependencies to resolve before claiming coverage: Chicago's ten-day program exceeds the current seven-day schema limit; TT and circuit representation, team-managed invitational entry, dual-duration starts, and flexible future-use entitlements are not implemented. Do not silently truncate, relabel, split, or auto-correct a source to make a template load. A missing capability or contradictory source value must be shown as unresolved. Professional/team workflows and open-ended season benefits require a further scope decision; results scoring remains excluded.

### Omnium and stage-race setup

Status: Planned organizer workflow. Same-event package pricing exists, but there is no dedicated competition setup or editable podium/overall-participation configuration. Time-trial support is not built.

- Choose single race, omnium, or stage race. Add ordered days and component races, including a TT when supported; configure TT distance, category schedule, and rider start intervals separately from a mass-start field.
- Keep purchasable categories, race starts, capacity, per-race classifications, and overall-participation records separate. Define permitted category combinations across races explicitly; never match eligibility or award groups by category labels alone.
- Configure individual-race entry availability independently from the full-event package. Omnium and stage-race participation rules must be organizer-defined and reviewed; no assumed federation rule applies merely because a format was chosen.
- Configure fixed package pricing and list exactly which race entries it includes. Reserve every component atomically. Record an explicit overall-participation selection and its review status, separate from payment and race readiness. Provide organizer controls for reviewing nominations without implementing results scoring.
- Preview partial selections, ineligible combinations, a full component race, extra entries, category transfers, withdrawals, and the effect on overall participation before publishing. Preserve accepted rules and prices; never silently convert individual entries into overall participation or revoke it after a change.

Acceptance: an organizer configures the Berkeley $130 road-race/criterium package and the Planned $160 TT/road-race/criterium package, sees all entries and savings before checkout, and explicitly controls overall-participation rules. A full component prevents sale of the entire package. Both formats export component entries and reviewed overall-participation identifiers for the timer; no points, elapsed-time aggregation, or results are calculated here.

### Cross-organization bundles and season passes

Status: Planned. A bundle can include races from multiple events run by different organizations. The first version offers an explicit published list of races, one eligible category per required component, one total price, and stated savings and policies. Flexible credits, unlimited passes, and choosing races after purchase require a later product decision; the first version creates the selected entries at purchase.

- A coordinating organization proposes the bundle; every participating organization approves its races, category mappings, capacity participation, revenue allocation, cancellation terms, and refund responsibilities before sale. Publishing requires all approvals.
- Each component points to its organization, event, race, selected category, and accepted configuration version. One purchase can create event-specific orders or allocations linked to a common purchase record; an organization's users can access only their own riders, entries, and permitted financial information.
- Recheck eligibility, dates, waivers, windows, and capacity per race. Reserve all required components atomically; a sold-out or unavailable race prevents the purchase. A pass is not a guarantee that eligibility or readiness is cleared.
- Itemize entry allocations, discounts, fees, and each organization's proceeds. Revenue shares and discount allocations must reconcile exactly to the purchase total. Define coupon compatibility, rounding, tax responsibility, settlement timing, and cancellation/partial-refund allocation before publication.
- Confirm fulfillment only from authoritative payment notifications. Failed payment releases all component holds. Delayed payment, a participant account that cannot receive funds, or transfer failure produces an actionable exception with reconciliation status, not an invented successful payout.
- Refunds, category changes, withdrawals, and cancellation of one participating event must preserve the accepted bundle policy and historical allocation. Show the rider any effect on remaining entries and overall eligibility before confirmation; never silently reprice remaining paid entries.

Acceptance: two approved organizations sell one season pass for their selected races; the rider enters details once and reviews every entry and organization-specific requirement. Concurrent purchase cannot oversell any component. Duplicate notifications create no duplicate entries or settlements. Each organization can reconcile only its allocated proceeds; a partial cancellation produces an auditable refund allocation and clear status for the remaining races. Live sales depend on the accepted multi-organization Stripe operating model.

### Standalone Berkeley demo events

Implemented local demo: Berkeley Hills Road Race and Berkeley Streets Criterium can be seeded as separate published events, each with its own race day, race, categories, and capacity usage. Base prices are $80 and $60 respectively. These fixtures contain no package or podium nomination, no prefilled entries, zero fees and surcharges, and no extra-entry discount. Demo mode permits testing outside registration windows. The seed creates both events atomically and reruns preserve event IDs, edits, and published versions without deleting other local data. See [demo setup](SETUP.md) and [event reference](docs/fixtures/events.md).

### Planned three-day series demo

The previously requested Demo Three-Day Series uses Berkeley Omnium's category definitions as draft reference data: Friday time trial $50, Saturday road race $80, and Sunday criterium $60. A fixed $160 package includes one independently eligible entry in all three races, saving $30 against the $190 base total. Reservation must be all or nothing. Two-day selections receive no series package discount. The TT category set copies the road-race category definitions for review; this is not approval of TT eligibility rules.

Status: Planned documentation only. The current app does not support time trials or load this series. Dates, TT scheduling and capacity, fees, additional discounts, and series awards remain unset. This specification feeds the Planned stage-race setup workflow after the initial pilot; it adds no points/results scoring.

### 2. Rider registration

- Mobile-friendly entry with reusable rider details and secure access to receipts and registrations.
- Show the published schedule with eligibility guidance; explain uncertain or blocked eligibility and provide a review path, as defined in the category builder requirements.
- Support parent/guardian entry and the applicable minor-signature workflow, subject to federation acceptance.
- Collect only required profile, contact, emergency contact, team, and license information.
- Display waiver version and signature status. Payment success alone does not mean cleared to race.
- Confirm entries only after authoritative payment confirmation. Handle delayed or failed payments explicitly.
- Permit organizer-configured changes, withdrawals, and refund requests. Show policy before checkout.
  - Status: organizer transfers and withdrawals of paid entries are Implemented in the local build (see [roadmap.md](roadmap.md#rider-checkout)). A transfer rechecks eligibility, capacity, the waitlist, schedule conflicts, and the guardian waiver; the price paid is kept and any difference is recorded as owed or due. Rider-initiated change requests and real refunds are Planned.

### Rider self-service

Status: Planned; organizer transfers and withdrawals already exist in the local build.

After sign-in, riders can view their registrations, receipts, waiver/readiness requirements, waitlist offers, and pending changes. Policies determine whether a change can be completed directly or requires organizer approval. Category-change previews must recheck eligibility, capacity, schedule conflicts, waivers, overall-participation rules, and package/pass effects, and show any charge or refund before submission. Transfers to another person require an explicit event policy, separate recipient consent and eligibility, and new required waivers; a signature is never transferred. Changes are reasoned, audited, and notified to affected parties. No rider can access another rider's private registration by guessing an order ID.

Acceptance: an authenticated rider completes an allowed change or withdrawal, sees the financial effect, and retains the original receipt plus a change record; a blocked change gives a reason and organizer-review path. Failed or duplicate payment/refund processing cannot apply the entry change twice. Self-service must not bypass a waitlist or capacity limit.

### Reusable credits and deferrals

Status: Planned. A reusable credit is an auditable amount owed by its issuing organization to a rider for eligible future purchases. A deferral moves participation to a future event under an approved policy; it is not the same as a category transfer, a cash refund, or a guaranteed place next season.

#### Reusable credits

- Authorized finance staff can issue a credit with the source entry/payment when applicable, rider, issuing organization, currency, amount in integer cents, reason, allowed events/categories, expiry, and policy version. Riders see the original amount, remaining balance, expiry, restrictions, and redemption history. Do not infer matching rider identity from email alone.
- Treat credit as a payment allocation after the published price, discounts, and applicable fees are calculated, not as a second price discount. Define eligible charges, fee/tax treatment, partial use, expiry, cancellation, and restoration rules before publishing the credit policy. A credit is not a Stripe balance, payout, or automatic promise of cash redemption.
- Reserve credit during checkout and commit redemption atomically with the confirmed purchase. Expired/failed/cancelled holds release the reserved credit. Concurrent checkouts cannot spend the same balance twice. If Stripe collects a remaining amount, repeated or delayed notifications cannot duplicate credit usage or entries; exceptions require an explicit resolution record.
- Support purchases partly paid by credit and partly by Stripe. If the eligible total is fully covered, confirm from the internal credit transaction without creating a fictitious Stripe charge. Preserve the accepted quote and separate cash/credit amounts on receipts and reports.
- A refund, withdrawal, deferral, or cancellation records whether value is returned as cash or credit, under the accepted policy. Never both refund and issue credit for the same value. Refunds restore the appropriate original payment allocations under the policy; duplicate requests cannot over-refund or over-credit.
- Start with same-organization credits. Cross-organization redemption, including a season-pass component, requires participating-organizer consent, explicit liability/funding allocation, and the approved multi-organization settlement model. Do not assume one club's credit can pay another club's entry.

Acceptance: a $50 credit can pay $30 of one eligible entry and the remaining $20 toward another; balances, receipts, and finance exports reconcile. Two concurrent attempts cannot spend the final balance twice. An expired or restricted credit is refused with an explanation. Failed mixed credit/Stripe checkout leaves no duplicate redemption or silently lost value.

#### Deferrals

- Organizers configure the deferral window, eligible source/destination events and categories, maximum deferrals, fee or price-difference policy, and whether rider requests require approval. Show the financial and participation consequences before the rider agrees.
- A direct move to an available published future event rechecks destination eligibility for its race date, registration window, capacity, schedule, guardian/waiver requirements, and waitlist priority. Change source and destination entries atomically. Do not release the original entry if a required destination reservation fails.
- If next season is not published or no place is available, an approved credit-based deferral may withdraw the source entry and issue restricted future credit. State clearly that the credit reserves no destination place and cannot bypass the waitlist.
- Keep the source order, accepted rules/prices, source withdrawal, destination entry or credit reference, reason, and decision history linked. Do not copy a signed waiver, race readiness, or event-specific bib into a new event. Notify the rider and refresh affected start lists. Changes to an omnium/stage package or season pass require review of remaining component entries and overall participation.

Acceptance: an eligible rider can defer under the published policy with one traceable source/destination record or credit issuance. An unavailable target leaves the original entry unchanged unless the rider explicitly accepts a credit-based deferral. A replay cannot issue a second credit, consume a second place, or withdraw the source twice.

### 2a. Clickable demo purchase flow — Phase 1

Status: Implemented locally using the fake fixtures in [docs/fixtures/](docs/fixtures/README.md); automated tests cover the acceptance criterion below, including both display themes, except testing with real people (see [roadmap.md](roadmap.md#rider-checkout)). The demo uses simulated payment for usability testing; it is not a live checkout.

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
- **Fake rider data only.** Demo riders, prices, fees, and the sample waiver are fictional fixtures in [docs/fixtures/](docs/fixtures/README.md), which also lists the worked orders and totals a demo must reproduce. Never use real rider data or present demo prices and fees as real ones. The one real event allowed is the Berkeley Omnium, which its promoter has approved as demo event data: its fields, distances, times, and field limits come from the published race information, while its entries stay simulated and its base fees are promoter-set at $80 for the road race, $60 for the criterium, and $130 for the package.

### 2b. Deterministic case-study fixtures

Status: Implemented locally and verified with unit, API, and representative browser tests. These fixtures broaden test coverage; they do not add live product support or replace validation with riders and organizers.

- Provide stable, repeatable scenarios for a multi-category criterium, shared-field road race, two-day same-event omnium, empty draft, and large event. Use the fixed reference clock `2027-03-15T18:00:00.000Z` for time-dependent assertions.
- Include fictional success, duplicate notification, declined/retried, expired hold, and unresolved-license examples. Keep payment, entry, waiver, and readiness states separate and label every payment as simulated.
- Provide one-scenario and full-collection loaders. Reruns must not duplicate events or orders. Reset must delete only records owned by the generated case-study organization and preserve unrelated local data.
- Use reserved example addresses and phone numbers. Never load real rider data, contact a provider, or create live charges.
- Represent unsupported workflows as documented future requirements, not fake working states. Cross-event packages, automated waitlist delivery, real refunds, rider-to-rider transfers, event cancellation, and approved post-order waiver resolution remain Planned.

Acceptance: two independent builds produce equal configurations and stable IDs; the full collection loads and reruns safely; collection reset preserves an unrelated organization; pricing boundaries, eligibility, shared capacity, package totals, atomic reservation, duplicate requests/notifications, recovery states, and readiness transitions pass automated tests; browser tests complete a rider decline/retry purchase and organizer license-review/export journey and render empty and 120-category organizer states. Exact cases and expected outcomes are in [fixture documentation](docs/fixtures/README.md#generated-race-case-studies).

### 3. Capacity and entry integrity

- Use short-lived capacity reservations during checkout. Release expired reservations.
- Enforce category and shared start-group limits atomically across all checkout paths.
- A weekend bundle reserves all its component entries together; never sell half a bundle silently.
- Distinguish unique riders, race entries, and orders in every report.
- Flag duplicate entries without preventing a rider from legitimately entering different races.
  - Status: same-rider suggestions across orders, with organizer-confirmed linking (never automatic), are Implemented in the local build (see [roadmap.md](roadmap.md#check-in)).
- First release supports organizer-managed waitlists. Automated promotion and charging follow later.
  - Waitlist policy (decided by the project owner, November 14, 2026): the organizer turns a waitlist on per category; it is off by default. While anyone is waiting or holds an offer, freed places go to the waitlist first and the category is not sold to the public. The organizer offers places in order; an offer reserves the place for 24 hours and the rider registers and pays through a private link. An unused offer expires and the organizer offers the next rider.
  - Status: Implemented in the local build (see [roadmap.md](roadmap.md#rider-checkout)). Offer links are copied by the organizer; no email is sent.

### 4. Organizer workspace

- Search by rider, team, bib, license number, or order.
- Filter incomplete signatures, license review, failed payments, duplicate entries, and pending changes.
- Allow authorized corrections with a reason and an audit trail.
- Record race-specific status separately from order/payment status.
- Provide transactional confirmations and targeted operational messages. Marketing consent is separate.
- Support owner, registration manager, check-in volunteer, timer/export, and finance roles. Owners can transfer responsibility to a successor.

### Participant management

Status: Planned beyond the Implemented event-level Registrations queue, organizer transfers/withdrawals, and check-in lookup. This manages race participants, not volunteer recruitment or staffing.

- Provide a participant workspace across events an organizer is authorized to manage, backed by reusable rider identity. Distinguish people, event registrations, race entries, orders, waitlist records, credits, and payment/readiness states; several entries must not become several unrelated rider profiles.
- Search by rider, team, permitted license identifier, bib, order, event, or category. Filter by race/day, status, missing waiver/license review, payment exception, waitlist, and package/pass membership. Show a history of registrations, communications, changes, credits, and deferrals with source dates and reasons.
- Save named filtered views with selected columns and deterministic sorting for registration, check-in, timing, and finance tasks. Export the authorized view to CSV with a generated-at time, active filters, stable IDs, and spreadsheet-formula protection. Export only fields permitted for the role; saved views never bypass current access checks.
- Provide permitted record actions for corrections, review, waitlist offers, transfers, withdrawals, refund/credit requests, deferrals, and confirmation resend. Show affected records, eligibility/capacity/financial consequences, and confirmation before bulk changes. Apply the same per-entry rules as individual changes and report success/failure per selected record; never silently skip or partially apply an individual entry change.
- Flag possible duplicate people for authorized review without automatically merging by name, email, or license label. Any correction or future identity merge must preserve entry, financial, waiver, and audit history. Do not turn an event-participant list into an unrestricted mailing list.
- Organization and role boundaries apply to search, history, saved views, exports, and bulk actions. A season-pass coordinator sees only the approved shared data; one organization cannot browse another's private rider/finance records. Emergency contacts and minors' details retain restricted access.

Acceptance: an authorized organizer finds one rider's multiple race entries without inflating unique-rider counts, saves and reloads a view, and exports matching permitted rows. A denied organization or role cannot access those records through search, exports, or a saved-view URL. Bulk preview and results make refused records and reasons visible, and no operation silently merges identity or rewrites accepted financial/waiver records.

### 5. Race-day operations

Status: check-in search, ready/blocked result, bib ranges, bib history, repeat-safe check-in, undoing a mistaken check-in with a reason, and measured check-in times (median and 95th percentile per day) are Implemented in the local build on fake data (see [roadmap.md](roadmap.md#check-in)). Start-list snapshots with recorded changes, an organizer start-list lock whose later changes show as revisions, and a sample CSV export are Implemented too (see [roadmap.md](roadmap.md#start-lists-and-timer-export)); the CSV format is not yet agreed with a timer. A printable fallback roster with an exception checklist is Implemented (see [roadmap.md](roadmap.md#check-in)). QR check-in codes on the confirmation and camera scanning at check-in (Chrome and Edge) are Implemented; an agreed export format with a tested round trip is Planned.

- Search or scan a check-in code; codes identify entries and contain no sensitive rider details.
- Show readiness, missing requirements, race/category, and bib assignment clearly.
- Configure bib ranges per event/day and prevent collisions within the configured scope.
- Preserve bib history when a rider changes fields. Support repeat check-in without duplicate assignment.
- Produce a timestamped start-list snapshot per race and record later changes.
- Export CSV in formats agreed with the actual timer and officials; test round trips before launch.
- Provide a minimal printable roster and exception checklist as a race-day fallback. Keep emergency contacts separate and access-restricted.
- First release requires connectivity for live changes. Full offline synchronization is deferred and must not be advertised.

### Automatic and bulk bib assignment

Status: Planned beyond the Implemented check-in-time next-free/manual assignment, bib ranges, collision protection, and bib history.

- Configure allocation per event or day and map ranges explicitly to the applicable races/start groups/categories without allowing duplicate active numbers inside the configured collision scope. A shared start or multiple classifications must not accidentally allocate extra bibs to the same rider. Range/category overlap and invalid scope combinations produce actionable errors before use.
- Offer opt-in automatic allocation after entry confirmation, not during an unpaid hold. Replayed confirmation or background retries reuse the same active assignment. Receiving a bib does not imply a waiver, verified license, or readiness clearance.
- Offer bulk allocation for selected confirmed registrations, scoped by day/race/category and optionally unassigned riders only. Configure sort by surname/given name, registration time, or category/start order, with a stable ID tie-breaker. Preview rider, current bib, proposed bib, range, and conflicts before applying.
- Preserve existing manual assignments, checked-in riders, and issued/printed bibs by default. Reassignment requires an authorized role, a reason, a before/after preview, and new start-list snapshots where needed. Do not erase assignment history or override the existing rule that an organizer category transfer keeps its issued bib; identify a conflict for deliberate resolution instead.
- Apply an approved bulk allocation atomically; insufficient range space, concurrent allocation conflict, or stale preview requires correction and a fresh preview without leaving half the selected riders assigned. Concurrent automatic/manual/bulk actions must respect the same uniqueness constraints.
- Report assignments and excluded riders with reasons, preserve audit history, and allow later walk-up riders to consume only available numbers. A reset/reallocation is a controlled historical change, not deletion of issued-bib history. Cross-event season bib reuse remains a separate later feature.

Acceptance: allocate a full confirmed field in stable order, repeat without changing bibs, and run concurrent allocations without collisions. An exhausted range or changed preview applies no partial batch. Existing manual and checked-in assignments remain intact; approved changes preserve history and appear in the next start-list revision. Paying or receiving a bib alone never marks a rider cleared.

### 6. Money and reporting

- Use Stripe hosted Checkout for the Planned payment integration, selected by the product owner November 14, 2026 ([ADR 0002](docs/decisions/0002-stripe-payments.md)). No Stripe integration or account is configured today; the current demo stays simulated. Never store card details.
- Establish who collects funds, who is merchant of record, who handles payouts, and who bears disputes before taking live payments.
- Record order totals, line items, discounts, processing/platform fees, refunds, and settlement references.
- Support partial refunds against specific entries with an explicit effect on capacity and bundle pricing.
- Export a reconciliation report that a treasurer can match to provider statements.

### Communications

Status: Planned. Deliver registration confirmations, receipts, payment/refund updates, waitlist offers and expiry notices, entry-change decisions, and race-day instructions through transactional email. Organizer tools target operational messages by event, race, category, or readiness exception. Changes to race schedules or cancellations show the affected audience and a preview before sending.

Use versioned templates, an audit trail, delivery/bounce status, safe retries, and suppression handling. A failed delivery appears in the organizer queue without changing entry or payment state. Sensitive data, waiver signatures, and emergency contacts stay out of message content and public links. Marketing messages require separate consent and an unsubscribe mechanism; an operational message must not silently become a marketing campaign. The email provider remains an open decision.

Acceptance: payment confirmation triggers one logical confirmation despite repeated notifications; an offered waitlist place reaches the intended rider with its expiry and secure access; organizers can identify undelivered notices and retry safely.

### Promotions

Status: basic event coupons are Implemented in the local build (see below); the rest is Planned. Configure fixed-amount or percentage coupon codes, eligible events/categories, validity windows, global/per-rider redemption limits, and explicit combinability. Referral offers and registration-count price tiers follow after the basic coupon workflow. Count committed redemptions atomically and release abandoned reservations so concurrent checkouts cannot exceed a limit. Lock the accepted discount and tier price in the order.

Preview discount precedence before checkout. An entry receives at most one price reduction under the default rule. Combining a coupon with a package or season pass requires an explicit approved rule; no accidental stacking. Cross-organization promotions require every affected organization's approval and an agreed allocation of the discount. Zero-cost entries remain zero, and no discount creates a negative price.

Acceptance: an eligible code applies once with the advertised saving; expired, exhausted, or inapplicable codes explain why they do not apply. Concurrent final redemptions cannot exceed the configured limit. Refund and cancellation handling follows the published redemption policy.

Basic coupons (Implemented in the local build, November 15, 2026; see [roadmap.md](roadmap.md#rider-checkout)):

- An organizer creates codes per event on **Registrations**: a percentage off each eligible entry or a fixed amount off the order, optional start and end times in the event's time zone, eligible categories (none ticked means all), and an optional total cap. Codes are case-insensitive and can be turned off and on; they are never deleted.
- Discount precedence (product decision, November 15, 2026): one code per order. The coupon applies after the bundle, same-race extra-entry, and additional-race discounts, and only to eligible entries none of those discounted, so an entry still receives at most one reduction. A percentage rounds half up to the cent per entry; a fixed amount is split across the eligible entries in proportion to price and never exceeds them. Fees are calculated after the coupon. Combining a coupon with a bundle is not offered; it would need an explicit approved rule.
- Redemption policy: a held order reserves a redemption; paying confirms it; an expired or cancelled hold releases it. A payment after the hold expired confirms only if the cap still has room, otherwise it goes to the organizer's queue. A paid order keeps the discount it accepted even if the code is later turned off or edited, and a transfer or withdrawal does not return the redemption.
- Not built: per-rider limits, combinability rules, cross-organization promotions, referral offers and registration-count tiers.

### Reporting

Status: Planned reporting workspace; start lists, snapshots, sample timer CSV, and organizer entries and simulated-ledger CSV exports already exist (see [roadmap.md](roadmap.md#rider-checkout)). Provide role-restricted event/day/race/category counts, unique riders versus entries versus orders, revenue and discount breakdowns, fees, refunds, issued/redeemed/expired/outstanding credit balances, deferrals, payment exceptions, outstanding readiness items, and waitlist activity. Count credit liability separately from cash receipts and avoid counting a deferral as new cash revenue. Finance reports link entry allocations to Stripe payment, refund, transfer, and payout references. Export totals reconcile exactly, including per-organization season-pass allocations.

After reusable rider identity and organization permissions exist, support cross-event participant search, registration-history lookup, and prior-year registration pace comparisons within authorized data. Seasonal reports expose each organization's own entries and allocations; the coordinating organization receives only the approved aggregate view. Avoid expanding personal-data collection solely for analytics.

Acceptance: filters and exports agree with a timestamped source dataset; transfers, withdrawals, refunds, and duplicate notifications preserve accurate counts and money totals; an organizer cannot see another organization's protected rider or finance data.

### Race-day registration

Status: Planned, distinct from the Implemented check-in workflow. Authorized staff can add a walk-up rider or direct them to a mobile/kiosk entry flow while enforcing the same eligibility, registration-window, capacity, guardian, waiver, and waitlist rules as advance registration. Configure race-day opening/closing times and surcharges explicitly. Staff need a reason and audit record for an allowed exception and cannot override hard capacity or mandatory requirements.

Use the selected Stripe hosted payment flow for online collection. Cash/check recording, complimentary entries, and any physical card-terminal integration require explicit permissions, reconciliation rules, and a further integration decision; do not imply they are supported by selecting Stripe. Never collect card numbers in CycleReg. Show pending payment separately from readiness, then issue a bib and update the timestamped start list only under the applicable confirmed-entry rules. Connectivity is required; the printable roster remains a contingency, not offline synchronization.

Acceptance: a walk-up rider can register, satisfy or be routed for required checks, complete confirmed payment, and appear once in the correct start list without overselling the last place. A failed payment does not clear check-in, and repeated staff actions cannot create duplicate entries or charges.

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
| Sign in (Phase 2; how riders and guardians always sign in) | No account of any type reaches signed-in pages without completing passwordless email sign-in (an emailed link or code); sign-in attempts are rate-limited; a rider change that moves money or hands an entry to someone else asks for a fresh emailed code; the app holds only fictional data and takes no live payments until organizer MFA ships |
| Organizer sign-in with MFA (Phase 3, required before the live pilot) | No organizer account reaches organizer pages without completing a second factor; organizer sensitive actions prompt re-verification; recovery without recovery codes is audited and cannot be self-served by the first factor alone |

### Berkeley weekend acceptance criteria

Status: Planned acceptance refinements from the [code-based expert review](docs/usability/pilot-run-2026-11-14.md#berkeley-weekend-case-study-code-based-expert-review), not participant findings. Berkeley is a reference scenario, not an official partnership or approved race schedule. Riders need correct choices and a predictable total; parents need clear signer responsibility; organizers need correct shared fields; volunteers need an unmistakable reason and next step when a paid rider cannot race.

| Workflow | Measurable acceptance requirement |
|---|---|
| Configure Saturday road / Sunday criterium | Without developer intervention, configure structured eligibility, dates, time zone, separate staging/start times, category caps, shared start limits, and $80/$60 demo prices with a $130 event package. Preview both days and publish only after errors are fixed and warnings acknowledged. Display groups create no limit. Missing official times, limits, and ambiguous eligibility stay explicitly unresolved. |
| Choose both days | For the pre-race, zero-fee fixture, eligible RR-M50-34 + CR-M50-34 quotes $140 base, $10 saving, $130 total. Show included races/dates, category choices, fees, missing choices, and independent eligibility/review state before reservation. Package intent must not silently turn into an unwanted single-day purchase. Server validation must preserve that intent in the future; it currently is browser-only. |
| Add a criterium entry | RR-M50-34 + CR-M50-34 + CR-E4 quotes $150 before day-of changes, with $10 package and $40 extra-entry savings, each applied once. Show the 10-minute recovery warning; do not call it a blocking overlap. CR-M35-34 + CR-M50-34 must be rejected as a shared start regardless of the quote. Server repeats selection checks. |
| Parent and minor | Guardian details and matching guardian acceptance are required for every minor, including minors in adult/open categories, as well as any category with an explicit guardian requirement. Category flags alone are insufficient. Confirm the governing age convention and accepted guardian workflow before sanctioned use. Missing guardian or wrong signer blocks checkout; never describe a sample signature as a legally accepted waiver. |
| Full category and last place | Show which category or shared start is full and the available next step. If any required package place is unavailable, reserve none. Two concurrent final-place requests cannot both succeed. A waitlist request/offer is not a confirmed entry; offer acceptance rechecks eligibility, windows, and capacity. Count a rider once per shared limit within an order. Organizer-confirmed post-order links must not be described as pre-checkout identity or capacity deduplication across separate orders. |
| Recover checkout | Keep fictional details and unaffected selections after a field error, Back, same-tab refresh, simulated decline, or recoverable server failure; focus an error summary linking to the affected field/action. Retry creates no duplicate confirmed entries. Expired holds explicitly recheck all places or go to an exception, never silently sell a partial package. Production draft storage/retention and hosted-return behavior require separate validation. |
| Confirm and check in | Show entry, payment, waiver/guardian, and license states separately, with a next action for every blocker. Paid + missing waiver, guardian acceptance, or unresolved license must block bib issuance server-side. Repeat check-in retains the same active bib. A waiver-resolution workflow must record the accepted version, signer/role, source, and date under an approved electronic or paper process before readiness changes; this is Planned beyond sample checkout. |
| Accessible task completion | Both themes meet normal text 4.5:1, large text 3:1, and essential UI/focus 3:1 contrast against composited backgrounds. At 360px, 200% zoom, keyboard-only, and screen-reader use, labels, totals, errors, and focused actions remain available. Use 44px effective mobile targets. Glass is limited to navigation/overlay frames; forms, totals, and tables stay opaque. Reduced transparency and reduced motion retain all information and operation. See [DESIGN.md](DESIGN.md) for review checks; future glass alternatives are not implemented yet. |
| Validate with people | Run the initial 3–5 rider/parent and 2–3 organizer/volunteer round using the existing kit, report task-level completion/errors/help/time and price/clearance teach-back, and resolve safety-critical misunderstandings. This formative round does not replace the larger Phase 1 panel or its 90% gate. No participant findings may be inferred from expert review or automated tests. |

Live sanctioned use depends on explicit USAC platform/waiver acceptance or an approved alternative, license access or an accepted manual process with freshness rules, and payment/settlement readiness under [Integrations and dependencies](#integrations-and-dependencies). These are release gates, not optional polish. A same-event package is distinct from a purchase spanning separate events/organizations, which remains Planned.

## Data model

Organization → Event weekend → Race day → Race → Registration categories / start groups.

Display groups organize category presentation independently of start groups. Each registration category references versioned eligibility/pricing rules, a start group, and explicit classification mappings. Capacity pools have explicit membership and limits; a reservation consumes each applicable pool once per rider/start as configured. Same-event package line items reference the selected category for each component race. Planned cross-organization bundles additionally need a common purchase record, explicit organization/event/race/category and accepted-version references, approvals, and per-organization discount/revenue/refund allocations. Current event-scoped orders do not implement these relationships. Race length is structured as distance, laps, duration, or duration plus laps, with units and partial-final-lap information where applicable.

Rider profiles and guardian relationships are separate from event entries. Orders contain entry and fee line items; payment attempts, refunds, waiver signatures, license checks, bib assignments, check-ins, and audit records reference stable IDs.

Keep these states independent:

- Entry: reserved, pending, confirmed, waitlisted, withdrawn, cancelled.
- Payment: pending, paid, failed, partially refunded, refunded, disputed.
- Readiness: needs information, needs waiver, needs license review, cleared, checked in.

Document permitted transitions before implementation. Financial and signature history must remain traceable after profile corrections.

### Data storage

A database is required. It is the system of record for:

- **User data:** accounts and sign-in factors, rider profiles, guardian relationships, emergency contacts, and organizer roles and permissions.
- **Event data:** organizations, event weekends, race days, races, categories, start groups, capacity pools, pricing rules, registration windows, and published versions.
- **Registration and race-day data:** orders, entries, capacity reservations, payment and refund references, waiver signatures, license checks, bib assignments, check-ins, and start-list snapshots.
- **Audit history** for money, category, waiver, capacity, and permission changes.

Requirements:

- Transactions strong enough to enforce shared capacity limits when riders register at the same moment; the database, not the browser, decides who gets the last place.
- Encryption at rest and in transit, with least-privilege access to contact, emergency, and minor riders' data.
- Automated backups with a demonstrated restore, and retention and deletion rules agreed before the pilot (see [Quality requirements](#quality-requirements)).
- Card details are never stored; keep only the payment provider's references.
- Organizer exports (entries, start lists, ledger) come from the database, so a successor can take over without manual reconstruction. Status: entries, start-list, and simulated-ledger CSV exports are Implemented in the local build (see [roadmap.md](roadmap.md#rider-checkout)).

The local build stores data in a PostgreSQL database on the developer's computer. [ADR 0004](docs/decisions/0004-hosted-stack-and-database.md) chose managed PostgreSQL (Render Postgres) for the hosted product; no hosted database exists yet.

## Integrations and dependencies

| Dependency | Required decision |
|---|---|
| USA Cycling | Confirm partner access, license/category validation, one-day licenses, accepted waiver/guardian workflows, and required reporting directly with USAC |
| Payments | Stripe selected in ADR 0002; hosted Checkout planned. Confirm the merchant/Connect operating model, organizer onboarding, revenue allocation, payouts, refunds, disputes, and tax responsibility before live use |
| Timer / officials | Obtain actual accepted files and required race-day changes workflow |
| Email | Select a transactional provider with delivery status and suppression handling |
| Existing registrations | Confirm export rights and mappings; never assume signatures or payment tokens transfer |
| Results sites (road-results.com) | Research how results are updated and which registration fields (name, license number, team, category) a timer needs to build the upload file. See [Results site updates](#results-site-updates-research) |

The questions to ask are packaged in [docs/usac-questions.md](docs/usac-questions.md) and [docs/payment-model-questions.md](docs/payment-model-questions.md); record the answers there.

Until USAC integration is approved, builds may use clearly labeled simulated checks or an agreed manual-review process. A sanctioned-event pilot requires explicit acceptance of the chosen process by the relevant parties.

### Future USA Cycling waiver and license integration

Status: Planned. No USAC access exists, and nothing in this repository connects to USAC. Build it only after USAC grants access and approves the workflow. Public research (November 15, 2026; see [USAC questions](docs/usac-questions.md#what-public-sources-already-say)) confirms that electronic waivers need a USA Cycling approved registration platform, that paper waivers are kept at least ten years, and that no public license lookup exists. Approval criteria for a platform are not published.

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

Public research (November 15, 2026; details and sources in the [timer export review](docs/timer-export-review.md#what-public-sources-already-say)):

- Both road-results.com and USA Cycling take a results CSV uploaded by the promoter or timer. road-results.com accepts a file already uploaded to USA Cycling as is.
- USA Cycling's results template has ten columns: race date, discipline, category, gender, class, age group, rider license, first name, last name, and place, with codes for DNS, DQ, DNP, and DNF. Both sites match results to riders mainly by name; the license number helps but is not required.
- No public API or automatic feed was found for either site, and no public statement that road-results.com imports USA Cycling results on its own.

So one file in USA Cycling's format can serve both uploads. The start-list export already carries race date, category, license number, and names; discipline, gender, class, and age group would need to come from the category setup, and place comes from timing.

The questions below, with a sample export, are packaged for the timer in [docs/timer-export-review.md](docs/timer-export-review.md).

To research before Phase 3:

1. Who uploads for our events today (timer, promoter, or road-results staff), and whether road-results ingests sanctioned results from USAC on its own.
2. Which columns improve rider matching (license number, team, place, category, finish time) and whether our timer export should carry them.
3. Whether the timer export and the road-results CSV can share one format, so organizers do not retype data.
4. How corrections are made after upload, and who owns them.


## Quality requirements

- Phone, tablet, and desktop support; keyboard access, readable labels, clear errors, and accessible checkout.
- Light and dark display themes on every rider and organizer screen. See [Display themes](#display-themes).
- Server-enforced authorization and capacity; encrypted transport and protected secrets; least-privilege access to contact and emergency details.
- Every account signs in: riders, guardians, and all organizer roles. Sign-in is a passwordless emailed link or code (Phase 2). Riders and guardians keep email sign-in only. Multi-factor authentication (MFA) for organizer roles follows in Phase 3 and is required before the live pilot: no real rider data or live payments until organizer MFA ships. See [Sign-in and account security](#sign-in-and-account-security).
- No sensitive rider data in public participant lists by default. Define retention and deletion rules before the pilot.
- Audit money, category, waiver, capacity, and permission changes.
- Backups with a demonstrated restore; monitoring for registration/payment failures and stuck capacity reservations.
- Publish a support owner and escalation route for each event. Volunteers must know who handles a race-morning failure.
- Load and recovery checks use twice the expected pilot opening peak, based on the organizer's historical data.

### Display themes

Status: Implemented in the local build (organizer, rider, and check-in screens); signed-in sync is Planned. Riders register at night and volunteers check riders in outdoors, so one fixed color scheme will not suit everyone.

- Default to the device's system preference (light or dark) on first visit.
- Provide a visible, keyboard-accessible light/dark toggle on every screen, with an accessible name that states the current theme.
- Remember the user's choice on that device and apply it before the page draws, so the screen does not flash the wrong theme. A signed-in preference may sync across devices later; that is not required for the first release.
- Text, form fields, placeholders, buttons, links, focus indicators, error messages, and status indicators (entry, payment, readiness, check-in ready/blocked) must meet the WCAG 2.2 AA contrast targets in both themes.
- Status keeps its text and icon in both themes; never rely on color alone. The check-in ready/blocked result must stay readable in bright sunlight in either theme.
- Printed or exported material (receipts, start lists, timer exports) is unaffected by the screen theme.

### Visual material direction

Status: Planned. The [design system](DESIGN.md) retains the field-board identity and adds Apple-inspired Liquid Glass selectively to navigation, floating controls, and overlay frames. Forms, pricing, dense tables, and race-day results remain opaque. Require strong composited contrast, opaque reduced-transparency alternatives (including an explicit setting), and reduced-motion behavior. Event photography and fluid transitions must preserve registration clarity, keyboard access, and visible demo/integration status. This documentation decision does not implement these refinements or expand purchase support.

### Sign-in and account security

MFA means a sign-in needs a second, independent proof of identity in addition to the first factor, such as an authenticator app code or a passkey. A second emailed code is not a second factor: it goes to the same inbox as the first.

Delivery is phased (decided November 15, 2026; [ADR 0003](docs/decisions/0003-sign-in-and-mfa.md) as amended):

- **First release (Phase 2): email sign-in.** Every account signs in with a passwordless emailed link or code before reaching rider, guardian, or organizer pages. Sign-in attempts are rate-limited, every person has their own account (no shared organizer credentials), and organizer roles still control what each person can see and do. While this is the only factor, the app holds only fictional data and takes no live payments; hosted use is limited to staging and rehearsals. Status: Implemented in the local build on November 15, 2026 (Clerk free plan); not yet verified against a real Clerk development instance. The public event list and rider event pages stay open without sign-in; riders sign in before entering details, checking a coupon code, or holding places (no guest checkout). Owners give roles by email, and the server checks the role on every organizer action. Ownership transfer to a successor and an audit history of role changes are still Planned (see [Participant management](#participant-management)).
- **Riders and guardians: email sign-in only, also after the pilot starts.** Riders turned down authenticator apps (D01, 2026-11-15), and checkout must stay quick on a phone. Their accounts are protected by rate limits, by seeing only their own and their juniors' registrations, and by a fresh emailed code before any change that moves money (a refund or paid difference) or hands an entry to someone else. Risk accepted by the owner: someone who controls a rider's or guardian's inbox can sign in as them and see that account's registrations, including juniors' and emergency-contact details.
- **Organizer MFA (Phase 3, required before the live pilot in Phase 4).** The requirements below apply to organizer roles from then on. They are Planned.

MFA requirements (organizer roles):

- Require MFA at every sign-in for every organizer role (owner, registration manager, check-in volunteer, timer/export, finance). Enrollment happens when the role is granted; a person cannot reach organizer pages until a second factor is enrolled. The server enforces this by role, because riders and guardians do not use a second factor.
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
| Standard rider checkout | Median under 3 minutes for a returning signed-in rider, excluding external license purchase |
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

Phase 0 answers decisions 1 to 6 and 8 with the [discovery kit](docs/discovery/README.md); none has an answer yet. Interview [D01](docs/discovery/interviews/D01.md) (November 14, 2026) gives early, estimate-only input to decisions 1 and 2: reconciliation (reports, refund matching, merchandise) and bib assignment across multiple fields are the largest named costs, and whether they come from software limits is not yet known. The current tool is BikeReg; discounts there need generated codes, and shared-field limits are enforced by a person. D01 reports no license issues or duplicate entries per event. D01 also said riders may not find or trust an unfamiliar platform; this and merchandise reconciliation are recorded as discovery evidence, not yet requirements.

1. What specific tasks consume the most volunteer time today, and which are limitations of software rather than staffing?
2. How are both days, multiple entries, shared fields, discounts, and bibs currently configured?
3. Who will fund development and provide operational support after launch?
4. Will USAC approve integration and the proposed license/waiver workflow?
5. Stripe is selected. Which merchant, Connect charge/transfer, settlement, refund, dispute, and tax-responsibility model works for the club and multi-organization season passes? Public research (November 15, 2026, [payment model questions](docs/payment-model-questions.md#findings)) shows a single club account with hosted Checkout meets the Stripe-side needs and that nonprofit pricing does not apply to registration fees; the receiving entity is a nonprofit corporation with its own bank account, and the organizer would handle disputes. Who approves a switch and the corporation's 501(c) status are still unanswered.
6. What timer formats, refund policies, retention periods, and organizer permissions are required?
7. Decided 2026-11-15: riders and guardians use email sign-in only, so checkout has no second-factor step; MFA applies to organizer roles before the live pilot. Still open: how fast an emailed code arrives on race morning, and what riders do when it does not.
8. How do results reach road-results.com for our events, and what should the timer export include to support it?

9. For minors entering adult/open categories, which age convention determines guardian acceptance, and who confirms the applicable policy? Do not infer legal minor status solely from racing-age/category labels.
10. Who owns the initial Berkeley reference study and approved schedule review, and which safe local-device arrangement supports phone/screen-reader testing? Confirm participants and session availability before scheduling; no outreach has occurred.

## Research baseline

Reviewed November 14, 2026. Product requirements above are proposed; listed sources are reference points, not promised integrations.

- [USA Cycling organizer guidance](https://usacycling.org/host-an-event)
- [road-results.com results upload instructions](https://www.road-results.com/upload)
- [CrossMgr publishing to RoadResults.com](https://www.sites.google.com/site/crossmgrsoftware/project-updates/crossmgrautomaticallypublishtocrossresultscomroadresultscom)


### BikeReg feature research snapshot

Reviewed November 14, 2026 for a local BikeReg feature-gap review. These are documented competitor claims, not hands-on verification or new CycleReg requirements. No parity claim is made.

- [BikeReg features](https://www.bikereg.com/features): refunds, credits, participant transfers, event-user permissions, email, custom questions, merchandise, coupons, block pricing, and reporting.
- [Payment policy](https://www.bikereg.com/Users/Public/Director/PaymentPolicy.aspx): organizer disbursements.
- [LiveReg guide](https://www.bikereg.com/Users/Public/Director/LiveRegGuide.aspx): on-site payments, manual entries, bib assignment, release forms, and configurable timer downloads.
- [Official USAC integration announcement, July 16, 2019](https://blog.athletereg.com/2019/07/bikereg-and-usa-cycling-launch-first-round-of-new-offerings-for-event-directors/): historical permit, waiver, and license-validation integration. Current coverage requires confirmation.
- [Two Days of Buffalo 2025 registration notes](https://www.bikereg.com/CommonFiles/CustomControls/Registration/RegNotes.aspx?eventID=69261): full TT/criterium/road-race entry alongside individual stages, with overall awards restricted to full-event entrants. This does not establish built-in scoring or a dedicated setup wizard.

CycleReg scope and phase priorities remain unchanged. Refer to the existing live-pilot gates and results-scoring exclusion before treating a competitor feature as work to build.


### Movemint feature research snapshot

Reviewed November 14, 2026 for a local Movemint comparison, excluding volunteer-management functions. This records official documentation claims, not verified live behavior or additional CycleReg requirements. Requirements and roadmap priorities are unchanged by this review.

- [Series passes](https://docs.movemint.cc/organizers/event-setup/series), updated October 16, 2026: multi-event registration in one purchase, pass pricing/caps/windows, locked component membership after first sale, and organizer pass transfers. Independent-organizer revenue splitting is not established by this page.
- [Financials](https://docs.movemint.cc/organizer-dashboard/financials) and [refunds](https://docs.movemint.cc/organizers/managing-participants/refund-a-participant): Stripe-backed payout management and full/partial refunds; registration removal and refunds are separate actions.
- [Communications](https://docs.movemint.cc/organizer-dashboard/communications-hub/email), [CRM](https://docs.movemint.cc/organizers/managing-participants/crm), [audiences](https://docs.movemint.cc/organizers/comms-marketing/audiences), and [dashboard](https://docs.movemint.cc/organizers/data-tools/organizer-dashboard): scheduled audience-based email, participant history/exports, saved views, and event/date-filtered reporting.
- [Rider transfers](https://docs.movemint.cc/athletes/registrations/transfer-your-registration), [event-day registration](https://docs.movemint.cc/organizers/pre-race-event-day/event-day-registration), [admin roles](https://docs.movemint.cc/organizers/event-setup/admin-roles), and [questions](https://docs.movemint.cc/organizers/setting-up-your-event/registration/questions): participant changes, on-site workflows, event-scoped access, and configurable forms.
- [Event groups](https://docs.movemint.cc/organizers/event-setup/groups), [FAQ](https://docs.movemint.cc/organizers/resources/faqs), [pricing](https://docs.movemint.cc/resources/pricing), and [refund protection](https://docs.movemint.cc/organizers/premium-add-ons/how-refund-protection-works): group discounts/credits, merchandise, timer/results integration, optional services, and guest registration. No current USAC or specialized omnium/stage-race scoring parity is inferred.


### Organizer template case-study sources

Reviewed November 14, 2026 for [six setup case studies](docs/case-studies/organizer-templates/README.md). These are dated publication observations and proposed configuration exercises, not official federation-rule verification or new working integrations.

| Case | Publication baseline |
|---|---|
| Redlands Bicycle Classic | [2026 men's technical guide](https://redlandsclassic.com/wp-content/uploads/2026/04/2026_Mens_Tech_Guide_Final3.pdf) and [licensed-racing page](https://redlandsclassic.com/usac-licensed-racing/); distinguish professional stages from separate public racing |
| Chicago Grit | [2026 flyer](https://chicago-grit.com/wp-content/uploads/2026/07/2026-GRIT-Flyer-0705-1.pdf) and [technical guide](https://chicago-grit.com/wp-content/uploads/2026/07/2026-GRIT-Tech-Guide-0705-1.pdf); day-specific programs and separate daily/overall classifications |
| Tulsa Tough | [Dated 2026 weekend schedule](https://www.tulsatough.com/blue-dome-criterium); category availability differs across the three days |
| Berkeley Omnium | [Racing page](https://berkeleyomnium.com/racing); 2026 schedules presented alongside 2027 dates; local fixture is draft interpretation |
| Golden State Race Series | [NCNCA 2026 listing](https://ncnca.org/event/golden-state-race-series-circuit-3/) linking the [promoter flyer](https://d377h05jk13k61.cloudfront.net/usacycling/d61585ec1312abb04dc5e9f4df32fb18.pdf), plus [published timer classification rules](https://www.ontheday.net/2026/gsrs/stage_race/classification_rules/); conflicts remain for promoter review |
| California Bicycle Racing | [2026 Carson flyer](https://californiabicycleracing.com/wp-content/uploads/2026/04/04.19.26-Carson-Flyer-V2.pdf), [Roger Millikan flyer](https://californiabicycleracing.com/wp-content/uploads/2026/01/02.22.26_Roger_Millikan_flyer.pdf), and [organizer site](https://californiabicycleracing.com/); repeated events with special-day overrides and source conflicts |
