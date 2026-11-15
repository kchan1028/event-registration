# Feature overview

Status: Local prototype. Updated November 14, 2026.

CycleReg helps organizers configure road races and criteriums, lets riders try registration with simulated payment, and supports local check-in and sample start lists. It is not ready for live registration: sign-in, real payments, and federation connections are not built.

This is a feature summary, not a second requirements document or roadmap. [product.md](product.md) defines requirements and acceptance criteria. [roadmap.md](roadmap.md) owns delivery status, priorities, dependencies, and verification evidence. “Implemented” below means available in the local prototype; it does not mean approved for a live event or verified with users.

## Organizer features

| Feature | Status | What it does |
|---|---|---|
| Event setup | Implemented | Create organizations and draft road race, criterium, or two-day weekend events |
| Category builder | Implemented | Create, edit, duplicate, reorder, and archive registration categories |
| Structured eligibility | Implemented | Check independent age, license, competition-class, and collegiate constraints; unknown information requires review |
| Starts and classifications | Implemented | Configure shared starts while retaining separate scoring classifications |
| Capacity rules | Implemented | Enforce category caps, start-group limits, and explicit shared pools; display headers never create limits |
| Pricing and discounts | Implemented | Configure base prices, scheduled changes, day-of surcharges, bundles, extra-entry pricing, and demo fees |
| Registration windows | Implemented | Enforce opening and closing times in the event's time zone; clearly labeled demo mode can bypass windows |
| Schedule CSV | Implemented | Import categories with column mapping and row errors; export the configured schedule |
| Preview and publish | Implemented | Preview eligibility, block publishing on errors, acknowledge warnings, and retain immutable published versions |
| Published change-impact preview | Implemented | Show affected categories, entries, riders, and orders; require acknowledgement while preserving accepted prices and rules |
| Organizer-managed waitlists | Implemented | Enable per category, give waiting riders priority, and issue 24-hour reservation links; delivery and payment remain simulated/manual |
| Organizer transfers and withdrawals | Implemented | Change paid entries with a reason and renewed eligibility/capacity checks; preserve the order total and log price differences for settlement outside the app |
| Draft autosave | Implemented | Save locally with stale-save protection |
| Registration queue | Implemented | Review simulated orders, outstanding readiness items, and manual license-review notes |

Details and limits: [category builder](product.md#1a-road-race-and-criterium-category-builder--p0) and [organizer prototype status](roadmap.md#category-builder-milestone).

## Rider features

| Feature | Status | What it does |
|---|---|---|
| Browse published events | Implemented | View events and their race schedules |
| Choose entries | Implemented | Select eligible categories, see capacity and review requirements, and receive schedule-conflict warnings |
| Order pricing | Implemented | Show entries, discounts, and configured fees before simulated payment; prevent discount stacking |
| Rider and guardian details | Implemented | Enter fictional rider details once per order, with guardian details for minors |
| Sample waiver | Implemented | Confirm reading and sign a versioned sample waiver; it is not an official federation waiver |
| Capacity reservation | Implemented | Hold all selected places together; an incomplete bundle is not sold silently |
| Simulated payment | Implemented | Exercise success, decline, retry, and duplicate notifications without charging money or collecting card details |
| Confirmation and receipt | Implemented | Show a demo receipt, check-in code, entries, and independent readiness items; payment does not clear an unreviewed license |

Details: [demo purchase flow](product.md#2a-clickable-demo-purchase-flow--phase-1) and [checkout status](roadmap.md#rider-checkout-prototype). Usability testing with people remains open.

## Race-day features

| Feature | Status | What it does |
|---|---|---|
| Rider lookup | Implemented | Search fictional registrations by name, team, bib, or check-in code |
| Ready or blocked check-in | Implemented | Show outstanding requirements before check-in; repeated check-in is safe |
| Bib assignment | Implemented | Assign bibs by event or day, prevent active collisions, and retain change history |
| Start lists | Implemented | List confirmed entries by race, with numbered snapshots and changes between versions |
| Sample timer CSV | Implemented | Export stable entry identifiers and race data; the format is not yet agreed or round-tripped with a timer |

Details: [check-in status](roadmap.md#check-in-prototype) and [start-list status](roadmap.md#start-lists-and-timer-export). Volunteer usability tests and a timer-approved export remain open.

## Local demo and interface

- Standalone Berkeley Hills Road Race ($80) and Berkeley Streets Criterium ($60) seeds are implemented. Each event has its own categories and no package, fees, surcharges, or prefilled registrations. See [SETUP.md](SETUP.md) and [demo events](docs/fixtures/events.md).
- The separate Berkeley Omnium fixture includes a $130 two-race package and a podium nomination requiring organizer review. Award approval tools, points, and podium calculation are not built.
- Light and dark themes are implemented, with system preference, a visible toggle, and a saved device preference.
- Automated accessibility checks cover main screens in both themes. Manual keyboard, screen-reader, and real-phone passes remain open. See [ACCESSIBILITY.md](ACCESSIBILITY.md).
- Data is stored in a local SQLite file. No database server is needed. There is no sign-in, so the prototype must stay on localhost and use fictional rider details. See [DATA_MODEL.md](DATA_MODEL.md).

## Planned features

These are not available in the prototype. Phase order and dependencies remain in [roadmap.md](roadmap.md).

| Feature | Status | Requirement reference |
|---|---|---|
| Accounts, MFA, and organizer roles | Planned | [Sign-in and account security](product.md#sign-in-and-account-security) |
| Real payments, refunds, payouts, and reconciliation | Planned | [Money and reporting](product.md#6-money-and-reporting) |
| Federation license and waiver verification | Planned; access and approval required | [Future USA Cycling integration](product.md#future-usa-cycling-waiver-and-license-integration) |
| Guided resolution of published changes and rider-initiated change requests | Planned | [Changes after registration opens](product.md#changes-after-registration-opens) |
| Automated waitlist promotion and offer-email delivery | Planned | [Capacity and entry integrity](product.md#3-capacity-and-entry-integrity) |
| QR scanning, printable roster, and agreed timer export | Planned | [Race-day operations](product.md#5-race-day-operations) |
| Three-day TT / road race / criterium demo series | Planned specification only | [Planned three-day series demo](product.md#planned-three-day-series-demo) |

Timing hardware, omnium points/results scoring, and full offline synchronization are outside the initial scope. See [scope boundaries](product.md#out-of-scope-initially).
