# Mount Hamilton Classic Road Race

Status: Historical research case and executable full-course schedule demo. Reviewed November 15, 2026. Eligibility and operational rules remain draft; this is not an upcoming event or an approved current template.

## Sources and event boundary

The [2019 timing schedule](https://www.ontheday.net/2019/hamilton/schedule/) identifies May 26, nine starts, and 14 categories. The [San Jose Bicycle Club event page](https://teamsanjose.org/section/hamilton/) describes the 63.5-mile San Jose-to-Livermore route over Mount Hamilton. The club page discusses 2019 and must not be interpreted as a current schedule merely because it remains online.

The schedule contains shared masters starts and a women's start with three separately classified categories. The shorter Race to the Observatory has its own identity and program; this demo does not merge it into the full-course race or infer entry for beginner categories from that shorter event. Historical bib allocations are not field limits.

## Mapping and walkthrough

The [fixture](../../../src/shared/regionalHistoricalEvents.ts) creates one historical day, one road race, nine starts, and 14 registration categories. It uses the archived starts from 08:00 to 09:20, preserving separate classifications within four shared groups: masters 45+/55+ 1/2/3, the three women's categories, masters 35+/45+ Cat 3, and masters 35+/45+ Cat 4.

1. Run `npm run seed:mount-hamilton -- --owner organizer@example.test` against the app's database. Open the published historical demo and confirm the date, road-race identity, time zone, and 63.5-mile total.
2. Inspect each shared start. Multiple classification records must not become multiple races or independent start capacities. The women's start contains three independently purchasable categories with distinct codes.
3. Explain the synthetic shared 60-rider limit. A paper example of 35 distinct riders in one masters category leaves 25 shared places, not 60 more. Rider identity remains separate from classification tags.
4. Review the explicit test price of $40 and zero fees/surcharges. All structured eligibility is a draft interpretation: annual licenses, adult minimum age outside masters, labeled masters minimums, and no inferred dual scoring. Non-women fields use an unrestricted demo competition class pending approval.
5. Use fictional riders and simulated payment with the sample waiver. Payment does not establish license or organizer clearance. No operational feed-zone, support-vehicle, transport, or shorter-course admission workflow is created.
6. Edit a draft setting and rerun the seed. IDs, edits, published versions, and unrelated events must survive. Publish later edits explicitly.

## Verification and limits

The regional fixture tests check the nine sourced start times, 14-category matrix, three separate women's classifications under one start, distance without an invented lap count, schema/domain validation, $40 quotes, review flags, empty publication, and safe reruns. The course is descriptive; the app does not manage point-to-point transport or road closures. No participant or browser usability result is claimed.

## Open questions

Raised November 15, 2026. Owner: product owner, with organizer approval before real reuse. What current flyer establishes intended edition, course approval, caps, fees, structured eligibility/classification membership, windows, and waiver? The $40/60-rider rules and adult annual-license interpretation are provisional test assumptions. Historical schedule and fictional checkout testing can proceed; an approved reusable template or live event remains blocked. Revisit on receipt of a dated organizer guide or a proposed real event.
