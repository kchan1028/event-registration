# California Bicycle Racing (CBR)

Status: Research case; proposed configuration only. Reviewed November 14, 2026. The product owner confirmed californiabicycleracing.com as the intended example.

## Published evidence

The [organizer's website](https://californiabicycleracing.com/) presents a repeated criterium series and advertises a 2027 season pass while retaining 2026 material. Use separately dated source documents rather than treating that page as one season's schedule.

The [April 19, 2026 Carson flyer](https://californiabicycleracing.com/wp-content/uploads/2026/04/04.19.26-Carson-Flyer-V2.pdf) shows overlapping license combinations (4/5, 3/4, 2/3), masters bands, and shared women's rows. Its footnote specifies separate scoring within women's combined starts. A row says 12:30 am amid daytime races; the SAFE program says maximum 10 riders while its limit cell says 20. Those are unresolved source contradictions, not values to normalize automatically.

The [February 22, 2026 Roger Millikan flyer](https://californiabicycleracing.com/wp-content/uploads/2026/01/02.22.26_Roger_Millikan_flyer.pdf) adds free junior options and different schedule rows, including an entry with two displayed durations. A repeated series therefore cannot rely on one unchanged daily template.

The [2026 competition document](https://californiabicycleracing.com/wp-content/uploads/2026/06/2026-TEAMBARMAR-Competitions.pdf) separately describes team, BAR, and MAR competitions. The [2026 VIP flyer](https://californiabicycleracing.com/wp-content/uploads/2025/11/2026-Team-VIP-Flyer.pdf) describes six future-use entries subject to availability, but includes inconsistent prior-year price dates. Do not treat this as a verified 2027 pass product or guaranteed race reservation.

## Proposed organizer setup

| Step | Configure | Review boundary |
|---|---|---|
| 1 | Save a standard single-day criterium starter | Category eligibility remains explicit despite overlapping license lists |
| 2 | Instantiate individual events under a series | Reusing a starter must not link live category IDs or capacity across dates |
| 3 | Apply event-specific junior, timing, fee, and venue overrides | The special junior program must not change the regular events retroactively |
| 4 | Configure shared women's starts and separate classifications | One shared limit is not a cap on every separate classification |
| 5 | Link event-specific entries to approved season competition mappings | Daily categories, team association, and season awards stay distinct |
| 6 | Separate fixed-race passes from future-use entry entitlements | A benefit redeemable later reserves no place until an eligible event has capacity |

The paper women's example uses a shared start for Women 4/Novice and Women Masters 35+, with separate reviewed eligibility/classification definitions. Do not infer that every masters rider also enters the novice classification. Keep clinic/training-program rows outside normal race-entry generation until their own requirements are defined.

## Reusable lesson

Copy-and-override supports recurring races better than many complete templates. A season award is not a package, and a future-use entry benefit is not a fixed list of prepaid reservations. The current Planned first season pass explicitly selects races at purchase; flexible future redemption remains a later decision.

## Acceptance exercise

Create a regular CBR-style draft, copy it to a special junior event, and change only the copied schedule/prices/categories. The source and other series events stay unchanged. Importing the contradictory capacity or midnight-looking start must require review. No VIP credit claim should consume a race place until redemption. See T06, T07, T09, and T10 in the [case index](README.md#proposed-validation-exercises).

## Open questions

Resolve the apparent AM/PM error, SAFE capacity conflict, subgroup scoring and eligibility mappings, dual-duration starts, authoritative current series membership, and exact pass terms with the organizer. Team/series points, clinic delivery, and optional VIP services are not added to CycleReg scope by this case study.
