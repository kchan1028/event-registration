# Wente Vineyards Classic Road Race

Status: Historical research case with a limited setup sample. Reviewed November 15, 2026. This is not an approved field matrix, official course, upcoming announcement, or participant study.

## Evidence and limits

The promoter's [BikeReg 2018 listing](https://www.bikereg.com/38137?nc=1) identifies the 31st annual road race on April 29, 2018 in Livermore, presented by VSRT and Livermore Cyclery. The accessible listing does not establish a complete category/start/distance table. Its promoter website was unavailable to the web reader and a direct registration-page request returned 403. Those limitations are not evidence of cancellation or permission to invent an official schedule. The unrelated Wente mountain-bike event and winery activities are not used as race evidence.

The [executable sample](../../../src/shared/regionalHistoricalEvents.ts) preserves only this event identity/date/place. Its three categories are explicitly synthetic: Open Cat 3/4, Women Pro/1/2/3, and Masters 35+ 3/4. They are not claimed as a sourced historical field list.

## Setup exercise

| Concept | Test configuration | Boundary |
|---|---|---|
| Event and race | One historical day and one road race | No associated criterium or weekend package invented |
| Starts | 09:00, 09:10, 09:20 | Synthetic, independent starts |
| Category lengths | 60, 45, 30 miles respectively | Test distances, not course reconstruction |
| Capacity | 60 riders per start, no category cap | Test limits, not participant counts |
| Price | $40 per entry, zero fees/surcharges/discounts | Not historical entry fees |
| Eligibility | Explicit license sets; annual licenses; adult-only or 35+ minimums | Draft test rules requiring organizer review |

Run `npm run seed:wente -- --owner organizer@example.test` using the app's local database. Open the published historical setup sample, inspect its notice and each category description, and confirm that the three independent starts and distance choices remain separate. A display group must not add capacity. Simulate registration using fictional details and the sample waiver. A paid order does not clear eligibility or licensing.

Edit a draft value and rerun the seed. The existing event ID, edit, and published version must remain intact, as must unrelated events. This sample exercises setup mechanics while preserving missing-source uncertainty; it is not a substitute for approved Wente race instructions.

## Verification

`tests/regional-historical-events.test.ts` checks schema/domain validation, three-category scope, references, quotes, review flags, empty publication, retained edits/versions on rerun, preservation of other demos, and concurrent seed safety. No browser walkthrough or organizer participant session is claimed.

## Open questions

Raised November 15, 2026. Owner: product owner, with event-organizer approval required before real reuse. Which dated Wente flyer supplies the intended edition's complete fields, shared starts, distances, course, caps, eligibility, fees, windows, and waiver? The synthetic table above is provisional, not approved historical data. Fictional setup and checkout testing can proceed; a full historical reproduction, approved template, and live event remain blocked. Revisit when the owner supplies an authoritative flyer or real reuse is proposed.
