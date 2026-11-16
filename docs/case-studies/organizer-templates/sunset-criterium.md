# San Rafael Sunset Criterium

Status: Historical research case with a limited geared-race demo. Reviewed November 15, 2026. “Sunset Criterium” is interpreted as the San Rafael event in this Northern California case-study set, not Redlands' Sunset Road Race.

## Historical evidence

The [Marin County Bicycle Coalition announcement of July 20, 2017](https://marinbike.org/news/sunset-criterium-rolls-into-san-rafael-on-july-29th/) describes the July 29 downtown San Rafael program. Amateur racing begins at 13:30, with Pro Women at 19:00 and Pro Men at 20:15. The published program also includes a kids ride and fixed-gear race. Those activities are not interchangeable with ordinary geared race registration.

The [NCNCA 2023 event entry](https://ncnca.org/event/san-rafael-sunset-criterium-2/) records cancellation/postponement of that later edition. It does not establish the current edition's status or validate a future calendar. This demo deliberately uses 2017 and makes no upcoming-event claim.

## Executable scope and assumptions

The [fixture](../../../src/shared/regionalHistoricalEvents.ts) creates one day, one criterium, and three starts/categories. The 13:30 amateur slot has one explicitly synthetic Open Cat 3/4/5 test field because the full amateur matrix was not established. The professional slots use draft license sets and competition classes, not verified admission rules.

All categories use synthetic 40-minute durations, $40 entries, shared 60-rider limits, annual licenses, and adult minimum ages. Fees/surcharges are zero. Organizer and license review remain necessary, and payment is simulated. There is no kids registration, fixed-gear equipment enforcement, special race admission, series pass, or championship approval in this sample. No participants or results are seeded.

## Organizer setup walkthrough

1. Run `npm run seed:sunset -- --owner organizer@example.test` with the app's database. Confirm the published historical geared-sample title, 2017 date, venue, and evening start times.
2. Inspect the three independent starts and classification codes. Do not treat the single amateur test field as the historical full amateur program.
3. Explain which slots come from the announcement and which durations, eligibility, caps, and prices are invented for testing. The gap before the professional races is preserved; it is not filled with purchasable kids or fixed-gear entries.
4. Complete only fictional simulated checkout using the sample waiver. A paid order does not clear professional admission or license review.
5. Edit the draft and rerun the seed. IDs, edits, published versions, and other events must remain intact. No new annual edition is created implicitly.

## Verification

The regional tests verify the 2017 date, criterium identity, three program slots, declared omissions, reference integrity, synthetic quotes, review flags, empty publication, and safe reruns. Night-time accessibility and an actual organizer/browser walkthrough remain unverified.

## Open questions

Raised November 15, 2026. Owner: product owner, with organizer approval before real reuse. Confirm San Rafael if a different Sunset event was intended. Which dated flyer supplies the full amateur/pro field matrix, durations, equipment/admission rules, fees, caps, windows, and official waiver? Kids and fixed-gear registration need an explicit scope/model decision. Identity interpretation and synthetic test rules above are provisional. Historical research and fictional geared-race testing can proceed; a complete event reproduction, approved template, and live event remain blocked. Revisit if the owner names a different event, provides an authoritative flyer, or proposes real reuse.
