# Burlingame Criterium

Status: Historical research case with an executable local demo. Reviewed November 15, 2026. This is not an upcoming race announcement, an approved template, or a participant usability study.

## Sources and edition

[Pen Velo's event page](https://penvelo.org/burlingame-criterium/) currently lists the event as on hiatus following road construction and reconfiguration. The [2017 OnTheDay event archive](https://www.ontheday.net/2017/burlingame/) supplies the June 25, 2017 start program and separate masters podium groupings below. The archive is historical timing evidence, not a complete registration rulebook. Only event structure was used; no rider, result, contact, waiver, or payment records are imported into the fixture.

| Historical start | Field | Demo registration categories |
|---|---|---|
| 07:00 | Men Elite 4 | One |
| 07:50 | Women 3/4 | One |
| 08:40 | Men Elite 3 | One |
| 09:35 | Men 35/45+ 3/4 | Separate 35+ and 45+ |
| 12:00 | Women Pro 1/2/3 | One |
| 13:00 | Men 35/45+ 1/2/3 | Separate 35+ and 45+ |
| 14:00 | Men Pro/1/2 | One |

The historical program has a midmorning gap. The fixture preserves that gap without adding an unsupported purchasable activity. One event contains one day and one criterium, seven starts, and nine categories. Two masters categories share each masters start while retaining separate classification codes.

## Demo assumptions, not historical rules

The executable [fixture](../../../src/shared/burlingame.ts) keeps the historical date and uses America/Los_Angeles time. Its name and notice identify it as a historical demo; it does not manufacture a future edition.

- Every category costs **$40**, with zero fees, surcharges, packages, and extra-entry discounts. These are test values, not sourced entry fees.
- Each start has a **60-rider shared limit**, with no independent category cap. This is a capacity-testing value, not a historical field limit.
- Structured eligibility is an explicit draft interpretation of the labels. The demo uses annual licenses, the listed license categories and competition class, minimum ages 35/45 for masters, and an adult-only minimum age of 18 elsewhere. No automatic dual age-group classification is inferred.
- Every category requires organizer eligibility review. Payment alone does not clear the rider. Race durations are set to 40 minutes solely for testing; historical durations were not established by the reviewed schedule.
- Registration-window bypass and the shared sample waiver support local fictional checkout. The waiver is not official. No rider or simulated capacity entries are prefilled.

## Organizer setup walkthrough

1. Run `npm run seed:burlingame -- --owner organizer@example.test` against the same local database used by the app. It creates and publishes the labeled historical demo once. Sign in with that test email to edit it.
2. Open the organizer event and confirm the historical date, time zone, demo notice, and single-race structure. Keep Berkeley as its own event.
3. Review the seven starts and their schedule. At each masters start, verify the two registration categories point to the same start but have distinct classification codes.
4. Inspect the shared field limit. For a paper capacity exercise, 35 distinct riders in one masters category leave 25 places for the other, not another 60. Display grouping never creates a cap.
5. Inspect the $40 test quote and sample waiver. Register only fictional riders through simulated payment; a paid order must still require eligibility/license review.
6. For a setup rehearsal, edit a draft value and rerun the seed. The event ID, edit, and existing published version must remain unchanged; publication of later edits stays an explicit organizer action.
7. Before any real reuse, obtain an approved edition, schedule, eligibility, capacities, fees, durations, and event permission. This demo does not make an event ready for launch.

## Verification and limits

`tests/burlingame.test.ts` checks fixture validation, historical start times, separate masters classifications, test pricing, review flags, empty publication, safe reruns, retained edits, and preservation of the Berkeley catalog. `tests/berkeley-events.test.ts` exercises the other caller of the shared published-demo loader. These are automated setup checks, not observations of an organizer using the interface. No browser walkthrough or participant session is claimed.

## Open questions

Raised November 15, 2026. Owner: product owner, with approval needed from the event organizer before real reuse. Which edition, race permission, durations, prices, field limits, age/classification membership, and license rules would be approved for a future event? The reviewed historical schedule does not settle them. Provisional assumptions are listed above and are not approved event rules. Historical research and fictional local testing can proceed; a real event or approved reusable template remains blocked. Revisit when an organizer supplies a current flyer or a real reuse is proposed. Do not treat the hiatus as permission to announce a replacement event.
