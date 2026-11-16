# Demo events

Status: Implemented local Berkeley Omnium fixture. Updated November 15, 2026.

The standard Berkeley demo contains only **Berkeley Omnium 2027**, one event with two race days. The executable [Berkeley fixture](../../src/shared/berkeleyOmnium.ts) supplies the shared configuration; [SETUP.md](../../SETUP.md) explains how to seed and run it. This Markdown file is a reference, not an input to the app.

| Race | Date | Categories | Base entry price |
|---|---|---|---|
| Berkeley Hills Road Race | Saturday, April 17, 2027 | 26 | $80 |
| Berkeley Streets Criterium | Sunday, April 18, 2027 | 28 | $60 |

The road race uses Bear Creek Road near Orinda; the criterium uses downtown Berkeley. Both use America/Los_Angeles time. Fields, distances, start times, and limits come from 2026 race information dated for 2027. Eligibility remains draft configuration requiring organizer review, not verified current federation rules.

## Package and pricing

One independently eligible category in each race costs $130 as a fixed-price package, saving $10. It records a podium nomination requiring organizer review; scoring, results, and award approval tools are not built. An additional criterium race costs $20. The fixture retains the $15 day-of surcharge, with zero platform and processing fees. See [product requirements](../../product.md#scope-of-the-first-release) for the authoritative package rules.

## Seed behavior and boundaries

`npm run seed:berkeley` publishes one combined event with no prefilled riders, orders, or simulated capacity entries. Demo mode permits registration outside the configured window. The sample waiver is not an official waiver. All rider information and payments must be fictional or simulated.

A rerun preserves IDs, organizer edits, and published versions. It does not delete older standalone events or other local data. Use a fresh database for a combined-only catalog.

The owner-requested local cleanup on November 15, 2026 removed the two standalone Berkeley event records. Immediately after that cleanup the local catalog listed only Berkeley Omnium 2027; later historical seeds add their own examples. Riders open the Omnium to find BHRR and BSC. Both races and all 54 categories remain in the combined event. See [data behavior](../../DATA_MODEL.md#combined-berkeley-demo-seed).

The separate `seed:omnium` command and home-page loader still create an organizer draft with simulated capacity entries.
