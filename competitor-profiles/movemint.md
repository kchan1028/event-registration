# Movemint feature comparison

Reviewed November 14, 2026. Scope: event registration, purchases, communications, reporting, series passes, and participant race-day operations. Volunteer recruitment, staffing, shifts, and volunteer-management functions are excluded. Participant check-in remains in scope regardless of who operates the desk.

This compares official public documentation with CycleReg's current implementation and the expanded Planned requirements in [feature.md](../feature.md), [product.md](../product.md), and [roadmap.md](../roadmap.md). It is not a hands-on Movemint test, a verified parity claim, or a new roadmap. This research snapshot preceded the subsequent participant-management, automatic/bulk bib, and credit/deferral requirements; consult product.md and roadmap.md for the approved current plan. Some documentation pages returned empty content to direct fetches; the research snapshot retains the official-domain indexed text used. No participant records or signed waivers were opened.

## Feature comparison

| Area | Movemint documents | CycleReg implemented | CycleReg planned / gap |
|---|---|---|---|
| Payments and payouts | Stripe-powered accounts and payout schedules [1]; full/partial refunds [2] | Simulated payments; no provider account or integration | Stripe selected; Checkout, refunds, reconciliation, merchant/settlement model still Planned |
| Series passes | One purchase registers into selected sub-events across events; price tiers, sales cap, registration windows, individual-event registration alongside passes [3] | Same-event package pricing only | Multi-event and multi-organization passes Planned; no working series-pass builder |
| Pass lifecycle | Locks included sub-events after first sale; organizer pass transfers, holder removal, CSV export, and series duplication [3] | Accepted quotes/version snapshots; no pass lifecycle tools | Our plan preserves accepted rules but lacks detailed requirements for pass-level caps, full/partial pass variants, duplication, upgrade/downgrade, and discoverability |
| Rider changes | Rider-to-rider transfer with organizer permission; recipients supply their own details; series-pass holders contact organizer [4] | Organizer category transfers/withdrawals | Authenticated rider self-service Planned; pass-specific transfer policy still needs definition |
| Deferrals and credit | Athlete help lists deferral and sub-event changes [5]; groups support multi-event discounts and credits [6] | No credit balance or deferral workflow | Core self-service and coupons Planned; reusable credit/deferral rules not fully specified |
| Communications | Scheduled transactional/marketing emails scoped to event/group audiences [7]; SMS is a listed paid option [8] | No delivery service | Transactional and targeted operational email Planned; SMS and richer campaign automation are not defined commitments |
| Participant management | Cross-event CRM, history, saved views, exports, and saved audiences with Google Sheets output [9][10] | Event-specific registrations and lookup | Reusable identity, scoped reporting, cross-event search Planned; reusable audience/Sheets workflows not specified |
| Reporting | Event/date-filtered dashboards, signup and traffic reports, source/UTM and funnel views [11][12] | Start lists, snapshots, sample CSV | Operational/finance and history reporting Planned; marketing funnel and attribution reporting not specified |
| Race-day registration | Dedicated on-site registration, payment, day-of price, bib/check-in handoff; manual addition for alternative payment methods [13] | Check-in, bibs, printable fallback roster | Walk-up/mobile/kiosk registration Planned; non-card recording requires a separate approved workflow |
| Bib assignment | Automatic-on-registration and bulk assignment by participant ordering [18] | Check-in-time assignment, ranges, collision protection, and history | Automatic advance/bulk allocation is not specified as an implemented feature |
| Permissions | Per-event invitations, owner/admin/assistant/timer roles and ownership transfer [14] | No sign-in or role enforcement | MFA accounts and role-isolated data access Planned |
| Forms and add-ons | Required/optional and conditional questions; merchandise [15][5] | Structured category eligibility and one sample event waiver | Custom questions already required but unbuilt; merchandise and detailed conditional-form workflow not fully specified |
| Tax and protection | Published pricing describes tax collection/remittance and optional add-ons [8]; separate refund-protection documentation calls that program a refund program, not insurance [16] | No tax or protection integration | Tax responsibility must be settled with payments; automated tax service and protection products are not selected |
| Timer/results integration | Participant exports, RACE RESULT synchronization, CSV/PDF result uploads [5] | Sample start-list CSV and snapshots | Accepted timer round trip Planned; results publishing/scoring excluded from initial scope |
| Event discovery/presentation | Group home for events/series/merchandise [6]; public event-page controls and copying [17] | Local published-event list, draft templates | Public discovery deferred; rich public pages and complete season/group discovery not implemented |
| Guest registration | Pricing page says an athlete account is not required to register [8] | Local simulated checkout without accounts | Product requires MFA for every account sign-in; authenticated self-service is Planned. Guest live checkout needs an explicit decision, not an assumed requirement to copy |

## Important limits of the comparison

Movemint's series guide requires the builder to manage the component events. The reviewed series/group pages do not establish revenue splitting among legally independent organizers, approval contracts, or financial isolation for one multi-organization purchase. Our season-pass requirement is therefore broader than the documented multi-event example; it is not an observed advantage until implemented and tested.

No reviewed page establishes a dedicated road omnium/stage-race setup wizard, structured federation eligibility equivalent to CycleReg's paths, shared-start capacity counted once per rider, or automatic overall-award eligibility. These are not observed, not proven absent. No current USAC integration or stage-results-scoring claim is made here.

CycleReg's implemented category model is deliberately cycling-specific. Whether that reduces organizer work compared with Movemint is a hypothesis requiring an approved schedule and user testing. Many items in CycleReg's current feature list are Planned, so matching the list does not establish operational parity.

## Implications for our plan

The core gaps already have requirements: Stripe, self-service, communications, reporting, race-day registration, competition setup, and season passes. This review does not change their phase order.

Candidate requirement refinements, not approvals to build:

- Pass sales caps separate from component capacity; several fixed pass variants; visible included races; copy-next-season; reviewed upgrades/downgrades; immutable sold-pass membership.
- Explicit deferral and reusable-credit policy, including expiry, financial liability, and allowed organizations.
- Saved reporting audiences and reusable exports; scheduled communications and SMS only if operational research justifies them.
- Conditional questions and add-on purchase/fulfillment requirements if needed for cycling event registration.

Keep results publishing, GPS/Strava tools, fundraising, broad multi-sport support, international payments, and protection products outside the current cycling registration scope unless separately approved. Volunteer-management features are excluded from this comparison at the user's request.

## Sources

All reviewed November 14, 2026. Official documentation claims, not live product verification.

1. [Financials](https://docs.movemint.cc/organizer-dashboard/financials)
2. [Issuing refunds](https://docs.movemint.cc/organizers/managing-participants/refund-a-participant)
3. [Series passes](https://docs.movemint.cc/organizers/event-setup/series), updated October 16, 2026
4. [Transfer your registration](https://docs.movemint.cc/athletes/registrations/transfer-your-registration)
5. [Athlete help](https://docs.movemint.cc/athletes/athlete-docs) and [organizer FAQ](https://docs.movemint.cc/organizers/resources/faqs)
6. [Event groups](https://docs.movemint.cc/organizers/event-setup/groups)
7. [Sending emails](https://docs.movemint.cc/organizer-dashboard/communications-hub/email)
8. [Event hosting fees](https://docs.movemint.cc/resources/pricing)
9. [Using your CRM](https://docs.movemint.cc/organizers/managing-participants/crm)
10. [Saved audiences](https://docs.movemint.cc/organizers/comms-marketing/audiences)
11. [Organizer dashboard](https://docs.movemint.cc/organizers/data-tools/organizer-dashboard)
12. [Transactions](https://docs.movemint.cc/organizers/data-tools/organizer-dashboard/transactions) and [traffic reporting](https://docs.movemint.cc/organizers/data-tools/organizer-dashboard/on-platform)
13. [Event-day registration](https://docs.movemint.cc/organizers/pre-race-event-day/event-day-registration)
14. [Admin roles and access](https://docs.movemint.cc/organizers/event-setup/admin-roles), updated October 17, 2026; older role tables differ, so confirm exact permissions in a trial
15. [Creating questions](https://docs.movemint.cc/organizers/setting-up-your-event/registration/questions)
16. [How refund protection works](https://docs.movemint.cc/organizers/premium-add-ons/how-refund-protection-works)
17. [Event admin](https://docs.movemint.cc/organizers/event-setup/event-admin)
18. [Bib assignment](https://docs.movemint.cc/organizers/pre-race-event-day/bib-assignment)

Raw official-domain research responses: [research.json](raw/movemint/2026-11-14/research.json) and [event-day.json](raw/movemint/2026-11-14/event-day.json). SEO, traffic size, pricing arithmetic, and market-share comparisons were not assessed.
