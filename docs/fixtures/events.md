# Demo events

Status: Implemented standalone local demo fixtures. Updated November 14, 2026.

This file describes two simple, separate demo events: Berkeley Hills Road Race and Berkeley Streets Criterium. Each event contains one race on one day. The app does not read this Markdown file. The executable [standalone fixtures](../../src/shared/berkeleyEvents.ts) implement this reference; [SETUP.md](../../SETUP.md) explains how to seed and run them.

All entries and payments are simulated. Use fictional rider details only. The organizer supplied the prices below for demonstration purposes. Eligibility copied from Berkeley's working fixture remains draft configuration for review, not verified current federation rules.

Product requirements belong in [product.md](../../product.md). Delivery status belongs in [roadmap.md](../../roadmap.md). The [Berkeley Omnium fixture](../../src/shared/berkeleyOmnium.ts) provides the category reference. Its separate loader still creates a combined event; the standalone seed filters each race into its own event.

## Berkeley Hills Road Race

| Setting | Demo value |
|---|---|
| Event name | Berkeley Hills Road Race |
| Race count | One |
| Race day | Saturday, April 17, 2027 |
| Discipline | Road race |
| Venue | Bear Creek Road near Orinda, California |
| Time zone | America/Los_Angeles |
| Base entry price | $80.00 (`8000` cents) |
| Package | None; standalone event |

Use only the road-race categories from the Berkeley working fixture, with their structured eligibility, distance, start groups, and separate classifications. Display groups remain presentation only and create no capacity limits. The fixture's schedule uses 2026 race information dated for 2027; it is not an approved current schedule.

An eligible rider selecting one road-race category has a base entry total of **$80.00 before any fees or surcharges**. Registration creates one race entry, with no criterium entry or omnium nomination.

## Berkeley Streets Criterium

| Setting | Demo value |
|---|---|
| Event name | Berkeley Streets Criterium |
| Race count | One |
| Race day | Sunday, April 18, 2027 |
| Discipline | Criterium |
| Venue | Downtown Berkeley, California |
| Time zone | America/Los_Angeles |
| Base entry price | $60.00 (`6000` cents) |
| Package | None; standalone event |

Use only the criterium categories from the Berkeley working fixture, with their structured eligibility, race duration, start groups, field limits, and separate classifications. Do not assume these are identical to the road-race categories. The fixture's schedule uses 2026 race information dated for 2027; it is not an approved current schedule.

An eligible rider selecting one criterium category has a base entry total of **$60.00 before any fees or surcharges**. Registration creates one race entry, with no road-race entry or omnium nomination.

## Demo boundaries

These two events are independent. Each has its own event, race, day, category, and start-group identifiers. Capacity usage, registrations, and orders belong to the selected event.

The standalone fixtures configure no shared package, series, TT, podium nomination, or additional-entry discount. Fees and day-of surcharges are zero. Registration windows and the sample waiver are copied from the Berkeley working fixture, with demo mode enabled so testing can take place outside the windows. Seeding creates no prefilled entries and publishes both events once. Reruns preserve organizer edits and published versions. Other existing app fixtures and orders remain unchanged.
