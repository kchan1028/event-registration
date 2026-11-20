# Berkeley Omnium

Status: Research case; proposed reusable configuration. The existing Berkeley demo is Implemented, not an approved current schedule. Reviewed November 14, 2026.

## Published evidence

The [organizer's racing page](https://berkeleyomnium.com/racing) publishes a 2026 road/criterium schedule while advertising April 17-18, 2027 for the next edition. It labels the road-race times as staging, not verified individual starts. Masters 35+/50+ 3/4 are separate road rows but share a criterium row; collegiate/domestic and junior groupings also vary by day. The women's long/short road choices do not directly reproduce the criterium's category labels.

The [organizer's home page](https://berkeleyomnium.com/) describes racing both days in the same category for omnium participation, but the displayed day-specific labels still require an approved mapping. Do not implement “same category” as string equality.

The executable [working fixture](../../../src/shared/berkeleyOmnium.ts) has 26 road categories in 16 starts and 28 criterium categories in 12 starts. All road start-group limits are unset. These counts describe our draft implementation, not a verified official registration matrix. The local category/rider prices and packages are organizer-supplied demo values documented in [events.md](../../fixtures/events.md), not independently verified public prices.

## Organizer-approved demo pricing

Updated November 15, 2026. These are owner-supplied fixture prices, not independently verified public prices.

| Eligible rate | BHRR | BSC | Omnium | Second BSC |
|---|---:|---:|---:|---:|
| Junior (racing age 18 or younger) | $30 | $20 | $40 | $10 |
| Collegiate | $60 | $40 | $90 | $10 |
| Women’s category | $40 | $20 | $50 | $10 |
| Standard | $80 | $60 | $130 | $20 |

The rider screen displays this package comparison above race selection, with Junior, Collegiate, Women and Standard labels drawn from published rate metadata. Riders can compare both-day prices before entering details or selecting races.

Overlapping eligibility uses the lowest eligible price, including the package. A junior collegiate woman therefore pays $40 for the package, or $50 with a second BSC entry. An adult collegiate woman in women’s categories pays $50 for the package. Declared rider facts drive junior/collegiate rates; women’s rates apply to women’s categories. Unknown facts do not grant a reduced rider rate. The $15 day-of surcharge is retained for standalone entries; the existing fixed package absorbs it, and extra BSC entries stay at the flat price. Existing paid orders retain their accepted quote. The local demo is updated explicitly because seed reruns preserve edits.

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

## Rider discovery example

Owner decision, November 15, 2026: keep the full schedule as the initial view and offer Find my races after rider details. Racing age 50 and Cat 4 produces three matching choices per day: Elite 4, Masters 35+ 3/4 and Masters 50+ 3/4. The two criterium masters classifications share one start, not two separate races. The shortcut uses existing eligibility checks, not name matching. Review-required/unknown choices remain in All races; selected entries stay visible if the profile changes. Matching races shows a notice when a class-specific category needs a competition class to confirm a match. Show all races and All races both reveal it. No license verification or eligibility rule is added.

## Acceptance exercise

Two masters presets produce separate road starts and one shared criterium start, with no lost classifications or double capacity consumption. An organizer must resolve missing caps, eligibility, start times, and cross-day mappings before approving the named starter. Copying it to a new season changes IDs, not historical entries. See T01 and T10 in the [case index](README.md#proposed-validation-exercises).

## Open questions

Review the women's long/short split, collegiate mappings, junior field/classification memberships, actual road starts and caps, and approved overall-participation rules. The existing fixture simplifies unresolved parts; this case records that limitation rather than silently treating the fixture as authoritative or changing code during research.

### Pricing edge cases awaiting organizer approval

Raised November 15, 2026; owner: KC. The approved rate matrix and lowest-eligible overlap rule are resolved. Three existing mechanics need an explicit decision before live use: should a mixed women/open selection retain a podium nomination when no money-saving package applies; should the full-price first BSC entry remain the most expensive eligible entry; and should promotional coupons apply to the reduced base rider price? These affect award participation and final checkout totals. Provisional behavior preserves the existing rules: only a money-saving bundle creates its nomination, the most expensive BSC entry is first, and coupons may reduce undiscounted base-rate entries but never package/extra-entry discounted entries. The requested demo matrix can proceed; expanded award/coupon/mixed-entry promises remain blocked. Revisit before approving Berkeley registration for live use or changing these mechanics. Fixed packages continue absorbing day-of surcharges, as before this update.

Technical follow-up (November 15, 2026; owner: unassigned): rider-rate changes currently flag every category with entries for price-impact review, including categories whose rates did not change. This is conservative review noise, not repricing. Keep that behavior provisionally; refine affected-category reporting before organizer production rehearsal. Pricing and the requested demo update can proceed.
