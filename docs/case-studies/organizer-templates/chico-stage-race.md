# Chico Stage Race

Status: Historical research case with an explicit road-race/criterium component sample. Reviewed November 15, 2026. This is not a complete stage-race implementation or official admission flow.

## Source and full-event boundary

The organizer-authored [2018 technical guide](https://humanpoweredhealthcycling.com/wp-content/uploads/2018/03/2018-Chico-Stage-Racer-Tech-Guide.pdf), retained by a participating team, dates that edition March 16–18. It includes a circuit race, road race, time trial, and criterium, with category-dependent programs, cumulative-time standings, and progression rules. These source requirements cannot be replaced by two independent purchases and called a full stage race.

CycleReg lacks time-trial and circuit-race representation, individual TT start assignment, finish-dependent progression, and general-classification calculation. These are documented gaps, not relabeled races. No rosters, results, contact, waiver, or payment records are imported. A present-day event or cancellation status is not inferred from this historical guide.

## Explicit executable sample

The [fixture](../../../src/shared/regionalHistoricalEvents.ts) contains only Pro/1 and Women Pro/1/2/3 in the supported road and criterium components. The road component is dated March 17; both selected fields have a 90-mile total, starting at 08:00 for women and 09:30 for men. The March 18 criterium uses the selected men's 15:25/70-minute and women's 16:45/60-minute slots. These values come from guide pages 11 and 17, inspected as extracted text; a visual PDF review is not claimed.

The sample has two days, two races, four starts, and four categories. Other categories, the circuit race, time trial, kids activity, and official stage progression are omitted explicitly. $40 per component and a shared 60-rider cap are synthetic testing values, not the guide's stage-race admission price or complete-event limits. Annual-license adult eligibility is draft and requires review. No package or overall nomination is created.

## Organizer setup walkthrough

1. Run `npm run seed:chico -- --owner organizer@example.test` against the app's database. Confirm that the published title and notice say historical road/crit sample.
2. Inspect the two historical days and separate race/category references. Check distance versus duration and independently review each day's category eligibility.
3. Quote a fictional rider's matching road and criterium selections. The $80 test sum is not official stage-race registration and does not satisfy the omitted stages.
4. Complete only simulated checkout with the sample waiver. Preserve the difference between paid registration, licensing/organizer review, and eligibility to start a subsequent stage. The latter is not enforced as a result-dependent stage progression rule.
5. Edit and rerun the seed to verify ID, draft, publication, and unrelated-event preservation. Do not add a time trial as a road race merely to make the complete guide fit.

## Verification

The regional fixture/API tests verify the two supported disciplines, selected dates/start times/distances/durations, isolated references, review flags, synthetic quotes, empty publication, and preserved edits/versions on rerun. No full stage-race completion, GC, team admission, browser walkthrough, or participant study is claimed.

## Open questions

Raised November 15, 2026. Owner: product owner, with organizer/federation approval before real reuse. Which edition and categories should a complete Chico template cover, and what model should represent TT starts, circuit format, category-specific stage membership, one stage-race purchase, and progression? Approved current eligibility, caps, fees, windows, and waivers are also needed. The two-field/two-component selection and synthetic prices/caps are provisional. Historical research and fictional component testing can proceed; a complete executable stage race, approved template, and live registration remain blocked. Revisit when a current technical guide is provided or stage-race implementation is prioritized. Results calculation remains outside current product scope.
