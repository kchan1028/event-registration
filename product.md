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
| Timer / official | Receive reliable start lists | Stable identifiers and clear revisions in the sample export |
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

- Show the complete published schedule by default, with eligible categories emphasized and clear explanations for unavailable or review-required options. Do not hide the schedule simply because a rider has not entered a profile.
- Rider decision (November 15, 2026): keep All races as the default and add an explicit Find my races shortcut after rider details. Once racing age and license category are known, it switches to matching categories and moves keyboard focus to the schedule. Match only the existing structured eligibility result `eligible`; unknown/review-required options remain reachable through All races and are not labeled cleared. When Matching races leaves out one or more active categories only because competition class is unspecified (Prefer not to say), a notice before the schedule results says some races are hidden because a competition class is needed to confirm a match. Show all races uses the same switch as All races. The notice is absent when no category is left out for that reason. Prefer not to say does not disqualify the rider. Selected or offered entries remain visible even if later answers stop matching, and no selection is silently removed. Preserve shared-start counts and separate-scoring notes when other classifications are filtered out. A 50-year-old Cat 4 with no additional qualifying facts has Elite 4, Masters 35+ 3/4 and Masters 50+ 3/4 on each Berkeley day (six category choices).
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

Status: Research documented November 14, 2026; reusable template implementation remains Planned. The [case-study set](docs/case-studies/organizer-templates/README.md) covers Redlands Bicycle Classic, Chicago Grit, Tulsa Tough, Berkeley Omnium, Golden State Race Series, California Bicycle Racing (CBR, confirmed by the product owner), historical Burlingame Criterium, historical San Francisco Grand Prix, Red Kite series, Wente Vineyards Classic Road Race, Mount Hamilton Classic Road Race, Chico Stage Race, San Rafael Sunset Criterium, BBC Team Time Trial, and Pinole Team Time Trial studies.

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

Named demo workspace rule (November 15, 2026): loaders use reserved fixture organization IDs, never a user-chosen organization name, to identify shared demo workspaces. Matching names in other organizations do not grant access. A reserved workspace must contain only its exact fixture event, with both draft and latest published versions marked as demo; additional or non-demo events refuse shared loading. Existing role checks and ordinary organizer-created workspaces remain unchanged.

### BBC and Pinole team time trial research examples

Owner-requested studies (November 15, 2026): document Berkeley Bicycle Club Team Time Trial and Pinole Team Time Trial with cross-linked historical evidence and explicitly unsupported TT/team-entry requirements. Sources describe a lineage from Pinole to the later BBC event, not two verified upcoming events. Keep editions and their category/course/rule evidence separate.

Owner publication decision (November 15, 2026): publish read-only research examples, with an explicit `event.researchOnly` marker and no substituted road/criterium race, categories, team price, roster, starts, capacity, packages, or checkout. Only empty demo configurations may publish this way; ordinary empty events still fail validation. The chooser labels research examples and says registration is unavailable. The public detail view has no entry form or payment action, works without sign-in, and server-side order/selection checks reject registration. Existing role permissions still control organizer edits/publication.

The BBC example uses the archived March 9, 2008 Orinda identity; later format evidence is not approval of that edition's rules. Pinole's exact edition/date is unresolved, so its schema-required day uses November 15, 2026 explicitly labeled as a research placeholder, not a race date or announcement. The public chooser hides research dates so this placeholder is not presented as a scheduled race. Seeds preserve IDs, edits, published versions, and unrelated events. Older unpublished research records require explicit update/publication, never silent seed overwrite. This does not advance TT implementation ahead of the post-pilot roadmap scope.

Actual TTT support needs explicit team/member identity and consent, category derivation, roster changes, pricing/capacity units, assigned starts, equipment classes, and approved timing handoff rules. A string team name, individual entry, or mass-start group is insufficient. Historical pre-2000 season support also needs a decision if such a Pinole edition is selected. Sources, proposed exercises, and unresolved approvals are in the [BBC case](docs/case-studies/organizer-templates/berkeley-bicycle-club-team-time-trial.md) and [Pinole case](docs/case-studies/organizer-templates/pinole-team-time-trial.md). Scoring/results remain outside current scope.

### Additional Northern California historical demos

Owner request (November 15, 2026): add source-linked setup cases and clearly labeled local demos for Wente Vineyards Classic Road Race, Mount Hamilton Classic Road Race, Chico Stage Race, and Sunset Criterium (interpreted as San Rafael). Preserve source uncertainty and current model boundaries rather than implying future events or approved race rules.

- Wente uses the April 29, 2018 event identity in Livermore with three explicitly synthetic fields, times, and distances; the full historical field matrix was not verified.
- Mount Hamilton uses the May 26, 2019 full-course schedule: nine starts, 14 categories, and a 63.5-mile road course. Shared starts retain separate classifications; the shorter Observatory event is excluded.
- Chico uses only Pro/1 and Women Pro/1/2/3 road-race/criterium components from March 17–18, 2018, with four category entries total. Circuit, TT, other categories, stage progression, GC, and official stage-race admission are explicitly absent. Independent component purchases are test-only, not a reproduction of historical entry rules.
- San Rafael Sunset uses July 29, 2017 program slots, one synthetic amateur field and two professional simulations, with synthetic 40-minute durations. Kids and fixed-gear activities are excluded explicitly.

All four seeds publish empty events with $40 test entries, zero fees/surcharges, synthetic shared 60-rider limits, draft adult annual-license eligibility requiring organizer review, and simulated payment. Reuse preserves IDs, edits, published versions, and other events. Sample waivers are not official. Source evidence, provisional assumptions, and unresolved approvals are recorded in the [case index](docs/case-studies/organizer-templates/README.md), not treated as approved full-event templates.

### Red Kite historical criterium sample

Owner-requested case study (November 15, 2026): document the 2017 Red Kite Omnium and publish a clearly limited three-round criterium sample, not a reproduction of its 14-round mixed-format series. The sample includes #2 (March 19), #5 (April 23), and #9 (July 9) as three races inside one event, with 33 starts and 42 categories. Shared women's and masters starts preserve separate classifications and independent per-round capacity. Test assumptions are $40 entries, shared 60-rider limits, 30-minute durations, annual licenses, and draft adult eligibility requiring organizer review. There are no bundles, passes, overall nominations, points, or standings. The empty seed is idempotent and preserves edits, published versions, and other events. The full series exceeds the seven-day event model and includes unsupported formats; these gaps are not silently relabeled or truncated. Sources, selected-round assumptions, and approval/model questions live in the [case study](docs/case-studies/organizer-templates/red-kite-series.md). Payments remain simulated and no upcoming calendar is claimed.

### San Francisco Grand Prix historical demo

Owner request and identity confirmation (November 15, 2026): create a case study and local demo of the historic road Grand Prix, not Il Giro di San Francisco. The demo uses September 4, 2005 and the contemporary preview's 108.1-mile total, preserving varying loops in descriptive course text rather than inventing uniform laps or separate purchases. One published empty event has one start and one men's professional simulation category. A 09:00 start, $40 fee, 60-rider cap, and adult annual-license PRO eligibility are explicit test assumptions. All eligibility requires organizer review, fees/surcharges are zero, and payments remain simulated. The idempotent loader preserves edits, publication, and other events. Professional team selection, invitations, roster admission, and operational route-segment modeling are not implemented. Sources and unresolved approvals live in the [case study](docs/case-studies/organizer-templates/san-francisco-grand-prix.md); this creates no upcoming event or approved professional registration system.

### Burlingame historical demo

Owner-requested case study (November 15, 2026): provide a clearly labeled historical Burlingame Criterium demo using the June 25, 2017 start program. The organizer currently lists the event as on hiatus; no future edition or official setup is implied. One published local event contains seven starts and nine registration categories, with separate masters classifications sharing their starts. Explicit fictional test assumptions are $40 entries, 60 riders per shared start, annual licenses, draft adult eligibility, zero fees, and no prefilled entries. Every category requires organizer review, 40-minute durations are test values, and payments remain simulated. The idempotent seed preserves edits, published versions, Berkeley, and unrelated data. Sources, provisional assumptions, setup exercises, and the unresolved approval question live in the [case study](docs/case-studies/organizer-templates/burlingame-criterium.md). This does not implement reusable organizer templates or results calculation.

### Combined Berkeley demo event

Pricing presentation decision (November 15, 2026): show the Junior, Collegiate, Women and Standard Omnium package rates together above the race schedule, before any race is selected. State what both-day pricing includes and that the lowest eligible price applies automatically. Read amounts and labels from the published configuration. The package selector and partial-selection hint must not imply that $130 is the only available package price.

Owner pricing decision (November 15, 2026): use the lowest eligible rate, based on declared racing age (junior: 18 or younger), collegiate division, and women’s category eligibility. Standard BHRR/BSC/Omnium prices remain $80/$60/$130. Junior prices are $30/$20/$40; collegiate prices are $60/$40/$90; women’s category prices are $40/$20/$50. A second BSC entry costs $10 for eligible juniors, collegiate riders, or women’s categories and $20 otherwise. The $15 day-of surcharge remains on a standalone first entry; fixed packages absorb it under the existing package rule, and the extra BSC price stays flat. The package covers one entry per race, keeps the podium nomination subject to review, and does not stack discounts. Prices apply to new orders only; accepted order quotes stay unchanged.

Owner decision (November 15, 2026): the standard Berkeley demo setup publishes only Berkeley Omnium 2027, containing Berkeley Hills Road Race on April 17 (26 categories, standard $80) and Berkeley Streets Criterium on April 18 (28 categories, standard $60), with category/rider-specific package prices and podium nomination subject to organizer review. It seeds no riders, orders, or simulated capacity entries. The standard second-criterium-entry price ($20), day-of surcharge ($15), zero fees, and demo registration-window bypass remain; reduced rates above override standard pricing. Creation and publication are atomic; reruns preserve IDs, edits, and published versions without deleting older standalone events or other local data. The separate organizer working-copy loader remains available. See [demo setup](SETUP.md) and [event reference](docs/fixtures/events.md).

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
  - Status: organizer transfers and withdrawals of paid entries are Implemented in the local build (see [roadmap.md](roadmap.md#rider-checkout)). A transfer rechecks eligibility, capacity, the waitlist, schedule conflicts, and the guardian waiver; the price paid is kept and any difference is recorded as owed or due. Organizer refunds of an entry or an order are Implemented for simulated and Stripe test-mode payments; a refund does not withdraw the entry. Rider-initiated change requests and refunds of real money are Planned.

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

Status: Implemented locally using the generated case studies and shared fake riders in [docs/fixtures/](docs/fixtures/README.md); automated tests cover the acceptance criterion below, including both display themes, except testing with real people (see [roadmap.md](roadmap.md#rider-checkout)). The demo uses simulated payment for usability testing; it is not a live checkout.

Fixture decision (November 15, 2026): remove the legacy Valley criterium and Ridge weekend events, their built-in purchase-flow loader, and their YAML definitions. Browsing lists only existing published events and never loads fixtures. Generated case studies and the combined Berkeley Omnium remain available through their explicit loaders; checkout coverage uses generated cases.

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

- **Navigation.** A visible progress indicator shows the current step. The rider can go back to any completed step without losing entered data, and cannot skip ahead past an incomplete step. An uncertain reservation must be recovered before editing the submitted entries or consent.
- **Validation.** Required fields are marked. Errors appear next to the field when the rider tries to continue, say what is wrong and how to fix it, are summarized at the top of the step, and are announced to screen readers. The summary takes focus once per failed submission and does not steal focus while the rider corrects a field. See the [accessibility rules](docs/coding-guide.md#accessibility-and-mobile-usability).
- **Simulation labeling.** Every demo screen shows a persistent, readable "Demo" label. The order review, payment step, confirmation, and receipt also state "Simulated payment: no money is charged". Buttons say "Complete simulated payment", never "Pay" or "Buy". The receipt is watermarked as a demo.
- **Separate states.** Entry, payment, and readiness states stay independent in the demo, as in the product. A simulated paid entry is not shown as cleared to race.
- **Fake rider data only.** Demo riders, prices, fees, and the sample waiver are fictional fixtures in [docs/fixtures/](docs/fixtures/README.md), which also lists the worked orders and totals a demo must reproduce. Never use real rider data or present demo prices and fees as real ones. The one real event allowed is the Berkeley Omnium, which its promoter has approved as demo event data: its fields, distances, times, and field limits come from the published race information, while its entries stay simulated and its base fees are promoter-set at $80 for the road race, $60 for the criterium, and $130 for the package.

### 2b. Deterministic case-study fixtures

Status: Implemented locally and verified with unit, API, and representative browser tests. These fixtures broaden test coverage; they do not add live product support or replace validation with riders and organizers.

- Provide stable, repeatable scenarios for a multi-category criterium, shared-field road race, two-day same-event omnium, empty draft, and large event. Use the fixed reference clock `2027-03-15T18:00:00.000Z` for time-dependent assertions.
- Include fictional success, duplicate notification, declined/retried, expired hold, and unresolved-license examples. Keep payment, entry, waiver, and readiness states separate and label every payment as simulated.
- Provide one-scenario and full-collection loaders. Reruns must not duplicate events or orders. Reset must delete only records owned by the generated case-study organization and preserve unrelated local data.
- Use reserved example addresses and phone numbers. Never load real rider data, contact a provider, or create live charges.
- Represent unsupported workflows as documented future requirements, not fake working states. Cross-event packages, automated waitlist delivery, real refunds, rider-to-rider transfers, provider/credit cancellation fulfillment, and approved post-order waiver resolution remain Planned; limited atomic simulated cancellation is documented below.

Acceptance: two independent builds produce equal configurations and stable IDs; the full collection loads and reruns safely; collection reset preserves an unrelated organization; pricing boundaries, eligibility, shared capacity, package totals, atomic reservation, duplicate requests/notifications, recovery states, and readiness transitions pass automated tests; browser tests complete a rider decline/retry purchase and organizer license-review/export journey and render empty and 120-category organizer states. Exact cases and expected outcomes are in [fixture documentation](docs/fixtures/README.md#generated-race-case-studies).

### 3. Capacity and entry integrity

- Use short-lived capacity reservations during checkout. Release expired reservations.
- An uncertain reservation retry, including after a same-tab refresh, reuses the exact submitted request and request ID until the outcome is known. Recover an existing order before validating newly published terms. A definitive rejection permits correction; changed waiver terms require renewed reading and agreement.
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
- Filter incomplete signatures, license review, failed payments, duplicate entries, and pending changes. Authorized staff confirm a license review without writing a note. The review time is recorded.
- Allow authorized corrections with a reason and an audit trail.
  - Status (November 15, 2026): Implemented in the local build for one event's registrations (see [roadmap.md](roadmap.md#rider-checkout)). **Registrations** searches by rider or guardian name, email, team, order number, or check-in code. An organizer corrects a rider's name, email, phone, team, license number, or emergency contact with a required reason; every correction is kept with before and after values. Eligibility fields (racing age, license category and type, competition class, collegiate division) are not correctable there; changing them goes through a transfer or a new registration so eligibility is rechecked. Corrections never change the price, entries, or waiver signature. A new license number clears earlier license reviews on the order (product decision, November 15, 2026). Not built: bib and license-number search on Registrations (bib search exists at check-in), and guardian corrections. Since November 15, 2026 each new correction records and shows the signed-in organizer who made it; earlier corrections show no actor.
- Record race-specific status separately from order/payment status.
- Provide transactional confirmations and targeted operational messages. Marketing consent is separate.
- Support owner, registration manager, check-in volunteer, timer/export, and finance roles. Owners can transfer responsibility to a successor.

### Participant management

Status: Planned beyond the Implemented event-level Registrations queue and lookup, audited rider corrections, organizer transfers/withdrawals, and check-in lookup. This manages race participants, not volunteer recruitment or staffing.

- Provide a participant workspace across events an organizer is authorized to manage, backed by reusable rider identity. Distinguish people, event registrations, race entries, orders, waitlist records, credits, and payment/readiness states; several entries must not become several unrelated rider profiles.
- Search by rider, team, permitted license identifier, bib, order, event, or category. Filter by race/day, status, missing waiver/license review, payment exception, waitlist, and package/pass membership. Show a history of registrations, communications, changes, credits, and deferrals with source dates and reasons.
- Save named filtered views with selected columns and deterministic sorting for registration, check-in, timing, and finance tasks. Export the authorized view to CSV with a generated-at time, active filters, stable IDs, and spreadsheet-formula protection. Export only fields permitted for the role; saved views never bypass current access checks.
- Provide permitted record actions for corrections, review, waitlist offers, transfers, withdrawals, refund/credit requests, deferrals, and confirmation resend. Show affected records, eligibility/capacity/financial consequences, and confirmation before bulk changes. Apply the same per-entry rules as individual changes and report success/failure per selected record; never silently skip or partially apply an individual entry change.
- Flag possible duplicate people for authorized review without automatically merging by name, email, or license label. Any correction or future identity merge must preserve entry, financial, waiver, and audit history. Do not turn an event-participant list into an unrestricted mailing list.
- Organization and role boundaries apply to search, history, saved views, exports, and bulk actions. A season-pass coordinator sees only the approved shared data; one organization cannot browse another's private rider/finance records. Emergency contacts and minors' details retain restricted access.

Acceptance: an authorized organizer finds one rider's multiple race entries without inflating unique-rider counts, saves and reloads a view, and exports matching permitted rows. A denied organization or role cannot access those records through search, exports, or a saved-view URL. Bulk preview and results make refused records and reasons visible, and no operation silently merges identity or rewrites accepted financial/waiver records.

### 5. Race-day operations

Status: check-in search, ready/blocked result, bib ranges, bib history, repeat-safe check-in, undoing a mistaken check-in with a reason, and measured check-in times (median and 95th percentile per day) are Implemented in the local build on fake data (see [roadmap.md](roadmap.md#check-in)). Start-list snapshots with recorded changes, an organizer start-list lock whose later changes show as revisions, and a sample CSV export are Implemented too (see [roadmap.md](roadmap.md#start-lists-and-timer-export)); the CSV format is not yet agreed with a timer. A printable fallback roster with an exception checklist is Implemented (see [roadmap.md](roadmap.md#check-in)). QR check-in codes on the confirmation and camera scanning at check-in (Chrome and Edge) are Implemented.

- Search or scan a check-in code; codes identify entries and contain no sensitive rider details.
- Show readiness, missing requirements, race/category, and bib assignment clearly. For a rider with an entry or bib in the current check-in scope, a readiness refusal must show the current blockers and remove the issue-bib action.
- Configure bib ranges per event/day and prevent collisions within the configured scope.
- Preserve bib history when a rider changes fields. Support repeat check-in without duplicate assignment.
- Produce a timestamped start-list snapshot per race and record later changes.
- Export a sample start-list CSV with stable identifiers. Keep locked exports reproducible and show changes in current lists.
- Provide a minimal printable roster and exception checklist as a race-day fallback. Keep emergency contacts separate and access-restricted.
- First release requires connectivity for live changes. Full offline synchronization is deferred and must not be advertised.

### Automatic and bulk bib assignment

Project-owner decision (November 19, 2026): Assign advance riders’ bibs before the race. At check-in, only staff may mark a confirmed entry as a walk-up. The registration QR and link open normal checkout. A ready rider without a bib may receive a first desk assignment when a confirmed entry for the selected day carries the staff mark. Other unassigned advance riders are referred to the registration lead for allocation. A preassigned bib is handed over only after readiness and check-in. Corrections still follow the reassignment rules.

Status: Implemented locally for first desk assignment to staff-marked walk-ups. A registration-manager API for previewing and atomically applying selected confirmed, unassigned riders for one day is available. The API supports optional race/category scope and name, registration-time, or start-order sorting with a stable ID tie-breaker; a fresh preview fingerprint binds those choices. The check-in screen provides a role-scoped bulk assignment panel with day/race/category selection, excluded-rider reasons, three sort modes, a number/range preview, and atomic apply. Assigning a number does not clear or check in the rider. Opt-in automatic assignment after registration closes is Implemented locally through bib settings and a durable server job. Protected individual and bulk reassignment are Implemented locally with manual replacement numbers or deterministic resequencing, a required reason, a before/after preview, actor-attributed history, and automatic start-list revisions.

- Configure allocation per event or day and map ranges explicitly to the applicable races/start groups/categories without allowing duplicate active numbers inside the configured collision scope. A shared start or multiple classifications must not accidentally allocate extra bibs to the same rider. Range/category overlap and invalid scope combinations produce actionable errors before use.
- Offer opt-in automatic allocation **after advance registration closes**, not when each entry is confirmed (product decision, November 15, 2026). Wait until every non-archived published category is closed explicitly or its closing time has passed in the event time zone, and outstanding checkout holds have settled or expired. Missing closing times and the demo window bypass block the job with a visible reason. Assign only confirmed, unassigned riders, preserving manual/issued/checked-in numbers. One enabled job makes one atomic allocation across the event’s days, using chronological day order and the chosen stable rider sort; background retries and restarts never reassign existing numbers. Later walk-ups use check-in assignment. Re-enabling explicitly creates a new recorded job for any remaining unassigned riders. Receiving a number does not imply a waiver, verified license, readiness clearance, check-in, or permission to hand over the bib.
- Offer bulk allocation for selected confirmed registrations, scoped by day/race/category and optionally unassigned riders only. Configure sort by surname/given name, registration time, or category/start order, with a stable ID tie-breaker. Preview rider, current bib, proposed bib, range, and conflicts before applying.
- Reassignment interaction decision (November 15, 2026): support both explicit replacement numbers and resequencing selected riders using configured ranges and the chosen stable sort. Checked-in riders stay out of Select all; changing their number requires a separate acknowledgement bound to the preview, including individual corrections. Show unchanged rows without rewriting their history. An entirely unchanged preview applies no mutation or revision. Project-owner decision (November 19, 2026): removing a rider from the selection clears their typed replacement number. Reselecting the rider starts with an empty replacement field.
- Preserve existing manual assignments, checked-in riders, and issued/printed bibs by default. Reassignment requires an authorized role, a reason, a before/after preview, and new start-list snapshots for every affected race in the bib collision scope. The existing role grants remain: owners and registration managers can make bulk changes; check-in staff can make a previewed individual correction. Do not erase assignment history or override the existing rule that an organizer category transfer keeps its issued bib; identify a conflict for deliberate resolution instead.
- Apply an approved bulk allocation atomically; insufficient range space, concurrent allocation conflict, or stale preview requires correction and a fresh preview without leaving half the selected riders assigned. Concurrent automatic/manual/bulk actions must respect the same uniqueness constraints.
- Report assignments and excluded riders with reasons, preserve audit history, and allow later walk-up riders to consume only available numbers. A reset/reallocation is a controlled historical change, not deletion of issued-bib history. Cross-event season bib reuse remains a separate later feature.

Resolved range-conflict decision (November 15, 2026; project owner; [issue #95](https://github.com/kchan1028/event-registration/issues/95)): use the overlap of all applicable category ranges for one shared bib, across all entered days in its collision scope. For an entry without a category range, use its configured event/day range. A category range replaces that fallback; it is not additionally capped by it. Narrowing a preview to a race or category never widens the rider’s range. No overlap or a missing applicable range blocks new allocation or correction atomically with an actionable message. Use the same rule for desk assignment, ordinary bulk allocation, post-close automatic allocation, and both protected replacement modes. Existing issued numbers remain preserved until deliberately corrected. This replaces the earlier selected-day-only provisional behavior.

Resolved individual-correction decision (November 15, 2026; project owner; [issue #97](https://github.com/kchan1028/event-registration/issues/97)): staff may correct an active, already-issued bib after refund, withdrawal, or cancellation. Keep the same reason, explicit acknowledgement for checked-in riders, fresh preview, actor history, and linked start-list revisions. Search includes inactive riders who still hold an active bib in the selected collision scope; it does not expose inactive orders without an active bib or add private contact fields. Use current applicable entry ranges, or the retained withdrawn-entry ranges when no active entry remains in the collision scope; released unpaid holds do not constrain a correction. Correcting a bib never restores entries, refunds, payments, readiness, or check-in state. Bulk allocation/reassignment remains limited to confirmed entrants. This replaces the earlier provisional confirmation guard for individual corrections only.


Acceptance: allocate a full confirmed field in stable order, repeat without changing bibs, and run concurrent allocations without collisions. An exhausted range or changed preview applies no partial batch. Existing manual and checked-in assignments remain intact; approved changes preserve history and appear in the next start-list revision. Paying or receiving a bib alone never marks a rider cleared.

### 6. Money and reporting

- Use Stripe hosted Checkout for the payment integration, selected by the product owner November 14, 2026 ([ADR 0002](docs/decisions/0002-stripe-payments.md)). Implemented locally in test mode only (November 15, 2026): with Stripe test keys set, the rider pays on Stripe's hosted page and only a signature-verified Stripe notification confirms the order; live keys are refused until the merchant and settlement model ([ADR 0005](docs/decisions/0005-merchant-and-settlement-model.md)) is accepted. Without keys, the demo stays simulated. No Stripe account is configured by the project yet. Never store card details.
- A Stripe payment confirms an order only if it comes from a session the app opened for that order and matches the order total exactly. A mismatch, a payment after the rider cancelled, or a late payment for places no longer free goes to the organizer's exception queue. A second paid session for one order is recorded as a duplicate charge for refund and never creates a second entry.
- Establish who collects funds, who is merchant of record, who handles payouts, and who bears disputes before taking live payments.
- Record order totals, line items, discounts, processing/platform fees, refunds, and settlement references.
- Support partial refunds against specific entries with an explicit effect on capacity and bundle pricing. New refund creation uses a stable client request ID: identical replay reuses the saved refund, while changed payment/entry/amount/reason is refused. The finance screen retains an unresolved original request in the current tab (account/order scoped) for lookup or exact retry; ordinary submission progress is distinct from an unknown response. Historical evidence is not reconstructed. Existing permission and payment/entry caps still apply. Implemented locally; verification belongs to the focused refund-recovery PR. Provider-unknown requests remain reserved and need reconciliation before alternative reimbursement.
- Export a reconciliation report that a treasurer can match to provider statements.

### Communications

Status: Planned. Deliver registration confirmations, receipts, payment/refund updates, waitlist offers and expiry notices, entry-change decisions, and race-day instructions through transactional email. Organizer tools target operational messages by event, race, category, or readiness exception. Changes to race schedules or cancellations show the affected audience and a preview before sending.

Use versioned templates, an audit trail, delivery/bounce status, safe retries, and suppression handling. A failed delivery appears in the organizer queue without changing entry or payment state. Sensitive data, waiver signatures, and emergency contacts stay out of message content and public links. Marketing messages require separate consent and an unsubscribe mechanism; an operational message must not silently become a marketing campaign. Transactional email uses Resend ([ADR 0007](docs/decisions/0007-transactional-email-resend.md), owner decision November 19, 2026). Implemented in the local build on November 15, 2026, test-only: organizer invitation emails (sent on invite and on resend), each reserved with the invitation before sending and shown on that invitation. A lost provider response stays uncertain: a retry uses the saved message and does not extend the invitation, and after 24 hours the app does not send it again. A completed send still renews the invitation and emails it again. By default nothing is sent, and `EMAIL_MODE=resend` sends through Resend to listed test recipients. Delivery, bounce, and complaint events and every other message type are still Planned. Marketing email is out of scope.

Acceptance: payment confirmation triggers one logical confirmation despite repeated notifications; an offered waitlist place reaches the intended rider with its expiry and secure access; organizers can identify undelivered notices and retry safely.

### Event and race cancellation

Status: simulation-only atomic execution API and organizer controls Implemented locally, November 18, 2026; broader execution and delivery remain Planned. Cancelling an event, one race, or one day of a multi-race package is an organizer action distinct from withdrawing one rider. The organizer must preview the affected entries, packages, capacities, waitlists, start lists, communications, and financial allocations before confirming it.

Paid allocation preview (Implemented locally, November 17, 2026; API and included in the operational preview screen): owners and finance can select an event, current published race or day and inspect confirmed entries on confirmed orders. Transferred entries are selected by their current category/race/day, while each amount and cancellation policy comes from the original accepted order version and quote line. Bundle/coupon allocations and unaffected paid components are not repriced, and whole-order fees are excluded. The preview flags missing structured policies, credit/rider-choice handling, nonfailed refund history and placement changes from the accepted version (including a transfer target added after purchase). It is nominal allocation information, not a refundable balance or authorization for a later payout. Financial reconciliation remains required. Held/unsettled orders, withdrawn entries, capacity/waitlist/export/message impact, cancellation confirmation/execution and credit issuance are outside this preview and remain Planned. No entry, payment or communication changes.

Operational impact preview (Implemented locally, November 17, 2026; API and organizer screen): owner/finance can inspect current published event/race/day live entries and unexpired holds, unaffected live package components, waiting/live-offer waitlist records, affected saved start-list snapshots and communication audience identifiers. Shared-capacity effects use distinct riders and include test entries and live offers; hypothetical removal is not capacity available for resale. The response includes the read-only accepted paid allocation preview. No entry, payment, waitlist, snapshot or message changes. Historical exports cannot be recalled. Event-wide snapshot references include removed races; linked live-order waitlist offers remain in the waitlist impact but are omitted from duplicate audience records. This does not deduplicate people across unrelated accounts/orders. Owners and finance open Cancellation preview in Registrations after registration data loads. Published race/day choices, loading/error/retry, empty results, capacity effects, accepted paid policies and financial warnings are shown. Selection changes or refreshed registration/draft data clear the result; older responses are ignored. Each request reloads the published schedule and refuses a mismatched published version. The result is a point-in-time snapshot, with no execution action. Message content/delivery, confirmed execution and credits remain Planned; a fresh confirmation preview and financial reconciliation are still required.

Reviewed plan confirmation foundation (API Implemented locally November 17, 2026; Registrations screen Implemented locally November 18, 2026): owner/finance can request a confirmation preview, then explicitly acknowledge and record the reviewed event/race/day plan with a reason. The server recomputes the preview under the event lock and refuses changed impact or financial guard state. The fingerprint excludes assessment timestamps but includes operational state and relevant payment-attempt, hosted-session and refund metadata, including effective session expiry. Evidence keeps the current actor, reason, acknowledgement, confirmed time, selection, fingerprint and reviewed preview; current event finance authority is required to read or replay it. Identical per-event request identity/payload returns the original record even after later changes; changed details conflict. Multiple new request identities create separate plan records. Status is plan_confirmed and executionAvailable is false: records are not an execution queue or financial approval and change no entries, holds, capacity, waitlists, payments, exports or messages. Future execution must obtain a fresh reviewed state and reconcile finances; provider updates can occur outside the event lock. Owners/finance can record a reviewed plan in Registrations with a shared-validated reason and explicit acknowledgement after loading the displayed preview. Unknown results preserve the original request and acknowledgement for an explicit retry; the screen never resubmits automatically. When the server proves the request was not recorded, changed impact, a removed scope or unreviewable event data requires a new preview and acknowledgement. A request-identity conflict or uncertain result remains unresolved. Actor/event-scoped tab storage preserves pending intent when available and then only the confirmed record reference; server retrieval verifies saved evidence after refresh. Blocked storage has page-only recovery, and unreadable recovery data requires manual review before another confirmation. Pending intent locks new scope/confirmation choices while underlying refreshed data may clear the preview. Recorded evidence is historical, with original published scope names. A known completed reference that cannot be retrieved may be kept for lookup or cleared locally through an explicit separate review; this never discards an unresolved pending request or replaces server evidence. The separate simulation-only executor below implements limited cancellation; provider/credit execution, message delivery and provider/credit execution remain Planned.

Execution financial preflight (API Implemented locally, November 18, 2026): current owners/finance can assess a saved reviewed plan against fresh impact. A stale or unreviewable plan blocks eligibility. Accepted entry allocations and cancellation policy determine nominal cash per selected entry; unchanged package components and whole-order fees remain excluded. Only confirmed orders with successful simulated settlement, a cash policy, no allocation review, no provider evidence and no refund history qualify as financially eligible for simulation. Missing/mismatched payments, held or unsettled entries, any hosted session or provider event, and prior refunds (including failed ones) require reconciliation. Credit, rider choice and absent policies block automatic cash eligibility. The eligible total is null when blocked; nominal lines are never refund instructions. This assessment changes no state, performs no provider call, and keeps executionAvailable false. It is not an executable token. The separate simulation-only executor repeats financial checks under the event and affected refund-request locks; provider/credit execution and delivery remain Planned.

Atomic simulated cancellation (Implemented locally, November 18, 2026; API and organizer controls): a current owner/finance operator explicitly acknowledges execution of a saved reviewed plan with a separate request identity. Only a simulated-payment application may execute; current impact and conservative cash eligibility are checked again. In one transaction, accepted entry cash allocations become succeeded simulated refunds, selected confirmed entries become cancelled with a timestamp, active selected waitlists/offers become removed, and an actor/time/scope/plan-linked result is recorded. Zero cash allocations create no refund. The original order payment status, price, quote, waiver, unaffected entries and historical snapshots remain unchanged. Current start lists omit cancelled entries and show snapshot removals; entry exports and summary counts distinguish cancelled from withdrawn entries. Check-in readiness and manual/automatic bib assignment exclude cancelled entries, including previously reviewed licenses; existing check-in/bib history is retained. The already-approved reasoned/acknowledged correction of an issued inactive bib remains available without restoring readiness or entries. Receipt and Registrations label cancellation separately from payment and readiness; an order with no active entries offers no check-in code or race-readiness promise. No real money moves and no provider/message call occurs.

Organizer execution controls (Implemented locally, November 18, 2026): Registrations offers a separate eligibility check and simulation-execution acknowledgement after a plan is recorded. The protected check reuses the executor’s read-only financial, mode, overlap and test-entry conditions; an eligible result is point-in-time information, never authority to skip final checks. Counts, frozen cash allocations and excluded fees are shown before submission. Starting another review or refreshing loaded registrations invalidates eligibility and acknowledgement; outdated checks are ignored. The original account/event-scoped request is saved before sending and retried only explicitly. Unknown network/server/identity-conflict results preserve that request and lock another plan review; a null read result does not prove refusal. A refusal clears intent only after a terminal rejection is committed under the event lock. The same normalized identity/payload replays that rejection even after conditions change, so a delayed copy cannot execute. Plan-confirmation refusals use the same guarantee. A fresh review or corrected attempt needs a new identity and acknowledgement. Known execution refusals after refund work are terminal only after a verified write-savepoint rollback; unknown database/commit failures remain unresolved. Verified saved execution evidence for the same plan may resolve recovery, including execution by another operator, with original actor/time. Refresh retrieves server evidence before showing success; blocked storage has page-only recovery, unreadable recovery data blocks another execution, and failed evidence lookup retains its reference for retry. A known completed reference can be cleared with an explicit new plan review; unresolved intent cannot. Saved execution refreshes registrations and summary without resending; refresh failures remain visible and can retry.

Durable closure uses the selected event/day plus frozen race/category identities and current published placement. New holds, hosted checkout, transfer targets, waitlist joins/offers and test entries cannot reopen a cancelled scope, including after republishing or adding categories. Saving or publishing placement changes into or out of a cancelled scope is refused, including a draft prepared before execution; new categories in a closed scope remain closed. A late payment for an inactive hold enters needs review rather than restoring the cancelled race. Identical execution replay returns original evidence; different details, another identity for the same plan, and overlapping executed scopes are refused. After partial cancellation, remaining races must be reviewed separately rather than cancelling an overlapping event/day. An execution failure rolls back refunds, entries, waitlists and closure together. Existing test capacity must be removed and live holds/unsettled orders reconciled first. Confirmation APIs themselves still execute nothing and retain executionAvailable false.

Public cancellation facts (Implemented locally, November 18, 2026): the existing public event-detail API includes `cancellation.scopes` (committed event/day/race selections) and `cancellation.categoryIds` (currently published categories closed by the same frozen-identity/current-placement rule as admission). Reads use the event lock to keep published configuration and closure consistent. Reviewed plans and terminal refusals are not public closure. Only scope/category identifiers are projected; no execution IDs, actor, reason, rider, audience or financial evidence is included. This response does not grant entry or change capacity. Scope identifiers remain historical even if a race/day is later removed; consumers must handle missing published labels without inventing a current scope. Public registration labels (Implemented locally, November 18, 2026): event/day/race notices and category cancellation labels take precedence over capacity and offers. Closed categories cannot be newly selected or joined on the waitlist; a previously selected closed category can be explicitly removed. Continue validates closed selections, and restored details/waiver drafts with them return to selection before a new reservation. Unknown pending reservations retain their original retry path and payload; existing order review/history remains separate. A manual status refresh preserves the draft and reports failures while retaining the last loaded status. Missing historical scope names use plain fallback labels. Packages containing closed races are unavailable to new registration; saved package intent directs the rider to uncheck it rather than add a cancelled race. Package hints remain available for unaffected packages. An offer-link prefill checks public closure before adding its category. Unaffected races retain their own rules. Catalog, download and print labels are implemented in the increments below; in-file CSV annotations remain Planned.

Cancellation download labels (Implemented locally, November 18, 2026): protected entry, ledger and start-list CSV downloads add current closure context to their attachment filename and HTTP headers, without new CSV columns, comment rows or financial recalculation. `X-CycleReg-Cancellation` is `none`, `scoped` (event-level file with scoped cancellations), or `cancelled` (event-wide cancellation or an affected individual race). `X-CycleReg-Export-Context` is `current` or `historical`. Affected filenames append `-SCOPED-CANCELLATION` or `-CANCELLED`; affected saved snapshots append `-HISTORICAL-NOW-CANCELLED`. Original DEMO/SAMPLE markers remain. Unaffected filenames remain unchanged. Historical CSV bytes and stored rows remain unchanged; labels describe closure at download time, not the status when the snapshot was saved or financial settlement. Current cancelled start lists contain the existing header without cancelled entrants. Export data and labels are read together under the event lock. Printable-roster cancellation notices are Implemented locally (November 18, 2026): each day shows event/day cancellation and names currently published cancelled races, from the same locked check-in-list read as its riders. Notices remain visible in print, including empty days, and prohibit bib issuance/clearance for cancelled races without claiming financial settlement. Unaffected days retain their normal roster; existing reference-only and reconciliation instructions remain. Each day is loaded independently; this is not an atomic all-day snapshot or a live-updating printed sheet. Public event-list cancellation labels are Implemented locally (November 18, 2026): event-wide cancellations read “Event cancelled. View details.”; recorded race/day scopes read “Race or day cancellations recorded. Review event details.” Cancelled events remain linked to their details, and category totals are labelled configured categories rather than implying availability. Scoped status does not promise any remaining race is open. The public summary and closure-scope projection come from one database statement using only published configuration and committed executions; plan/refusal evidence is excluded. Status is loaded on entering/reloading the list, not live-pushed. In-file CSV annotations remain Planned.

Limits: no undo/reopening, provider refunds, credits/rider choice, automatic messages or cancelled-race banners on every export/public page. Audience and historical snapshot references are retained in the result for later communication/export work. Mixed payment-provider application configurations against one database are unsupported for this simulation rehearsal; hosted/provider execution still requires its own settlement protocol and acceptance.

- Preserve every affected rider's accepted price, rules, entry state, and payment history. Never silently reprice the remaining component of a paid package.
- Record who cancelled what, when, why, and which policy version applied. Require a second confirmation for an event or race with paid entries.
- Calculate cash refund, credit, or no-refund outcomes from the published policy and show unresolved provider exceptions. Never return the same value as both cash and credit.
- Refund and credit policy (product decision, November 15, 2026): each organizer sets the policy for their event; CycleReg does not impose one. Templates the organizer picks and then edits: **full refund until a deadline** (100% until 14 days before the first race day); **tiered** (100% until 30 days out, 50% until 7 days out, then nothing; defaults accepted by the owner on November 15, 2026); and **credit only** (credit toward a later event by the same organizer until the first race day). Every policy also says what riders get when the organizer cancels a race, day, or event (full refund, credit, or the rider's choice), kept separate from the withdrawal steps. Percentages apply to the entry amount paid; fees are not returned (confirmed by the owner, November 15, 2026). The rules are part of the event configuration, so publishing versions them; riders see them as plain sentences before paying and on their confirmation, and each order keeps the rules of the version it was sold under. Status: rules, templates, the organizer editor, and the rider wording are Implemented in the local build (November 15, 2026). Implemented locally, November 17, 2026: a read-only whole-order policy amount preview for owners and finance, using the accepted event version, its local calendar date and discounted entry amounts, excluding fees. It distinguishes withdrawal from organizer cancellation and cash from credit or rider choice. It suggests cash only for a confirmed order with all entries confirmed, one reconciled original payment and no existing nonfailed refund; otherwise it requires review. This preview creates no refund, credit, withdrawal or cancellation. Implemented locally, November 17, 2026: owners and finance can inspect this preview in the organizer refund form when the whole order and original payment are selected. They choose withdrawal or organizer cancellation, with loading/error/retry states; changing the entry scope clears the preview, and entry state/category, order state or refund-history changes clear the result and discard older responses. The result shows the accepted version, event-local assessment date, excluded fees and review reasons without filling the refund amount. Policy enforcement is not built; organizers still enter refund amounts. Limited simulated event/race/day cancellation is Implemented locally as described above; provider fulfillment and credits remain Planned, so a credit promised by a policy is handled outside the app for now. When no refund rules and no refund notes are set, the publish warning stays worded as before and its control is labeled Set up refund policy. Activating it opens Event setup and focuses Refund and credit rules under Bundles, discounts, and rider policies. Other warnings keep their destinations. Adding rules or notes removes that warning and does not choose a policy.
- Resolved partial-cancellation allocation decision (raised and resolved November 17, 2026; owner: project owner): select transferred entries by their current race/day while preserving their original paid allocation and accepted rules. The owner selected current placement rather than requiring manual review of every transfer. Remaining paid package components must not be repriced. The paid allocation and operational previews, reviewed plans and limited simulation workflow are Implemented locally as described above; provider/credit fulfillment and manual financial acceptance remain Planned.
- Release capacity and stop waitlist offers for a cancelled race. A partial event cancellation must not make unaffected entries disappear or become cleared automatically.
- Produce an affected-rider list and a versioned communication preview. Delivery failure remains visible without changing financial or entry state.
- Mark cancelled races in rider confirmation, organizer reports, start-list snapshots, and exports. Keep historical records available to authorized roles.

Acceptance: cancelling one race in a paid two-race package produces a deterministic, auditable outcome for both component entries and the accepted total; repeated requests do not duplicate refunds, credits, messages, or capacity releases. A provider or email failure creates an actionable exception without reporting completion. The unaffected race remains usable, and every rider sees the outcome and next step.

### Promotions

Status: basic event coupons are Implemented in the local build (see below); the rest is Planned. Configure fixed-amount or percentage coupon codes, eligible events/categories, validity windows, global/per-rider redemption limits, and explicit combinability. Referral offers and registration-count price tiers follow after the basic coupon workflow. Count committed redemptions atomically and release abandoned reservations so concurrent checkouts cannot exceed a limit. Lock the accepted discount and tier price in the order.

Preview discount precedence before checkout. An entry receives at most one price reduction under the default rule. Combining a coupon with a package or season pass requires an explicit approved rule; no accidental stacking. Cross-organization promotions require every affected organization's approval and an agreed allocation of the discount. Zero-cost entries remain zero, and no discount creates a negative price.

Acceptance: an eligible code applies once with the advertised saving; expired, exhausted, or inapplicable codes explain why they do not apply. Concurrent final redemptions cannot exceed the configured limit. Refund and cancellation handling follows the published redemption policy.

Basic coupons (Implemented in the local build, November 15, 2026; see [roadmap.md](roadmap.md#rider-checkout)):

- An organizer creates codes per event on **Registrations**: a percentage off each eligible entry or a fixed amount off the order, optional start and end times in the event's time zone, eligible categories (none ticked means all), and an optional total cap. Codes are case-insensitive and can be turned off and on; they are never deleted.
- Discount precedence (product decision, November 15, 2026): one code per order. The coupon applies after the bundle, same-race extra-entry, and additional-race discounts, and only to eligible entries none of those discounted, so an entry still receives at most one reduction. A percentage rounds half up to the cent per entry; a fixed amount is split across the eligible entries in proportion to price and never exceeds them. Fees are calculated after the coupon. Combining a coupon with a bundle is not offered; it would need an explicit approved rule.
- Redemption policy: a held order reserves a redemption; paying confirms it; an expired or cancelled hold releases it. A payment after the hold expired confirms only if the cap still has room, otherwise it goes to the organizer's queue. A paid order keeps the discount it accepted even if the code is later turned off or edited, and a transfer or withdrawal does not return the redemption.
- Per-rider limit (product decision, November 15, 2026: per rider, not per signed-in account): an organizer can limit how many times one rider uses a code. A rider is matched by the same rule as same-rider suggestions: same license number, or same full name and email. So two juniors registered from one parent account count separately, and one rider using two accounts with the same name and email counts once. Checking a code before rider details are entered cannot apply the limit; placing the order does, under the event lock, and a payment that arrives after the hold ended re-checks it. Implemented in the local build on November 15, 2026.
- Not built: combinability rules, cross-organization promotions, referral offers and registration-count tiers.

### Reporting

Status: Planned reporting workspace; start lists, snapshots, sample timer CSV, and organizer entries and simulated-ledger CSV exports already exist (see [roadmap.md](roadmap.md#rider-checkout)). Implemented in the local build on November 15, 2026: an event summary on **Registrations** for roles that may see registrations, with riders (orders linked as the same rider count once), paid, held, and withdrawn entries, unpaid holds, payment exceptions, paid entries still awaiting a license review, waitlist counts (waiting, open offers, offers that ran out, registered), and paid entries per category; roles that may download the ledger also see entry prices, discounts, fees, received, refunded, and net, which equal the ledger CSV rows summed by kind (duplicate-charge refunds shown separately). Waiver and guardian signatures are not counted because checkout refuses an order without them. Locally recorded provider references are available in the evidence export below. Still Planned: day and race breakdowns, credits and deferrals, provider settlement/payout matching, and filtered exports. Provide role-restricted event/day/race/category counts, unique riders versus entries versus orders, revenue and discount breakdowns, fees, refunds, issued/redeemed/expired/outstanding credit balances, deferrals, payment exceptions, outstanding readiness items, and waitlist activity. Count credit liability separately from cash receipts and avoid counting a deferral as new cash revenue. Finance reports link entry allocations to Stripe payment, refund, transfer, and payout references. Export totals reconcile exactly, including per-organization season-pass allocations.

Local reconciliation evidence export (API Implemented locally, November 18, 2026): owners and finance can download `GET /api/events/:id/exports/reconciliation.csv` under the existing ledger permission. The file is marked `LOCAL-RECORDS` and each row has `basis=local_record_not_provider_settlement`. It contains one source row per linked payment attempt, checkout session, provider notification or refund, including records on expired/cancelled orders. Notifications without a linked order cannot be safely assigned to an event and are excluded. No provider is contacted and no money, entry, readiness or refund state is changed. The published Registrations screen has an owner/finance download section (Implemented locally, November 18, 2026). It explains local evidence versus settlement, repeated source amounts/order totals, unknown blanks and session/refund-state limits before download. It explicitly says registration search/filters do not narrow the event-wide file. Preparing, error/retry and download-requested feedback use the authenticated download helper and server filename; current server authority still applies after role removal. Keyboard focus stays on the control while it prepares, and repeated activations are ignored until the read completes. This action does not request a refund or alter registrations. The broader reporting workspace remains Planned.

The export carries order ID/display number, current order status and original order total in cents; source kind/ID/provider, provider/payment/session references, refund entry reference, recorded amount/outcome/status and stored timestamps. Missing amounts/timestamps remain blank, known zero stays zero, and missing payment amounts are never replaced with the order total. Source kinds can describe the same underlying payment, so amounts must not be summed across kinds; order totals repeat per record and are not report totals. Sessions are payment intentions, not cash receipts, and requested/pending refunds are not successful settlement. Generation time is in populated rows and the `X-CycleReg-Export-Generated-At` header, including empty reports. Event cancellation/current context labels follow the other CSV downloads. Only explicitly selected metadata is included: no rider names, contact/license/waiver data, checkout URLs, raw payloads, reasons or failure text. Linked financial records come from one SQL read under the event lock. This is local evidence for reconciliation, not bank/payout reconciliation or real sandbox acceptance.

After reusable rider identity and organization permissions exist, support cross-event participant search, registration-history lookup, and prior-year registration pace comparisons within authorized data. Seasonal reports expose each organization's own entries and allocations; the coordinating organization receives only the approved aggregate view. Avoid expanding personal-data collection solely for analytics.

Acceptance: filters and exports agree with a timestamped source dataset; transfers, withdrawals, refunds, and duplicate notifications preserve accurate counts and money totals; an organizer cannot see another organization's protected rider or finance data.

### Race-day registration

**Owner decision (November 20, 2026).** Build a shared kiosk before staff-entered orders. Riders and guardians sign in with their own accounts, enter their own details, sign their own waivers and complete their own payments. The kiosk uses a dedicated rider browser, separate from the staff desk. Ending a session must remove that rider’s sign-in, draft and receipt from the kiosk. The local increment uses fictional accounts and simulated payments. Reloading ends the local session. Hosted sign-in, payment return and shared-device acceptance remain Planned.

**Kiosk idle-session decision (November 20, 2026).** After four minutes of inactivity, warn the rider that the kiosk session will end within one minute. They can choose **Keep working** to start a fresh five-minute idle period. Ending the session discards its sign-in, draft and receipt from the device. For interrupted checkout, the rider or guardian checks the existing order from **My registrations** on their own device before trying payment again.

Staff-assisted race selection (November 20, 2026). Staff can suggest open categories with places available for the selected race day and share the choices by address or QR. The rider or guardian decides whether to apply the suggestions and can edit their selection. Suggestions contain public category identifiers and do not hold places or change checkout rules.

**Owner decision (November 20, 2026).** Staff prepare race choices only. The rider or guardian signs in to their own account, enters the rider’s details, signs the waiver and pays.

Status: The phone handoff, shared test kiosk and staff-assisted race selection are implemented locally. Full race-day acceptance remains open. The November 16, 2026 phone-handoff decision has riders and guardians register on their own phones and accounts, then staff check readiness and issue bibs. Existing published category windows and day-of surcharges apply; the handoff never reopens a closed race or creates an exception.

Authorized staff can suggest races and direct a walk-up rider to the phone or kiosk checkout. Phone and kiosk checkout enforce the same eligibility, registration-window, capacity, guardian, waiver, and waitlist rules as advance registration. Configure race-day opening/closing times and surcharges explicitly. Staff need a reason and audit record for an allowed exception and cannot override hard capacity or mandatory requirements.

Use the selected Stripe hosted payment flow for online collection. Cash/check recording, complimentary entries, and any physical card-terminal integration require explicit permissions, reconciliation rules, and a further integration decision; do not imply they are supported by selecting Stripe. Never collect card numbers in CycleReg. Show pending payment separately from readiness, then issue a bib and update the timestamped start list only under the applicable confirmed-entry rules. Connectivity is required; the printable roster remains a contingency, not offline synchronization.

Acceptance: a walk-up rider can register, satisfy or be routed for required checks, complete confirmed payment, and appear once in the correct start list without overselling the last place. A failed payment does not clear check-in, and repeated staff actions cannot create duplicate entries or charges.

### 7. Self-service help and guidance

Status: Proposed (November 16, 2026). Nothing in this section is built or committed beyond the screen copy fixes already in the local build. Delivery order is in [roadmap.md](roadmap.md#self-service-help).

The goal is that a rider, parent, or volunteer can tell what to do next, finish a key task, and recover from a problem without contacting the organizer. Help is a fallback: before writing help for a confusing step, first try a clearer label, a simpler step, or a better message on the screen itself. Add help only when the screen cannot carry the explanation.

#### Who needs help, and where

Evidence is thin. There are no live events, so there are no support records or baseline metrics. The sources below are a pilot run by an AI assistant (not participant evidence), one discovery interview, and decisions already recorded in this document. Rows marked "assumed" are provisional until the [Phase 1 usability sessions](docs/usability/README.md) confirm or reject them.

| User | Task where help is likely needed | Evidence |
|---|---|---|
| Rider | Understanding that "You qualify" is not the same as cleared to race; what a license review means | [Pilot run](docs/usability/pilot-run-2026-11-14.md#watch-for-in-real-sessions); the missing next step for "License needs review" was fixed there |
| Rider | Finding and choosing two of three races in a weekend | [D01](docs/discovery/interviews/D01.md) |
| Rider | Reading a split bundle discount and the total | Pilot run watch point; R2 follow-up tests it |
| Rider | What to do when a race is full (no waitlist contact shown) | Pilot run watch point |
| Rider | What to do when a sign-in code is late or missing | [Open decision 7](#open-decisions) |
| Rider | Recovering from a declined payment or a reservation that does not finish | R5 task; [uncertain reservation decision](#uncertain-reservation-support-decision) |
| Parent | Whose details go where, and who signs for a junior | R3 task; guardian rule in [Sign-in and account security](#sign-in-and-account-security) |
| Organizer | Reading ineligibility reasons in the rider preview | Pilot run watch point (O3) |
| Organizer | Inviting a teammate, and what an expired invitation means | Expired-invitation recovery guidance is Implemented locally; real identity-provider acceptance remains open in [Sign-in and account security](#sign-in-and-account-security) |
| Check-in volunteer | A rider who is not ready, a repeat visit, a lost connection | V3 to V5 tasks; [check-in recovery decision](#check-in-recovery-warning-decision) |
| All | Trusting an unfamiliar platform enough to register | D01 (assumed to be partly a help problem) |

#### How the kinds of help work together

| Need | Approach | Where it lives |
|---|---|---|
| Know the next step | Clear actions, status text, and empty-state guidance | On the screen |
| Understand a field | One short explanation beside the field | On the screen, always visible |
| Fix an error | A specific message that says what is wrong and how to fix it | Beside the field or action |
| Complete a workflow | A short task guide | Linked from the screen where the task starts |
| Understand a recurring question or rule | An FAQ or help article | Help pages, linked from guides and screens |
| Get unresolved help | The event's support contact | Shown on help pages, error screens, and confirmations |

Each layer links to the next one: a screen message links to its task guide, a guide links to related FAQs, and every help page ends with the event's support contact. One topic has one copy; other places link to it.

#### User stories

Each story is a user outcome. Design, frontend, backend, and content work are listed separately below so they are not mistaken for outcomes.

**H1. Help from the current screen.**
Who: a rider, parent, organizer, or volunteer. What: opens help about the task in front of them. When: while on a screen where they are unsure what to do. Where: registration, checkout, confirmation, Registrations, team panel, and check-in. Why: to keep going without leaving the task or contacting the organizer.
- Screens with a published guide show a visible "Help" link (not hover-only) that opens the guide for that screen's task.
- Opening help keeps the user's progress: a held place, entered details, or a check-in search is not lost.
- A screen without a guide shows no help link, rather than a link to a general page.

**H2. Find and follow a task guide.**
Who: any user. What: follows step-by-step instructions for one task. When: before or during the task. Where: linked from the screen and listed by task in the help index. Why: to finish the task correctly the first time.
- Every guide uses the [task guide template](#task-guide-template) below.
- Steps use the exact interface labels in bold, and a test or review confirms each label exists on the screen.
- A guide for a role-restricted task says which role it needs and is not linked for users without that role.

**H3. Find an answer to a common question.**
Who: a rider, parent, or organizer. What: finds an answer to a rule or recurring question (fees, refunds, bundles, license review, guardians). When: before registering or after a surprise. Where: the FAQ, grouped by task. Why: to understand a rule without asking someone.
- Each answer leads with the answer in one or two sentences, then the detail.
- Event-specific rules (refund policy, fees, support contact) come from the event's own settings, never from generic copy.
- Each answer links to the guide or screen where the reader acts on it.

**H4. Understand an error and recover.**
Who: any user. What: understands why an action failed and what to do. When: a validation, payment, capacity, sign-in, or connection error. Where: beside the field or action that failed. Why: to fix the problem without starting over.
- Every error message says what happened and the next action, in plain language, without blaming the user or exposing internal codes.
- Field errors appear beside the field, are announced to screen readers, and move focus to the first error.
- Errors that the user cannot fix (a full race, a declined payment held for retry, an uncertain reservation) say what is kept, what to try, and who to contact.
- Recovery never asks the user to repeat a step that could create a second hold, order, or charge.

**H5. Contact support when help is not enough.**
Who: a rider, parent, or volunteer. What: reaches the person responsible for the event. When: after help does not resolve the issue. Where: help pages, unrecoverable errors, confirmations, and check-in. Why: so a problem reaches a person before race morning.
- The contact is the event's named support owner and route, already required by [Quality requirements](#quality-requirements). The app does not invent a central support desk.
- The contact path works by keyboard and on a phone, and does not depend on the user being signed in.
- The page tells the user what to include (event, race, order reference) and warns them not to send card numbers or license documents.

**H6. Keep help accurate as the product changes.**
Who: the help content owner and the author of a change. What: updates help when a workflow changes. When: in the same pull request as the change. Where: the help source and the [documentation maintenance rules](docs/documentation-guide.md). Why: wrong help is worse than no help.
- Each help topic records an owner, the screens and rules it describes, and its last review date.
- A change to a covered screen, label, permission, or rule triggers a review of that topic in the same pull request.
- Help describes only Implemented behavior. Planned behavior is never presented as available.

#### Task guide template

Every task guide has these parts, in this order:

1. **Who can do this:** the role or account needed, and any prerequisites (for example, signed in, a guardian for a junior, registration open).
2. **Where to start:** the screen and the link or button that begins the task.
3. **Steps:** numbered, one action each, with the exact interface labels in bold.
4. **What you should see:** the expected result and what happens next (for example, the confirmation, the email, what to bring to check-in).
5. **If something goes wrong:** the common problems, what each message means, and how to recover, ending with the support contact.

#### Help constraints

- Help matches actual behavior, permissions, and roles. A rider never sees organizer instructions, and a guide never promises an action the user's role cannot take.
- Plain language, readable on a phone at 360 pixels wide and at 200% zoom, keyboard usable, and consistent with the [coding guide's accessibility rules](docs/coding-guide.md#accessibility-and-mobile-usability).
- Important guidance is visible without hover. Tooltips may repeat visible text but never hold the only copy.
- Public help pages follow the [content guide](docs/content-guide.md) and exclude sensitive information: no rider data, internal procedures that would help someone bypass checks, account existence hints, or secrets.
- Each help topic has one owner and a review trigger tied to the workflow it describes.
- Shared content is written once and linked, so two copies cannot disagree.
- Help never replaces a required check: guidance about license review, waivers, or guardians does not clear a rider.

#### Supporting work (not user outcomes)

- Content: draft the first guides and FAQs from the template; record owner and review trigger for each.
- Design: decide the help link's placement and the help index layout across rider, organizer, and check-in screens.
- Frontend: render help links and guides; keep progress when help opens; error message and focus behavior for H4.
- Backend: only if event-specific values (support contact, refund policy) need to reach help pages; no new rider data.
- Test: check guide labels against screens and help links against roles.

#### Help ownership and review

| Responsibility | Owner |
|---|---|
| Screen copy, error messages, and empty states | Author of the change, reviewed by the other agent under the [cross-agent review](CONTRIBUTING.md) rules |
| Task guides and FAQs | Help content owner (unassigned; see the [open question](#self-service-help-ownership-and-scope-decision)) |
| Event-specific rules and support contact | The event's organizer and support owner |
| Accuracy review when a workflow changes | Author of that change, in the same pull request |

#### Help success measures

These are measures to collect, not targets. No baseline exists; set targets after the Phase 1 usability sessions and the first pilot.

- Task completion rate for the core usability tasks, and the share completed without facilitator help.
- Abandonment at the steps identified above (counted by step, never recording form contents or payment details).
- Support requests by topic, recorded by the event's support owner, compared before and after help for that topic ships.
- Once feedback exists: the share of guide views marked useful.

Acceptance for the first help increment: each priority task in the table above either has a clearer screen with no help needed, or a guide in the template linked from that screen; every linked guide's labels match the screen; and a rider can find the event's support contact from an unrecoverable error on a phone, by keyboard, without signing in.

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
| Export start list | Stable IDs appear in the sample CSV; withdrawn riders and later changes are visible in current lists and lock revisions |
| Refund | Ledger, registration state, capacity, receipt, and provider records agree |
| Organizer handoff | A second authorized organizer can operate the event and access its runbook without the original owner's credentials |
| Demo purchase flow | Using fake data only, a tester goes from event list through entry choice, racer details, waiver signature, order review with all fees, simulated payment, and confirmation without facilitator help; missing required fields block progress with field-level messages; back navigation keeps entered data; every payment-related screen and the receipt are labeled as simulated, and no real payment details are requested |
| Switch display theme | First visit follows the device's light or dark setting; the rider or volunteer can switch with a visible toggle; the choice persists on that device; text, form fields, buttons, focus indicators, errors, and status indicators meet contrast targets in both themes |
| Sign in (Phase 2; how riders and guardians always sign in) | No account of any type reaches signed-in pages without completing passwordless email sign-in (an emailed link or code); sign-in attempts are rate-limited; a rider change that moves money or hands an entry to someone else asks for a fresh emailed code; the app holds only fictional data and takes no live payments until organizer MFA ships |
| Organizer sign-in with MFA (final pre-launch security gate) | No organizer account reaches organizer pages without completing a second factor; organizer sensitive actions prompt re-verification; recovery without recovery codes is audited and cannot be self-served by the first factor alone |

### Berkeley weekend acceptance criteria

Status: Planned acceptance refinements from the [code-based expert review](docs/usability/pilot-run-2026-11-14.md#berkeley-weekend-case-study-code-based-expert-review), not participant findings. Berkeley is a reference scenario, not an official partnership or approved race schedule. Riders need correct choices and a predictable total; parents need clear signer responsibility; organizers need correct shared fields; volunteers need an unmistakable reason and next step when a paid rider cannot race.

| Workflow | Measurable acceptance requirement |
|---|---|
| Configure Saturday road / Sunday criterium | Without developer intervention, configure structured eligibility, dates, time zone, separate staging/start times, category caps, shared start limits, and $80/$60 demo prices with a $130 event package. Preview both days and publish only after errors are fixed and warnings acknowledged. Display groups create no limit. Missing official times, limits, and ambiguous eligibility stay explicitly unresolved. |
| Choose both days | For the pre-race, zero-fee fixture, eligible RR-M50-34 + CR-M50-34 quotes $140 base, $10 saving, $130 total. Show included races/dates, category choices, fees, missing choices, and independent eligibility/review state before reservation. Package intent must not silently turn into an unwanted single-day purchase. The server checks an explicitly selected package against the published event and requires an eligible entry in every included race before holding places. A valid explicit choice controls package pricing. If that choice does not apply at the current prices, checkout asks the rider to review it. Without an explicit choice, the existing best available package discount applies. If a package was removed, the rider must review the selection and explicitly clear that choice. A retry of a recorded reservation recovers the original order and quote. |
| Add a criterium entry | RR-M50-34 + CR-M50-34 + CR-E4 quotes $150 before day-of changes, with $10 package and $40 extra-entry savings, each applied once. Show the 10-minute recovery warning; do not call it a blocking overlap. CR-M35-34 + CR-M50-34 must be rejected as a shared start regardless of the quote. Server repeats selection checks. |
| Parent and minor | Guardian details and matching guardian acceptance are required for every minor, including minors in adult/open categories, as well as any category with an explicit guardian requirement. Category flags alone are insufficient. Confirm the governing age convention and accepted guardian workflow before sanctioned use. Missing guardian or wrong signer blocks checkout; never describe a sample signature as a legally accepted waiver. Status (November 15, 2026): Implemented in the local build. Racing age 18 or under counts as a possible minor in every category (see question 9). |
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
| Timer / officials | Understand existing race-day changes; investigate accepted file formats only if timing interoperability is selected for future development |
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

Status: Deferred November 19, 2026. Results publishing stays out of scope. Timing-software integration and results-upload support are deferred for possible future development. See [Out of scope initially](#out-of-scope-initially). The notes below record what is already known.

What is known (road-results.com upload page, reviewed November 14, 2026): results are added by an account holder uploading a CSV. All categories go on one sheet with labeled category and column headers, and a name column is the minimum. A file already prepared for USAC results upload can be reused. Timing software such as CrossMgr can produce the upload file directly. No public API was found.

Public research (November 15, 2026; details and sources in the [timer export review](docs/timer-export-review.md#what-public-sources-already-say)):

- Both road-results.com and USA Cycling take a results CSV uploaded by the promoter or timer. road-results.com accepts a file already uploaded to USA Cycling as is.
- USA Cycling's results template has ten columns: race date, discipline, category, gender, class, age group, rider license, first name, last name, and place, with codes for DNS, DQ, DNP, and DNF. Both sites match results to riders mainly by name; the license number helps but is not required.
- No public API or automatic feed was found for either site, and no public statement that road-results.com imports USA Cycling results on its own.

So one file in USA Cycling's format can serve both uploads. The start-list export already carries race date, category, license number, and names; discipline, gender, class, and age group would need to come from the category setup, and place comes from timing.

The questions below, with a sample export, are packaged for the timer in [docs/timer-export-review.md](docs/timer-export-review.md).

Questions retained if the project owner later selects results-upload support:

1. Who uploads for our events today (timer, promoter, or road-results staff), and whether road-results ingests sanctioned results from USAC on its own.
2. Which columns improve rider matching (license number, team, place, category, finish time) and whether our timer export should carry them.
3. Whether the timer export and the road-results CSV can share one format, so organizers do not retype data.
4. How corrections are made after upload, and who owns them.


## Quality requirements

- Phone, tablet, and desktop support; keyboard access, readable labels, clear errors, and accessible checkout.
- Light and dark display themes on every rider and organizer screen. See [Display themes](#display-themes).
- Server-enforced authorization and capacity; encrypted transport and protected secrets; least-privilege access to contact and emergency details.
- Every account signs in: riders, guardians, and all organizer roles. Sign-in is a passwordless emailed link or code (Phase 2). Riders and guardians keep email sign-in only. Multi-factor authentication (MFA) and sensitive-action re-verification for organizer roles are scheduled as the final pre-launch security gate: no real rider data or live payments until organizer MFA ships. See [Sign-in and account security](#sign-in-and-account-security).
- No sensitive rider data in public participant lists by default. Define retention and deletion rules before the pilot.
- Audit money, category, waiver, capacity, and permission changes.
- Backups with a demonstrated restore against the [approved pilot recovery rehearsal targets](docs/operations.md#backups-and-recovery). Monitor registration and payment failures and stuck capacity reservations.
- Publish a support owner and escalation route for each event. Volunteers must know who handles a race-morning failure.
- Load and recovery checks use twice the expected pilot opening peak, based on the organizer's historical data.

Before a live pilot, record the expected opening peak, representative event size, and race-morning staff concurrency. Verify checkout, final-place reservation, sign-in, organizer search, QR check-in, exports, and provider retries at twice that baseline. Set measurable response-time thresholds and verify the approved recovery targets in rehearsal. A large fixture render does not establish load performance.

Protected CSV attribution is Implemented locally. After authorization and file preparation, record the account, event, export kind, time and any start-list scope. If recording fails, withhold the file. The record is evidence of server-side generation. Operator access, retention and hosted rehearsal remain open.

Before storing real rider data, approve retention periods and deletion procedures for registrations, waiver evidence, minors, emergency contacts, exports, and audit records. Demonstrate a backup restore, account and organization access revocation, and an access-restricted export audit. Record the incident owner and escalation path. Automated tests with fictional data do not satisfy these operating approvals.

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

- **First release (Phase 2): email sign-in.** Every account signs in with a passwordless emailed link or code before reaching rider, guardian, or organizer pages. Sign-in attempts are rate-limited, every person has their own account (no shared organizer credentials), and organizer roles still control what each person can see and do. While this is the only factor, the app holds only fictional data and takes no live payments; hosted use is limited to staging and rehearsals. Status: Implemented in the local build on November 15, 2026 (Clerk free plan); not yet verified against a real Clerk development instance. The public event list and rider event pages stay open without sign-in; riders sign in before entering details, checking a coupon code, or holding places (no guest checkout). Owners give roles by email, and the server checks the role on every organizer action. Implemented locally on November 15, 2026: an owner hands ownership to a teammate who has signed in, in one step (the former owner keeps only their other roles), and every grant, invitation, accepted invitation, removal, cancelled invitation, and hand-over is recorded with the signed-in actor and time and shown in the team panel. Also implemented locally on November 15, 2026: an invitation stays open for 14 days; an owner renews it from the team panel (the period starts over, also after it expired), and someone who signs in after it expired gets no role, which the history records. Implemented locally on November 15, 2026: the invitation email, sent when an owner invites or resends (test-only; see Communications). Implemented locally November 16, 2026: the signed-in recipient sees their expired organization/role invitations on Home, with guidance to ask an owner to add the role again. Signing in grants no expired role; the notice ends when a later grant of the same role supersedes expiry. A status-loading failure is visible and refresh can retry. Still Planned: recording factor, recovery, and session-revocation events (see [Participant management](#participant-management)).
- **Riders and guardians: email sign-in only, also after the pilot starts.** Riders turned down authenticator apps (D01, 2026-11-15), and checkout must stay quick on a phone. Their accounts are protected by rate limits, by seeing only their own and their juniors' registrations, and by a fresh emailed code before any change that moves money (a refund or paid difference) or hands an entry to someone else. Risk accepted by the owner: someone who controls a rider's or guardian's inbox can sign in as them and see that account's registrations, including juniors' and emergency-contact details.
- **Organizer MFA and sensitive-action re-verification (final pre-launch security gate).** Scheduling decision by the project owner, November 15, 2026: defer this work until the last implementation and verification step before launching the Phase 4 live pilot. Local development and rehearsals with fictional data and test payments can proceed first. The requirements below remain Planned and must be implemented and independently verified before launch, any real rider data, or live payments. Riders and guardians keep email sign-in only.

Account lifecycle requirements:

- Open question (November 16, 2026; owner: product owner): should a recipient dismiss an expired-role notice, or should it age out when an owner chooses not to grant that role? Current implementation has neither dismissal nor a time limit; it remains until a later grant of that same role. A grant of a different role does not clear it. Provisional behavior is display-only and grants no access. The scoped guidance can proceed; the dismissal policy remains undecided and should be revisited before pilot usability acceptance.
- Verify sign-in, invitation acceptance, sign-out, session expiry, and role enforcement against a real Clerk development instance before hosted rehearsal. Local fake sessions are automated test evidence only.
- Let an owner resend, revoke, or replace an invitation without creating two memberships. Expired and wrong-address invitations explain the next action without revealing whether another person's account exists.
- Revoke active organizer access when a role is removed. Record invitation, role, ownership-transfer, factor, recovery, and access-revocation events with the authenticated actor and time.
- Provide an ownership-transfer workflow that requires the successor to have signed in and already hold a role in the same organization. A transfer leaves at least one owner. The former owner keeps only explicitly granted roles after transfer.
- Guardian access (owner decisions, November 15–16, 2026; [research](docs/research/guardian-accounts.md)): a junior has up to two explicit active guardians. Registering creates an initial relationship; the second guardian must sign in with the invited email and explicitly acknowledge acceptance. Existing accounts get no automatic grant. Implemented locally: private invitation creation/list/replacement/cancellation and recipient lookup/acceptance APIs; atomic acceptance and replay protection; both guardians manage the same junior's orders. Either may set a separate read-only junior viewer login. Existing **My registrations** distinguishes original placement from current management authority. Recipient acceptance is available on My registrations (November 17, 2026), with invited junior/inviter/expiry, explicit acknowledgement, loading/error/empty states and refresh. Acceptance refreshes current junior access and registrations; an interrupted response can retry the same invitation without another grant. My registrations also offers invitation creation/cancellation, current guardian access and explicit removal with a reason and acknowledgement (Implemented locally, November 17, 2026). The screen labels that no invitation email is sent, separates original invitation expiry from later acceptance/cancellation, and refreshes saved state after an interrupted removal response. Email delivery remains Planned.
- Sharing safety: pending, cancelled, expired and junior-viewer invitations cannot grant access. Acceptance rechecks current inviter authority and the two-guardian cap. Adopt legacy unlinked orders before sharing; refuse a different acceptor-managed profile with the same normalized name instead of merging households. Same-name corrections merge only identical guardian sets with compatible viewer identities, preserving source relationship evidence. Original placer, price, waiver and accepting-account evidence remain unchanged; historical evidence is not reconstructed. Declared racing age is not actual legal age or federation approval. Real identity, consent and retention acceptance remain gates.
- Approved remaining lifecycle decisions (owner, November 16, 2026; removal API Implemented locally November 17, 2026; claim approval API Implemented locally November 17; support recovery remains Planned): at most two authorized guardians, with the second explicitly accepting through the invited address. Either guardian may remove the other with a reason and acknowledgement; there is no organizer family-access override. Only product-owner/support review may authorize disputed-access restoration after reviewing identity evidence. Profile claims use date-of-birth calendar age, separately from racing age, and require an explicitly configured minimum age before enabling claims; no default threshold is inferred. Claiming ends guardian access without changing original orders, payments or accepted waivers. Guardian-declared DOB is not verified legal-age proof.
- Guardian removal API (Implemented locally, November 17, 2026): a current guardian lists private relationship history and removes the other guardian by relationship ID with a reason and explicit acknowledgement. Self-removal is refused. Concurrent opposing removals leave one guardian. Identical retries preserve the original actor/time/reason; an old relationship request cannot revoke a later grant. Current authority governs subsequent reads, payment/cancellation and checkout replay, including for the original purchaser. Original orders, payment, waiver evidence and the junior viewer are unchanged. This API does not implement disputed restoration, claims, notification delivery or management screens.
- Resolved claim-authority decision (raised and resolved November 17, 2026; owner: project owner): every junior profile claim requires product-owner/support approval after reviewing identity evidence and the configured DOB-calendar-age requirement. The owner explicitly selected a minimum calendar age of 18 on November 17, 2026; configure that value before enabling claims, without an inferred fallback. The owner also selected the rider’s recorded time zone for the birthday boundary and March 1 for February 29 birthdays in non-leap years (November 17, 2026). A missing or invalid recorded time zone must prevent approval until corrected; no support/server time-zone fallback is inferred. The owner approved support recording the verified birth date and rider-confirmed time zone, retaining only a review reference rather than copies of identity documents (November 17, 2026). This specifies the claim review’s data inputs; it does not settle the broader retention/deletion policy or authorize real-data use. The junior's existing viewer login cannot claim unilaterally, and organizer roles provide no family-access override. Approval and the resulting termination of guardian access must be audited without changing original orders, payments or waivers. This resolves the choice between linked-viewer self-service and approval for every claim; the owner selected approval for every claim. The support approval API is Implemented locally (November 17, 2026), disabled by default until age 18 and an explicit support account allowlist are configured; no support approval screen is built. DOB provenance and real identity/minor-consent and retention approval remain gates before real data.
- Resolved support-operator authorization decision (raised and resolved November 17, 2026; owner: project owner): profile-claim approval is restricted to an explicit server-configured account allowlist. Organizer roles grant no support authority. This resolves the choice between an in-app approval boundary and an outside-only process; the owner selected the allowlist. The configured age check and atomic audited support approval API are Implemented locally (November 17, 2026), disabled by default. No organizer role grants this authority; support must be a different account from the claimant. Existing identity, consent and retention approval gates remain.
- Support-approved claim API (Implemented locally, November 17, 2026): an allowlisted, signed-in support operator submits the existing rider account, reviewed DOB, rider-confirmed named time zone, review reference and explicit acknowledgement. The configured minimum must be 18; there is no default threshold or operator. One atomic family-locked transaction records the approval, ends every active guardian grant, cancels unaccepted invitations and retires the old read-only viewer login. The claimed rider gains family authority over linked orders; original placer, prices, payments and waiver evidence are unchanged. Existing organizer permissions remain separate. Exact normalized retries retain the original approval; changed retries or a second claim conflict. Active guardians cannot be the claimant, and self-approval is refused. DOB and review references stay in the support audit record, outside ordinary rider/order responses. No identity-document upload, claim screen, disputed restoration or real-identity/retention acceptance is implemented.
- Resolved post-claim registration decision (raised and resolved November 17, 2026; owner: project owner; [issue #181](https://github.com/kchan1028/event-registration/issues/181)): block a former guardian from creating a new junior profile with the claimed rider’s same name pending support review. The owner selected blocking rather than permitting a new entry with organizer review. Enforcement is Implemented locally (November 17, 2026): new guardian checkout is refused when the signed-in account has historical guardian access to a claimed profile with the same normalized recorded registration-block first/last name. This includes guardians removed before the claim and historical grants on profiles later merged into the claimed profile; the recorded merge chain is followed without a global name inference. It uses the existing accent/case/whitespace normalization, not legacy stored-key formatting. A name snapshot is captured when a new claim is inserted; existing claims receive an enforcement baseline from the profile at migration 33, without pretending that baseline was the historical claim-time name. Later profile corrections do not rewrite the block name or silently bypass it. The check holds the family lock before inserting an order; a failed attempt creates no profile, grant, entry or hold. Existing accepted orders and their normal replay/authority rules remain unchanged. Unrelated households with the same name and a different child remain eligible under existing rules. No review queue, support bypass or global name-based identity merge is built; manual claim/registration acceptance, identity and retention approval remain separate gates.
- Open guardian recovery-message question (November 17, 2026; owner: project owner; [issue #175](https://github.com/kchan1028/event-registration/issues/175)): should the original action context remain visible when both a guardian action response and its later access refresh fail? The current refresh error replaces the action warning. This affects recovery wording/focus, not server authority. Provisional assumption: keep current behavior pending a usability decision; no new access action is authorized by an unknown result. Other Phase 2 work can proceed; revised wording/focus remains unapproved. Revisit before manual guardian workflow acceptance.
- Approved notice audience (owner, November 16, 2026; Planned): new junior registration and payment-status messages go to current authorized guardians, or the rider after a claim. Stop later messages to removed guardians and the original payer if no longer authorized; freeze each new message's authorized audience and recheck before dispatch, without automatically backfilling historical private messages to a new guardian. Refund destination remains the original payment method.
- Represent guardian-to-junior access explicitly. A guardian sees only juniors they are authorized to manage; a rider reaching the applicable age does not silently retain or lose another person's access.
- Define account email change, recovery, deletion, and support escalation. A recovery or email change cannot bypass authorization, payment history, waiver integrity, retention rules, or organizer MFA.
- Measure delivery time and failure recovery for emailed codes on a phone. A delayed or bounced code must not cause duplicate accounts, orders, or invitations.

Acceptance: in a real Clerk development instance, an invited organizer signs in, receives only the assigned organization roles, loses access when removed, and can take ownership through an audited transfer. A guardian can access an authorized junior but not another household's registration. Expired, resent, delayed, and bounced emails have a safe recovery path, and no test or support path bypasses server authorization.

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
| Start-list accuracy | Every confirmed entry appears in the correct sample export |
| Category setup completeness | Approved road race and criterium schedules can be configured without custom code or spreadsheet-only rules |
| Handoff | Two organizers and two volunteers complete their assigned tasks without developer intervention |

Capture abandonment and support requests without recording payment details or sensitive form content. Help-specific measures are in [Self-service help](#help-success-measures).

## Out of scope initially

Timing hardware, finish-line timing, omnium points/results scoring, rankings, training plans, route/weather tools, federation membership administration, international federation integrations, marketplace discovery, fundraising, and a native mobile app.

Race results and weather may be linked from the event website. They do not belong on the registration critical path. Project-owner decision, November 19, 2026: timing-software integration, format approval, import and round-trip testing, and results-upload support are deferred for possible future development. The existing sample start-list CSV and revisions remain in scope. The project owner will revisit whether interoperability belongs in CycleReg if organizer discovery establishes a need. No integration is committed. See [future research](#results-site-updates-research).

## Business model hypothesis

A transparent per-paid-entry platform fee, with the organizer choosing whether to absorb it or pass it through. Confirm unit economics and rider tolerance before setting a price. Free junior entries need an explicit cost policy. Avoid advertising in checkout.

## Launch criteria

Do not replace Berkeley Omnium's registration merely because the software is available. Require validated federation and payment workflows, correct start lists and revisions, successful event-day rehearsal, measurable workload benefit, and a named support owner. Category setup must pass every configuration fixture and acceptance criterion above using an organizer-approved road race and criterium schedule. Start with a lower-risk cycling event. Berkeley Omnium remains on its existing system until those gates pass.

## Open decisions

Phase 0 answers decisions 1 to 6 and 8 with the [discovery kit](docs/discovery/README.md); none has an answer yet. Interview [D01](docs/discovery/interviews/D01.md) (November 14, 2026) gives early, estimate-only input to decisions 1 and 2: reconciliation (reports, refund matching, merchandise) and bib assignment across multiple fields are the largest named costs, and whether they come from software limits is not yet known. The current tool is BikeReg; discounts there need generated codes, and shared-field limits are enforced by a person. D01 reports no license issues or duplicate entries per event. D01 also said riders may not find or trust an unfamiliar platform; this and merchandise reconciliation are recorded as discovery evidence, not yet requirements.

1. What specific tasks consume the most volunteer time today, and which are limitations of software rather than staffing?
2. How are both days, multiple entries, shared fields, discounts, and bibs currently configured?
3. Who will fund development and provide operational support after launch?
4. Will USA Cycling accept the proposed manual license and waiver workflow for the event? Open, November 19, 2026. The project owner coordinates acceptance with the race director and USA Cycling, including the license source and freshness rules, who resolves disputed evidence, the waiver and guardian process, and evidence retention. The [draft desk procedure](docs/runbooks/race-day-check-in.md#manual-license-and-waiver-exceptions) can be rehearsed with fictional data. Revisit before a sanctioned pilot. The planned integration has a separate approval and access decision.
5. Stripe is selected. Which merchant, Connect charge/transfer, settlement, refund, dispute, and tax-responsibility model works for the club and multi-organization season passes? Public research (November 15, 2026, [payment model questions](docs/payment-model-questions.md#findings)) shows a single club account with hosted Checkout meets the Stripe-side needs and that nonprofit pricing does not apply to registration fees; the receiving entity is a nonprofit corporation with its own bank account, and the organizer would handle disputes. Who approves a switch and the corporation's 501(c) status are still unanswered.
6. What refund policies, retention periods, and organizer permissions are required? Timing-software formats are deferred.
7. Decided 2026-11-15: riders and guardians use email sign-in only, so checkout has no second-factor step; MFA applies to organizer roles before the live pilot. Still open: how fast an emailed code arrives on race morning, and what riders do when it does not.
8. Deferred November 19, 2026: should CycleReg support timing-software imports or results uploads at all? Revisit if organizer discovery establishes a need. The [research questions](#results-site-updates-research) remain available for that decision.

9. Interim rule decided 2026-11-15 by the project owner: the local build requires a guardian and guardian signature for every rider with racing age 18 or under, in any category. Racing age is age on December 31, so this catches every rider who may be 17 on race day and also asks some riders who are already 18. Still open: the federation's accepted minor-signature policy and whether a date of birth is needed to decide legal age on race day.
10. Who owns the initial Berkeley reference study and approved schedule review, and which safe local-device arrangement supports phone/screen-reader testing? Confirm participants and session availability before scheduling; no outreach has occurred.

### Check-in recovery warning decision

Decided November 19, 2026 by the project owner. After a lost check-in response, show that the result is unconfirmed and require a successful explicit lookup of the same rider and race day before another check-in attempt or bib handover. Replace the warning with a verified result that identifies the recorded bib or says check-in was not recorded. A failed lookup or a background refresh does not resolve the warning. Payment and readiness remain independent. The observation came from a simulated browser walkthrough ([#153](https://github.com/kchan1028/event-registration/issues/153)); verify comprehension with volunteers before acceptance.

Follow-up decided November 19, 2026 by the project owner ([#259](https://github.com/kchan1028/event-registration/issues/259)). Keep manual recovery after a full page reload on shared check-in devices. The desk clears the pending warning and search, and staff reselect the original race day and look up the rider by check-in code. Staff verify the recorded bib and time or retry once if check-in was unrecorded and the rider is ready. Pending recovery details stay in memory for the current page. The local rehearsal exercised both outcomes; volunteer comprehension and physical handover remain open.

### Ownership-transfer successor prerequisite

Decided November 19, 2026 by the project owner ([#151](https://github.com/kchan1028/event-registration/issues/151)). The successor must have signed in and already hold a role in the same organization. The server checks current membership when it transfers ownership. The signed-in teammate list in Team and roles already follows this rule. Real sign-in and staff handoff acceptance remain open.

### Uncertain reservation support decision

Open, raised November 16, 2026; owner: project owner (technical and registration support input unassigned). What safe status-check or operator-assisted cancellation path should be available after prolonged reservation failures? The unresolved outcome may already hold capacity, so abandoning the request and starting again can create another hold. Provisional implementation keeps the original request and disables edits while offering retry and organizer-contact guidance; it does not automatically abandon it. The current fixes and synthetic testing can proceed. A developer-independent recovery procedure remains blocked on ownership and policy. Revisit before the controlled pilot and its operational rehearsal. Separately, decide whether to display the accepted category addendum text during recovery ([usability observation #131](https://github.com/kchan1028/event-registration/issues/131)); the current snapshot keeps the submitted addendum IDs, but the pending view hides their text. Also decide how a newly opened offer link should be explained or reapplied after recovery: its banner can describe an offer that is deliberately excluded from the pending request, and applying it after rejection currently requires reopening the link. These display/reapplication choices do not block exact-request replay and remain open for the same owner at that revisit.

### Waitlist offer status retry

Resolved November 18, 2026. Keep the public schedule read independent so it can render before sign-in and when private offer lookup fails. After opening a signed-in offer, check current event status before prefilling. If validation fails, explain that registration status could not be checked and provide an in-page retry that reopens the offer and reads fresh event status. When a newer schedule check supersedes the offer check, explain why the rider needs to retry the offer. If retry ends with a terminal error, move keyboard focus to the registration status control or the event heading while that control is unavailable. A closed category cannot be prefilled, and retry preserves any unresolved reservation payload. See [issue #210](https://github.com/kchan1028/event-registration/issues/210).

### Phone roster review decision

Resolved November 16, 2026 by the project owner: use a stacked phone roster with snapshot readiness always visible for each rider; keep tables on desktop and in print. This answers [expert observation #144](https://github.com/kchan1028/event-registration/issues/144), based on a 390px rendered review, not volunteer feedback or a real-device result. The previous provisional scrollable-phone-table assumption is superseded.

At phone widths (640 CSS pixels and below), show each rider’s name, snapshot status and blockers, recorded bib, racing age, team, races and next-step guidance in a stacked read-only list without sideways scrolling. Desktop and printed tables keep the existing data and recording limits; printing from a phone also uses tables. The phone view exposes one visible/accessible roster presentation, preserves reference-only warnings and does not add registration, payment, waiver clearance or offline check-in. Its entries already include blocker guidance, so the separate paper exception checklist and blank write-in rows remain desktop/print aids. Verify both themes, long content, empty states and print behavior before closing the observation; real-device, screen-reader and staff acceptance remain separate gates.

### Self-service help ownership and scope decision

Open, raised November 16, 2026; owner: project owner (help content owner unassigned). Who owns task guides and FAQs, which tasks get guides first, and where help lives (inside the app, public pages, or both)? Why it matters: [Self-service help](#7-self-service-help-and-guidance) requires one owner per topic, and the first guides should follow evidence rather than guesses. Provisional assumption: the project owner owns help content until someone else is named; the first candidates are the rider tasks in that section's evidence table; help ships inside the app first, because no public pages exist ([content guide](docs/content-guide.md)). Can proceed: clearer labels, error messages, and empty states on existing screens, under normal review. Blocked: publishing task guides or an FAQ, and choosing search or an assistant. Revisit after the Phase 1 usability sessions, or before the controlled pilot, whichever comes first.

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

### Payment-platform comparison sources

Research checked November 15, 2026 for the [payment-platform and method comparison](docs/research/payment-platform-options.md). These are public U.S. pricing/capability observations, not an approved processor switch or live merchant eligibility. Primary fee sources: [Stripe](https://stripe.com/pricing), [Stripe methods](https://stripe.com/us/pricing/local-payment-methods), [Stripe bank products](https://stripe.com/payments/us-bank-payments), [Square API](https://developer.squareup.com/docs/payments-pricing), [Square Payment Links](https://squareup.com/us/en/payment-links), [Braintree](https://www.paypal.com/us/enterprise/paypal-braintree-fees), [PayPal](https://www.paypal.com/us/business/paypal-business-fees), [Helcim](https://www.helcim.com/pricing/), and [Adyen](https://www.adyen.com/pricing). Method eligibility and unresolved operating questions remain in the [payment-model guide](docs/payment-model-questions.md#unresolved-operating-decisions). ADR 0002’s Stripe selection and the live-use gates remain unchanged.
