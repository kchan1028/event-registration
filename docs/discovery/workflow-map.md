# Current workflow map

Use this map to record how one recent event was actually run, step by step. Fill it from the race director and registration lead interviews, the anonymized files they share, and an observation of check-in if one happens during Phase 0. Record what happened, not what should have happened.

Event mapped: Berkeley Omnium two-day road race and criterium weekend (partial)  
Current tool: BikeReg (D01).  
Sources: [D01](interviews/D01.md), 2026-11-14, follow-ups 2026-11-15 (one person answering as promoter, registration lead, and treasurer). No files shared, no observation yet. Every time is an estimate.

## How to fill it in

For each area, record every step in order. One row per step.

| Column | What to write |
|---|---|
| Step | What was done, in plain words |
| Who | Role, not name |
| Tool | Registration system, spreadsheet, email, paper, other |
| Time | Minutes or hours per event, and whether it is measured or an estimate |
| Problems | Errors, rework, or confusion this step causes |
| Software limit? | Yes if the current tool cannot do it; No if it is a staffing or process issue; Unsure |

The last column answers [open decision 1](../../product.md#open-decisions) in product.md: which costs come from software limits rather than staffing. Only software limits are a case for building.

## Areas to map

Copy the table under each heading.

### 1. Road race and criterium setup

Schedule, races, registration categories, eligibility rules, distances or durations, start times.

| Step | Who | Tool | Time | Problems | Software limit? |
|---|---|---|---|---|---|
| Decide categories and field sizes; road race copied from last year, criterium redesigned so riders can race more than once | Promoter | Registration system | About 1 hour if only prices change; a few hours if fields, categories, or times change (estimate, D01) | None reported | Unsure |

### 2. Shared fields and capacity

Start groups that share a field limit, category caps, what happens when a field fills.

| Step | Who | Tool | Time | Problems | Software limit? |
|---|---|---|---|---|---|
| Decide which fields to combine and whether to score them separately; limits of 75 for Novice and 100 for other fields | Promoter | Registration system | Included above | Many combined Masters fields (for example 35+ Cat 3/4, 35+ Cat 1/2/3). Who or what enforces a shared limit not yet known | Unsure |

### 3. Prices, discounts, and bundles

Single-day prices, two-day or omnium bundles, additional-race discounts, junior pricing, late fees.

| Step | Who | Tool | Time | Problems | Software limit? |
|---|---|---|---|---|---|
| Set prices from expected entries and sponsor money; omnium package, junior, collegiate, and women's entry pricing | Promoter | BikeReg | Included above | Discounts need generated discount codes, which D01 finds hard | Unsure |

### 4. Changes after opening

Schedule or category changes, transfers between categories, refunds, cancellations, waitlists.

| Step | Who | Tool | Time | Problems | Software limit? |
|---|---|---|---|---|---|
| Change schedule with entry numbers; refund affected riders or move them to another time or field. Riders transfer their own entries; organizer approves refunds | Promoter | Registration system | Not given | None reported | Unsure |

### 5. Exceptions

License problems, junior waivers, wrong category, duplicates, missing information.

| Step | Who | Tool | Time | Problems | Software limit? |
|---|---|---|---|---|---|
| Handle license issues and duplicate entries; a rider with an unconfirmed license cannot register (D01 cites a USAC rule) | Registration lead (same person) | BikeReg | Not given | Counts not given | No (rule, not tool) |

### 6. Check-in and bibs

What volunteers look up, what sends a rider to the registration desk, bib assignment, day-of registration.

| Step | Who | Tool | Time | Problems | Software limit? |
|---|---|---|---|---|---|
| Check-in is mostly day-of registration (about 30 riders); volunteers confirm license and waiver. Bibs assigned in BikeReg, one block per field inside 1 to 1000 | Registration lead, volunteers | BikeReg | Bibs about 1 hour, depending on entries (estimate, D01) | Planning bib blocks around expected field sizes | Unsure |

### 7. Exports and handoffs

Start lists to the timer, race-morning changes, results upload, financial reconciliation.

| Step | Who | Tool | Time | Problems | Software limit? |
|---|---|---|---|---|---|
| Export start lists as CSV for the timer. Reconcile total registration fees minus processing fees; ACH payout within a week | Registration lead, treasurer (same person) | Registration system, CSV | Start lists 30 to 60 minutes, or about 5 with a saved template; reconciliation about 8 hours (estimates, D01) | Reconciliation time: building reports, matching refunds, merchandise sales | Unsure |

## Summary

Fill in after the map is complete.

| Question | Answer |
|---|---|
| The three steps with the highest time cost | Preliminary, from D01 only: reconciliation (about 8 hours: reports, refunds, merchandise), bib assignment across multiple fields (about 1 hour), start-list CSV setup (30 to 60 minutes without a template) |
| The three steps with the most errors or rework | |
| Which of those are software limits | |
| Which could be fixed with process, templates, or more volunteers | Start-list export already drops to about 5 minutes with a saved template (D01). Others not yet known. |
| Configuration the current tool cannot express at all | None named. Discounts are expressible but need generated codes (D01). |
