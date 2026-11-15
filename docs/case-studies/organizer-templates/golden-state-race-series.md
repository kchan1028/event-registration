# Golden State Race Series

Status: Research case; proposed configuration only. Reviewed November 14, 2026. Edition studied: 2026; current promoter page already advertises 2027.

## Published evidence

The [promoter](https://riostradaracing.com/golden-state-race-series-1) identifies the event family. The [NCNCA 2026 circuit listing](https://ncnca.org/event/golden-state-race-series-circuit-3/) links the [organizer flyer](https://d377h05jk13k61.cloudfront.net/usacycling/d61585ec1312abb04dc5e9f4df32fb18.pdf). Its first page advertises May 1 TT, May 2 criterium, and May 3 circuit racing. It combines Novice/Elite 4, some women's categories, and Women Pro/1/2/3 with Masters 40+ for mass-start rows, with separate picking/scoring notes; these groupings explicitly differ for TT. Juniors 10-14 have no TT in the table. The TT is pre-registration only.

The [timer's classification-rules page](https://www.ontheday.net/2026/gsrs/stage_race/classification_rules/) describes points-based overall classification and permits entering any stage. It is classification evidence, not an organizer-approved eligibility or purchase matrix. No timing or results records were imported.

The flyer headline dates conflict with its column headings (May 2/3/4), and text gives inconsistent deadlines for publishing TT start times. These conflicts were visible in the inspected source and must remain review issues.

## Proposed organizer setup

| Step | Configure | Review boundary |
|---|---|---|
| 1 | Create TT, criterium, and circuit race as distinct components | Circuit race requires an explicit representation decision; it is not automatically a criterium |
| 2 | Reuse category definitions with component-specific availability | Do not add TT to a junior option whose published TT cells are N/A |
| 3 | Group approved mass-start categories into shared starts | TT may need separate category sequences/individual start slots instead |
| 4 | Give classifications explicit mappings per discipline | The same visible combined row need not correspond to one purchasable category |
| 5 | Configure per-component windows and start-time publication status | A pre-registration-only TT must not inherit walk-up eligibility from the crit |
| 6 | Keep overall participation independent from full-event purchase | A points omnium may allow partial attendance; the title or URL must not impose all-stage entry |

For a paper example, add a two-race junior product with no TT and a three-component adult option only where eligibility and source rules allow it. These are proposed configuration exercises, not verified advertised package products or prices.

## Reusable lesson

A three-discipline event is not automatically a mandatory three-stage purchase. Templates need component availability, start methods, classification mappings, and participation policy as independent controls. The difference between a circuit race and a criterium must be retained for organizer review, even if they later share implementation primitives.

## Acceptance exercise

A junior category with TT unavailable can still enter its supported races without a phantom entry or capacity hold. A source-import preview flags the date mismatch rather than moving races one day by guesswork. TT start slots can remain pending without being fabricated from a mass-start time. See T05, T06, and T09 in the [case index](README.md#proposed-validation-exercises).

## Open questions

Confirm the authoritative date table, TT eligibility and start intervals, whether subgroup limits are individual or combined, junior boys/girls start arrangements, permitted entry/package combinations, and the precise overall-eligibility categories. The timer rules omit some schedule groups; absence from that table does not prove that a group has no race. Confirm with the promoter, and do not copy these historical rules into a new season by default.
