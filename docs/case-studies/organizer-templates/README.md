# Organizer template case studies

Status: Research documented; organizer template implementation remains Planned. Reviewed November 14, 2026.

These six cases test the [reusable organizer template requirements](../../../product.md#reusable-organizer-templates). They describe published event structures and proposed ways to configure them in CycleReg. They are not approved race templates, current federation rules, executable seed data, or evidence of organizer permission to reuse an event's identity. No participant, waiver, payment, or results records are copied.

Use 2026 publications where available, with each source's season stated. Several websites already advertise 2027 while linking 2026 schedules. Never silently combine those editions. Published field names are evidence of presentation, not complete structured eligibility. A label alone does not settle license type, age calculation, competition class, shared capacity, or award eligibility.

## Case index

| Case | Published pattern to study | Template capability to exercise |
|---|---|---|
| [Redlands Bicycle Classic](redlands-bicycle-classic.md) | Professional stage-race program alongside separate licensed/junior events | Separate registration programs; ordered mixed-format stages; approval/team workflow boundary |
| [Chicago Grit](chicago-grit.md) | Ten-day criterium festival with shorter category series | Daily overrides, category availability, classification mappings, and package subsets |
| [Tulsa Tough](tulsa-tough.md) | Three criteriums with a restricted Friday field list | Category-by-day matrix; two-day versus three-day participation |
| [Berkeley Omnium](berkeley-omnium.md) | Road race plus criterium with different day-specific combinations | Independent day categories, shared starts, staging versus actual starts |
| [Golden State Race Series](golden-state-race-series.md) | TT, criterium, circuit race, and points-based overall classifications | Optional components, circuit format, pending TT schedules, and source conflicts |
| [California Bicycle Racing (CBR)](california-bicycle-racing.md) | Repeated single-day criteriums, special junior event, and seasonal competitions | Reuse with event overrides; separate daily/season awards and credit-style benefits |

The sixth case is California Bicycle Racing at californiabicycleracing.com, confirmed by the product owner; it is not an event named “California Bicycle Classic.”

## What the organizer should assemble

Use the existing three planned layers rather than one immutable template per event:

1. **Event format:** a single race, road/crit weekend, multi-day criterium program, mixed-format competition, or repeated series of standalone events.
2. **Category presets:** explicit, editable eligibility and classifications, selected by the organizer. A daily availability matrix determines where each preset is instantiated.
3. **Start configuration:** category-to-start membership, stage-specific schedules, separate classifications, and explicit capacity scopes. Staging or a shared printed time does not alone establish one shared field.

Purchase packages and overall-participation rules are independent configuration alongside those layers. A day pass, full-series purchase, and eligibility for an overall award are different decisions. “Stage race,” “series,” or “omnium” in a title must not auto-select purchase or participation rules.

## Proposed validation exercises

These are paper scenarios for future implementation and organizer testing, not automated tests already passing.

| ID | Exercise | Expected result |
|---|---|---|
| T01 | Reuse masters presets in Berkeley with separate road starts and a combined crit start | Distinct entries/classifications and an explicit combined capacity; no new full-event template needed |
| T02 | Copy Tulsa Saturday to Friday | Organizer must remove unavailable categories; no Friday novice/junior entries are invented |
| T03 | Build Chicago's first and second five-day category programs | Category definitions and start memberships can change by day; no forced ten-day package for every category |
| T04 | Add Chicago's separate daily versus overall classification mappings | One entry can carry explicitly approved mappings without consuming another place; no automatic nested-age eligibility |
| T05 | Assemble a Golden State junior option with TT marked unavailable | No nonexistent TT entry or mandatory all-three purchase is generated |
| T06 | Import Golden State's conflicting date labels or CBR's contradictory limits/time | Preserve the source values, show a review issue, and prevent automatic approval; do not guess a correction |
| T07 | Copy a CBR regular event to the Roger Millikan program | Junior categories, fees, durations, and times can be overridden without changing other series events |
| T08 | Model Redlands professional stages beside a standalone public criterium | A public purchase never grants entry to the invitational/team program; unsupported workflow stays visibly unresolved |
| T09 | Associate a series award or pass with only approved component races | Buying more/fewer races cannot silently change award eligibility; missing cross-day mappings require review |
| T10 | Create next season from any saved example | Fresh IDs, remapped references, no participant/financial/signature history, and mandatory season/source review |

Source-download checks and visual review notes: [source notes](source-notes.md).

## Coverage limits and decisions to resolve

- The current schema supports road race and criterium only; TT and circuit-race representation need an explicit implementation decision. Do not disguise either as an ordinary criterium to make a fixture load.
- Team-managed invitational registration, rolling future-use entitlements, and special training/clinic registration are research boundaries, not features added by these cases.
- None of these sources establishes a single purchase splitting revenue across independent organizing entities. They do not verify the Planned cross-organization settlement model.
- Points, timing, rankings, and prize calculations remain out of scope. Preserve approved classification/participation identifiers for the timer instead.
- Confirm current season's schedule, eligibility, field caps, payment policies, event permissions, and overall-participation mappings with each organizer before publishing a reusable named example.

Delivery and dependencies stay in [roadmap.md](../../../roadmap.md); this folder is not a competing roadmap.
