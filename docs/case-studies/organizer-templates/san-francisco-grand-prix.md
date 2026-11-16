# San Francisco Grand Prix

Status: Historical research case with an executable local demo. Reviewed November 15, 2026. The product owner confirmed the historic Grand Prix, rather than Il Giro di San Francisco. This is not an upcoming race announcement, approved professional registration system, or participant usability study.

## Historical evidence and edition

The contemporary [Cyclingnews 2005 preview](https://autobus.cyclingnews.com/road/2005/sep05/sanfrangp05) identifies the September 4, 2005 edition, professional road-race field, and Embarcadero/Washington start and finish. It describes 108.1 miles using three short parade circuits, nine larger loops through the Fillmore and Taylor climbs, and five finishing loops through Taylor. These differing loops form one road race, not multiple purchasable races or a standard criterium lap count.

The [SFMTA ISCOTT minutes of August 11, 2005](https://archives.sfmta.com/cms/ciscott/documents/ISCOTT8-11-05min1138.pdf), item 1N on printed pages 5–6, corroborate the event date and affected streets. The listed street-closure windows are not a race-start schedule. The PDF's extracted title says April 30, 1999; its first page identifies the meeting as August 11, 2005. Use the document body, not the stale metadata.

No roster, rider result, contact, waiver, or payment records are copied. The fixture describes one men's professional simulation category; it does not claim to reproduce every activity or admission rule from that edition. Il Giro is a distinct event and is not used to fill gaps in this case.

## Mapping into CycleReg

| Concept | Demo representation | Evidence or boundary |
|---|---|---|
| Event/day | One event on September 4, 2005, America/Los_Angeles | Historical edition; no future date invented |
| Race | One road race | The city course does not turn it into a criterium |
| Length | 108.1 miles, lap count unset | Published total; differing loops remain in the course description |
| Start | One professional simulation start at 09:00 | Time is a test assumption, not inferred from street closures |
| Registration category | Men professional (simulation), separate classification code | Draft adult annual-license PRO eligibility; organizer review mandatory |
| Capacity | 60 riders at the start, no category cap | Test value, not a historical field limit |
| Price | $40, zero fees/surcharges, no package | Fictional local checkout value, not a published fee |
| Admission | Individual simulated checkout only | Team selection, invitations, roster accreditation, and professional admission are not implemented |

The [executable fixture](../../../src/shared/sanFranciscoGrandPrix.ts) preserves the historical date and distance. Its notice and category description expose the assumptions. No participants or simulated capacity entries are prefilled. Demo mode permits fictional testing outside registration windows, and the sample waiver is not official.

## Organizer setup walkthrough

1. Use the same local database as the app and run `npm run seed:sf-grand-prix -- --owner organizer@example.test`. Open the published historical demo from the rider event list, or sign in with that test email for organizer editing.
2. Confirm the historical name/date, time zone, road-race discipline, course, and 108.1-mile length. Do not use the sum of loop counts as a uniform lap length or create separate parade/long/short race entries. Operational route-segment modeling is not implemented.
3. Inspect the single start, separate category/classification, and 60-place test limit. The 09:00 time and capacity need approval before any real reuse.
4. Inspect the $40 test quote and sample waiver. Register only fictional riders using simulated payments. A confirmed payment does not establish invitation, professional admission, or race readiness; organizer and license reviews remain independent.
5. Edit a draft value, then rerun the loader. It must reuse the event ID and preserve the edit and existing published version. Berkeley and Burlingame remain intact.
6. Treat professional team admission as a research boundary. Do not add a payment button or category label that claims to perform roster approval. No live registration or upcoming event is created by this demo.

## Verification and limits

`tests/san-francisco-grand-prix.test.ts` checks schema/domain validation, historical edition, road-race discipline, total-distance representation without uniform laps, review flags, test pricing, empty publication, preserved edits on rerun, and coexistence with Berkeley and Burlingame. The other published-demo callers have targeted regression coverage. This is fixture/API verification, not a completed organizer browser walkthrough or participant study.

## Decisions and open questions

Identity resolved November 15, 2026 by the product owner: use the historic San Francisco Grand Prix with the Fillmore/Taylor climbs, not Il Giro di San Francisco.

Raised November 15, 2026. Owner: product owner, with event-organizer and federation approval required before real reuse. What source and approvals would establish race permission, professional team selection, roster admission, actual start time, caps, eligibility/license rules, fees, and official waivers for an intended edition? These are not settled by the preview or street-closure minutes. The time, price, cap, and adult annual-license PRO rule above are provisional demo assumptions, not approved historical rules. Historical research and fictional local checkout may proceed; actual professional admission, a live event, and an approved reusable template remain blocked. Revisit when an organizer supplies an authoritative technical guide or real reuse is proposed.
