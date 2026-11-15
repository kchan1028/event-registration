# BikeReg feature gap review

Reviewed November 14, 2026. Scope: organizer and rider registration features for CycleReg, based on official public documentation and the checked-out repository. This is a capability comparison, not a new roadmap or a hands-on BikeReg product test. SEO, traffic, market share, and plan-specific availability were not assessed.

## Evidence

BikeReg's [feature list](https://www.bikereg.com/features) documents refunds, credits, participant transfers, event-user permissions, email tools, custom questions, merchandise, coupons, block pricing, and reporting. Its [payment policy](https://www.bikereg.com/Users/Public/Director/PaymentPolicy.aspx) describes disbursements. Its [LiveReg guide](https://www.bikereg.com/Users/Public/Director/LiveRegGuide.aspx) describes on-site payments, manual entries, bibs, release forms, and timer downloads.

An official [July 16, 2019 announcement](https://blog.athletereg.com/2019/07/bikereg-and-usa-cycling-launch-first-round-of-new-offerings-for-event-directors/) describes permit integration, USAC waivers, and license validation. This establishes historical capability; current coverage and federation access need direct confirmation.

The [2025 Two Days of Buffalo registration notes](https://www.bikereg.com/CommonFiles/CustomControls/Registration/RegNotes.aspx?eventID=69261) offer a TT/criterium/road-race entry and separate stage entries, reserving overall-prize eligibility for full-event entrants. This demonstrates an event configuration, not a verified built-in BikeReg stage-scoring engine or organizer setup wizard.

## Gaps in CycleReg

| Area | CycleReg status | BikeReg evidence |
|---|---|---|
| Live payments, refunds, settlement, and credits | Payment is simulated. Transfers record differences without collecting or refunding them. No payout or credit system. | Feature list and payment policy |
| Accounts and event permissions | Sign-in, MFA, rider accounts, and organizer roles are unbuilt. | Feature list documents additional event users and permissions; no MFA parity claim |
| Confirmation and participant email | No email delivery, including receipts and waitlist offers; organizers copy offer links. | Feature list |
| Rider self-service transfers | Organizer changes exist; rider-initiated changes are unbuilt. | Feature list |
| Federation workflow | Manual review and sample waivers only. | Historical integration announcement; reconfirm current behavior |
| Race-day sales | Check-in exists, but no production manual-entry/payment-desk workflow. | LiveReg guide |
| Timer interoperability | Sample CSV and snapshots exist; no agreed timer format or tested round trip. | LiveReg download templates |
| Configurable forms and add-ons | No category-specific questions, merchandise inventory, or tax configuration. One event-level sample waiver is not approved multi-waiver handling. | Feature list |
| Promotions and pricing | Scheduled increases, bundles, and extra-entry pricing exist. Coupon/referral codes, credits, and registration-count price tiers are unbuilt. | Feature list |
| Cross-event rider management and reporting | Identity is per order; no reusable rider history, cross-event search, or prior-year registration dashboard. | Feature list |
| Event presentation and access | Limited event metadata; no rich event-page attachments, password-protected registration, invitation bypass codes, or lottery workflow. | Feature list |
| Omnium and stage-race purchase setup | Omnium bundle pricing exists, but podium nomination is seed metadata with no organizer editor. TT support and the $160 three-race fixture are unbuilt; no cross-event bundle purchasing. | Buffalo example, with the limits stated above |

## Existing capabilities to retain

CycleReg already implements category editing, structured eligibility, independent scoring classifications, shared capacity rules, scheduled pricing, bundles, category CSV import/export, a published schedule, manual license review, organizer-managed waitlists, organizer transfers/withdrawals, bib assignment, repeat-safe check-in, start-list snapshots, and a printable fallback roster. These are local prototypes, not verified live-service parity with BikeReg. See [feature.md](../feature.md), [roadmap.md](../roadmap.md), and the tests under `tests/`.

## Implications

For the next demo, the visible gap is explicit organizer controls for omnium participation and a separately scoped TT/stage-race fixture. For a live pilot, follow the existing roadmap gates for accounts, payments, approved waiver/license processes, email, and timer acceptance. Marketing analytics, fundraising, merchandise, and lotteries do not become requirements merely because BikeReg offers them. No priorities or product scope were changed by this review.

No evidence reviewed establishes that BikeReg computes stage-race general classification or omnium points. Do not add scoring parity to the gap list without further evidence. CycleReg's current scope excludes results scoring.

## Raw data sources

Web research responses: [research.json](raw/bikereg/2026-11-14/research.json). Official page claims are observations; the gap assessment and suggested implications are repository-based analysis. Public documentation can be incomplete or stale; confirm operational details before migration or public comparison claims.
