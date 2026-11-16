# Red Kite series

Status: Historical research case with a deliberately limited executable criterium sample. Reviewed November 15, 2026. This is not a full-series implementation, approved template, upcoming calendar, or participant usability study.

## Historical sources and full-series boundary

The [2017 Red Kite Omnium information archive](https://www.ontheday.net/series/2017/red_kite/series_scoring/) lists 14 rounds between February 5 and September 2. Its calendar combines criteriums, circuit races, time trials, a hill-climb round, and a stage-race/omnium program. Individual and team standings, category-specific participation, primes, and special scoring rules belong to that historical competition. They do not establish a package price or a universal season-pass entitlement.

CycleReg currently supports road-race and criterium disciplines, up to seven days in one event, and event-local purchases. The full source series therefore does not fit the current model. Do not truncate it silently, relabel time trials/circuit races as criteriums, or claim that checkout computes series standings. Full-series modeling remains unresolved. No athlete, team, license-number, result, waiver, or payment records are copied.

## Explicit scope of the executable sample

The demo is named **Red Kite Series (historical criterium sample)**. It includes only these three sourced rounds inside one demo event so riders can open it to find each round:

| Round | Historical date | Source |
|---|---|---|
| Red Kite #2: Criterium | March 19, 2017 | [Round #2 schedule](https://www.ontheday.net/2017/redkite_2/schedule/) |
| Red Kite #5: Criterium | April 23, 2017 | [Round #5 schedule](https://www.ontheday.net/2017/redkite_5/schedule/) |
| Red Kite #9: Criterium | July 9, 2017 | [Round #9 schedule](https://www.ontheday.net/2017/redkite_9/schedule/) |

Each reviewed schedule has 11 starts and 14 separately classified categories. Women Cat 3 and Women Cat 4/5 share the opening start; Masters 45+ and 55+ share starts within the 3/4 and 1/2/3 programs. Separate classifications must survive shared starts. The selected rounds use the same start-time sequence; this does not imply that other Red Kite rounds share their program. Historical bib allocations differ across these schedules and are not imported as field limits or reusable bib policy.

The [fixture](../../../src/shared/redKiteSeries.ts) creates three days, three criterium races, 33 starts, and 42 categories with independent IDs and references per round. The display grouping creates no capacity. The sample contains no time trial, circuit race, hill climb, stage race, package, series pass, overall nomination, scoring, or standings.

## Explicit demo assumptions

- $40 per category entry, zero fees, surcharges, and discounts. One entry in each included round totals $120; this is a sum of test prices, not an approved series package.
- A shared 60-rider limit at each start, no independent category caps, and synthetic 30-minute race durations. These are not historical limits or durations.
- Structured eligibility uses explicit draft license sets, annual licenses, an adult-only minimum age of 18 outside masters, and the labeled masters minimum ages. Women's fields use the women's competition class; the other fields use an unrestricted demo competition class pending approval. The selected age bands do not infer double scoring.
- Every category requires organizer eligibility review. Payment and readiness remain independent. Demo mode permits fictional checkout outside historical registration windows.
- Venue/course details require organizer confirmation. The notice does not invent a precise address, official course, or future edition. The shared sample waiver is not an official waiver.
- No rider or simulated capacity entries are prefilled. All payments and rider details must be fictional.

## Organizer setup walkthrough

1. Run `npm run seed:red-kite -- --owner organizer@example.test` against the app's local database. Open the published sample in the rider event list; sign in with that test email for organizer editing.
2. Confirm that the title and notice say three-round historical sample. Inspect the three dates and separate race IDs. The other 11 source rounds are not silently represented by these three days.
3. For each round, inspect the three shared starts: women's 3 and 4/5, masters 45+/55+ 3/4, and masters 45+/55+ 1/2/3. Keep two category/classification records in each shared start.
4. Review capacity independently per round. In a paper exercise, 35 distinct riders in one masters category leave 25 places in its shared start. They do not consume places in another round. A shared display heading does not create a limit.
5. Quote one eligible entry per included round and explain the $120 test total. Do not describe it as a season pass or assume it grants overall qualification. Eligibility must be checked separately for each selection.
6. Complete only fictional simulated checkout. License and organizer review must remain visible; a confirmed payment cannot approve race readiness or calculate overall points.
7. Edit a draft setting and rerun the seed. It must preserve the event ID, edit, published version, and other local demos. Publishing later edits remains explicit.
8. Review the full-series gaps below before proposing a production template. Copying the first round into all 14 source rounds would lose format and participation differences.

## Verification and limits

`tests/red-kite-series.test.ts` verifies schema/domain validation, historical dates, per-round references and start times, shared-start classification separation, independent per-round capacity membership, the $120 test quote without a bundle, organizer review flags, empty publication, retained edits/versions on rerun, and preservation of unrelated demos. These are fixture/API checks, not a browser walkthrough, season-scoring implementation, or organizer usability result.

## Open questions

Raised November 15, 2026. Owner: product owner, with event-organizer approval needed before real reuse. Which edition and rounds should a complete Red Kite setup cover, and what approved category-by-round matrix, course, eligibility, limits, durations, fees, registration windows, and participation rules apply? Should the full series use linked standalone events or an expanded event model? The current seven-day limit, unsupported formats, cross-event purchase, and any approved overall-participation mappings need explicit design decisions. Scoring/results remain outside the product scope. The three-round selection and its test assumptions above are provisional, not approval of a full-series template. Historical research and fictional sample testing can proceed; a full executable series, real registration, and approved template remain blocked. Revisit when an organizer provides a dated technical guide or full-series implementation is prioritized.
