# Feature overview

Status: Local build, not live. Updated November 15, 2026.

CycleReg helps organizers configure road races and criteriums, lets riders try registration with simulated payment, and supports local check-in and sample start lists. It is not ready for live registration: multi-factor sign-in, real payments, and federation connections are not built. Passwordless email sign-in with organizations and organizer roles is built (Phase 2).

This is a feature summary, not a second requirements document or roadmap. [product.md](product.md) defines requirements and acceptance criteria. [roadmap.md](roadmap.md) owns delivery status, priorities, dependencies, and verification evidence. “Implemented” below means available in the local build; it does not mean approved for a live event or verified with users.

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
| Passwordless sign-in and organization roles | Implemented locally | Require email sign-in before checkout or organizer tools; enforce owner, registration manager, check-in, timer/export, and finance access on the server. Real Clerk development-instance verification remains open |
| Schedule CSV | Implemented | Import categories with column mapping and row errors; export the configured schedule |
| Preview and publish | Implemented | Preview eligibility, block publishing on errors, acknowledge warnings, and retain immutable published versions |
| Published change-impact preview | Implemented | Show affected categories, entries, riders, and orders; require acknowledgement while preserving accepted prices and rules |
| Organizer-managed waitlists | Implemented | Enable per category, give waiting riders priority, and issue 24-hour reservation links; delivery and payment remain simulated/manual |
| Organizer transfers and withdrawals | Implemented | Change paid entries with a reason and renewed eligibility/capacity checks; preserve the order total and log price differences for settlement outside the app |
| Draft autosave | Implemented | Save locally with stale-save protection |
| Registration queue | Implemented | Review simulated orders, outstanding readiness items, and manual license-review notes |
| Registration lookup and corrections | Implemented | Find registrations by rider, guardian, email, team, order, or check-in code; preserve reasoned before/after correction history. Recording the signed-in actor remains Planned |
| Basic coupons | Implemented | Configure event-scoped fixed or percentage codes with windows, category eligibility, and atomic total redemption caps; per-rider limits and combinability remain Planned |
| Published-change resolution | Implemented | Resolve affected paid entries through organizer transfer, withdrawal, or unchanged acceptance while preserving accepted prices and an append-only history |
| Same-rider linking | Implemented | Suggest likely matches across orders; link only when the organizer confirms |
| Entries and ledger CSV | Implemented | Download one row per entry and a simulated ledger; contact, emergency, and license-number details are left out |

Details and limits: [category builder](product.md#1a-road-race-and-criterium-category-builder--p0) and [organizer status](roadmap.md#category-builder-milestone).

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

Details: [demo purchase flow](product.md#2a-clickable-demo-purchase-flow--phase-1) and [checkout status](roadmap.md#rider-checkout). Usability testing with people remains open.

## Race-day features

| Feature | Status | What it does |
|---|---|---|
| Rider lookup | Implemented | Search fictional registrations by name, team, bib, or check-in code |
| Ready or blocked check-in | Implemented | Show outstanding requirements before check-in; repeated check-in is safe; undo requires a reason and retains history |
| QR check-in scanning | Implemented locally | Scan the confirmation QR code in Chrome or Edge and use the same repeat-safe check-in path; live camera and volunteer rehearsal remain open |
| Bib assignment | Implemented | Assign bibs by event or day, prevent active collisions, and retain change history |
| Printable fallback roster | Implemented | Print a race-day roster and blocked-rider checklist without private contact or payment details; real-printer and rehearsal checks remain open |
| Start lists | Implemented | List confirmed entries by race, with numbered snapshots and changes between versions |
| Sample timer CSV | Implemented | Export stable entry identifiers and race data; the format is not yet agreed or round-tripped with a timer |

Details: [check-in status](roadmap.md#check-in) and [start-list status](roadmap.md#start-lists-and-timer-export). Volunteer usability tests and a timer-approved export remain open.

## Local demo and interface

- A deterministic generated collection covers a single-day criterium, shared-field road race, two-day omnium, empty draft, and 120-category large event. It includes 1,000 simulated capacity entries and success, duplicate, decline/retry, expiry, and license-review states. Individual/full loaders and a collection-only reset are implemented and tested. See [fixture documentation](docs/fixtures/README.md#generated-race-case-studies).
- Standalone Berkeley Hills Road Race ($80) and Berkeley Streets Criterium ($60) seeds are implemented. Each event has its own categories and no package, fees, surcharges, or prefilled registrations. See [SETUP.md](SETUP.md) and [demo events](docs/fixtures/events.md).
- The separate Berkeley Omnium fixture includes a $130 two-race package and a podium nomination requiring organizer review. Award approval tools, points, and podium calculation are not built.
- Light and dark themes are implemented, with system preference, a visible toggle, and a saved device preference.
- Automated accessibility checks cover main screens in both themes. Manual keyboard, screen-reader, and real-phone passes remain open. See [ACCESSIBILITY.md](ACCESSIBILITY.md).
- Data is stored in a local PostgreSQL database (a Docker container on the developer's computer, per [ADR 0004](docs/decisions/0004-hosted-stack-and-database.md)). Nothing is hosted. Every organizer page and checkout requires passwordless email sign-in (Clerk), and roles limit each person to their organization's tools. MFA is not built, so use fictional rider details only. See [DATA_MODEL.md](DATA_MODEL.md).

## Package and bundle terminology

An event package contains entries in several races within one event, such as an omnium or stage race. A Planned bundle / season pass spans selected events and can include different organizations. The current UI and schema call same-event packages “bundles”; they do not support season passes. No implementation or database migration is implied by this terminology change.

## Berkeley weekend expert review

Status: Expert review, November 14, 2026; no participant results or official Berkeley partnership. The [code-based case study](docs/usability/pilot-run-2026-11-14.md#berkeley-weekend-case-study-code-based-expert-review) traces organizer setup, both-day entry, a second criterium category, a parent/junior, full capacity, and blocked check-in. The [initial study](docs/usability/README.md#berkeley-weekend-initial-round) is Planned.

| Capability | Current limitation or gap |
|---|---|
| $130 same-event weekend package; $20 additional criterium entry | Pre-race demo example is $150 for road + two nonconflicting criterium categories, with separate package/extra-entry reductions. Package pricing is automatic; the intent checkbox only helps browser completeness. Separate-event packages/season passes are not supported. |
| Structured eligibility and schedule checks | Self-reported match is not license verification. Same-start/overlap blocks; short recovery warns. Draft source rules, road start/staging assumptions, and unset road field limits need organizer/official review. |
| Junior guardian flow | Guardian details and signature are required for racing age 18 or under in every category. This is Implemented locally; federation acceptance of the age convention and guardian workflow remains open. |
| Atomic holds, retries, full-category handling, waitlists | Local transactions and simulated payment only; no real Stripe settlement or automated offer delivery. Organizer-confirmed rider linking works after orders exist, but checkout cannot safely assume two separate orders are the same rider when enforcing capacity. |
| Independent readiness and blocked bib issuance | Unreviewed license can remain outstanding after simulated payment. New checkout requires the sample waiver, so missing-waiver desk resolution cannot be rehearsed end-to-end with ordinary checkout; accepted electronic/paper workflow is still required. |
| Responsive themes and error recovery | Automated checks are not participant evidence. Manual keyboard, screen-reader, real-phone, recovery, and sunlight checks remain open. Liquid Glass is Planned and must keep forms, prices, and tables opaque under [DESIGN.md](DESIGN.md). |

Priorities and measurable gates belong in the [roadmap](roadmap.md#berkeley-weekend-review-priorities), and requirements in the [product acceptance criteria](product.md#berkeley-weekend-acceptance-criteria). USAC platform/waiver acceptance, license access or accepted manual fallback, and real payment operations are external dependencies, not features enabled by the demo.

## Planned features

These are not available in the app. Phase order and dependencies remain in [roadmap.md](roadmap.md).

| Feature | Status | Requirement reference |
|---|---|---|
| Reusable organizer templates: event formats, category presets, guided starts, and saved setups | Planned enhancement; current format templates are structural only | [Organizer templates](product.md#reusable-organizer-templates); [six research cases](docs/case-studies/organizer-templates/README.md) |
| Multi-factor authentication for organizer roles (passkey or authenticator app) | Planned (Phase 3); required before the live pilot, before any real rider data or live payments. Riders and guardians keep email sign-in only | [Sign-in and account security](product.md#sign-in-and-account-security) |
| Stripe hosted Checkout, refunds, payouts, and reconciliation | Planned; Stripe selected, operating model pending | [Money and reporting](product.md#6-money-and-reporting) |
| Federation license and waiver verification | Planned; access and approval required | [Future USA Cycling integration](product.md#future-usa-cycling-waiver-and-license-integration) |
| Rider self-service changes, withdrawals, and policy-governed transfers | Planned beyond existing organizer actions | [Rider self-service](product.md#rider-self-service) |
| Automated waitlist promotion and offer-email delivery | Planned | [Capacity and entry integrity](product.md#3-capacity-and-entry-integrity) |
| Timer-approved export and round-trip validation | Planned beyond the current sample CSV | [Race-day operations](product.md#5-race-day-operations) |
| Confirmations, receipts, targeted operational email, and delivery tracking | Planned | [Communications](product.md#communications) |
| Coupon/referral codes, redemption limits, and count-based pricing | Planned beyond current discounts | [Promotions](product.md#promotions) |
| Participant workspace, reusable rider identity, saved filtered views, history, and safe bulk actions | Planned beyond event-level lookup | [Participant management](product.md#participant-management) |
| Automatic confirmed-entry bib assignment and previewed bulk allocation | Bulk preview/apply Implemented in the manager check-in panel; automatic assignment and protected bulk reassignment remain Planned | [Automatic and bulk bib assignment](product.md#automatic-and-bulk-bib-assignment) |
| Reusable credits, partial redemption, and policy-controlled deferrals | Planned; same-organization first | [Credits and deferrals](product.md#reusable-credits-and-deferrals) |
| Operational/finance dashboards, role-scoped exports, and cross-event history | Event summary on Registrations Implemented (counts for registration roles, money for ledger roles); the rest Planned beyond start-list, entries, and ledger exports | [Reporting](product.md#reporting) |
| Walk-up/mobile/kiosk race-day registration | Planned beyond check-in | [Race-day registration](product.md#race-day-registration) |
| Dedicated omnium/stage-race setup, TT, pricing, and overall participation | Planned beyond existing package pricing | [Competition setup](product.md#omnium-and-stage-race-setup) |
| Multi-event, multi-organization bundles / season passes | Planned | [Season passes](product.md#cross-organization-bundles-and-season-passes) |

Timing hardware, omnium points/results scoring, and full offline synchronization are outside the initial scope. See [scope boundaries](product.md#out-of-scope-initially).
