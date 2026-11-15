# Berkeley Omnium

Status: Research case; proposed reusable configuration. The existing Berkeley demo is Implemented, not an approved current schedule. Reviewed November 14, 2026.

## Published evidence

The [organizer's racing page](https://berkeleyomnium.com/racing) publishes a 2026 road/criterium schedule while advertising April 17-18, 2027 for the next edition. It labels the road-race times as staging, not verified individual starts. Masters 35+/50+ 3/4 are separate road rows but share a criterium row; collegiate/domestic and junior groupings also vary by day. The women's long/short road choices do not directly reproduce the criterium's category labels.

The [organizer's home page](https://berkeleyomnium.com/) describes racing both days in the same category for omnium participation, but the displayed day-specific labels still require an approved mapping. Do not implement “same category” as string equality.

The executable [working fixture](../../../src/shared/berkeleyOmnium.ts) has 26 road categories in 16 starts and 28 criterium categories in 12 starts. All road start-group limits are unset. These counts describe our draft implementation, not a verified official registration matrix. The local $80/$60 prices and $130 package are organizer-supplied demo values documented in [events.md](../../fixtures/events.md), not independently verified public prices.

## Proposed organizer setup

| Step | Configure | Review boundary |
|---|---|---|
| 1 | Choose the road-race/criterium omnium starter | Separate days, courses, race lengths, and entry options |
| 2 | Select masters, elite, novice, collegiate, women, and junior presets | Explicit draft eligibility; no automatic federation approval |
| 3 | Keep road staging separate from actual start times | Multiple staged groups at 08:15 do not automatically share one start or capacity |
| 4 | Put Masters 35+ 3/4 and Masters 50+ 3/4 into one crit start | Preserve separate classifications and explicitly approve the shared limit |
| 5 | Keep independent day-category definitions | Junior and women's combinations may differ across days |
| 6 | Configure explicit cross-day overall-participation mappings and the optional event package | Price savings and award participation remain separate concepts |

For the paper masters example, create two road starts with the same staging time if appropriate, then one shared criterium start containing both category definitions. Require real road limits and reviewed start order before treating the setup as ready; do not convert the fixture's unknown limits into unlimited approved capacity.

## Reusable lesson

This is the clearest small example of separating display header, purchasable category, start, classification, and capacity. Reuse category definitions across days only after making day-specific differences visible. Keep an overall-category identifier separate from local category names.

## Acceptance exercise

Two masters presets produce separate road starts and one shared criterium start, with no lost classifications or double capacity consumption. An organizer must resolve missing caps, eligibility, start times, and cross-day mappings before approving the named starter. Copying it to a new season changes IDs, not historical entries. See T01 and T10 in the [case index](README.md#proposed-validation-exercises).

## Open questions

Review the women's long/short split, collegiate mappings, junior field/classification memberships, actual road starts and caps, and approved overall-participation rules. The existing fixture simplifies unresolved parts; this case records that limitation rather than silently treating the fixture as authoritative or changing code during research.
