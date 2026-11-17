# Cycling customer and launch strategy

**Recommend a reliable Berkeley Omnium rehearsal platform first, with the existing provider retained for live registration until the established launch gates pass.** The first potential external segment is volunteer-run U.S. road races and criteriums with one-day or two-day programs similar to Berkeley. The most valuable problem to validate is the manual work between configuring entries and producing a financially reconciled, race-ready start list. The local build addresses much of that workflow, but implementation breadth is not evidence of savings, buyer demand, or a sustainable service. Validate the improvement against better use of the existing provider before funding expansion. Defer a broader event-registration business and commercial-promoter scale until repeatable operation and independent buying evidence justify changing scope.

Status: **Proposed research recommendations**, November 16, 2026. Repository baseline: `4ce5dcd008fa518d64d9900e0e2fe3e6be43a0ac`. This report is input to the existing [Phase 0 decision](../discovery/decision-memo.md), not a second roadmap, an approved migration, or authorization to deploy. [product.md](../../product.md) owns requirements; [roadmap.md](../../roadmap.md) owns priorities, status, and gates. No application changes or accepted requirement changes accompany this report.

## Evidence supports a narrow operational experiment

### Research scope and limitations

The assessment covered [requirement.md](../../requirement.md), its authoritative product/roadmap sources, architecture/decisions, coding/documentation guides, feature/security/data-model/test-plan documents, existing research, code/test definitions, public issues, and current official sources. Earlier [design research](design-research.md), [payment-method research](payment-platform-options.md), and [guardian research](guardian-accounts.md) provide context; their historical prices and access limitations are not silently replaced here.

Evidence classes used below are **O**, a bounded observation; **R**, repository source/document observation; **D**, a vendor or authoritative body's documented statement; **D-indexed**, official indexed text when direct extraction was unavailable; **F**, existing self-reported feedback; **E**, expert assessment; **H**, an unvalidated hypothesis; and **U**, unknown or untested. Reading a test is R, not a passing execution. A vendor statement is not independently verified capability, a legal determination, or an uptime guarantee. An undocumented feature is U, not absent.

All external sources in this report were accessed **November 16, 2026**. Competitors remain **Platform A, Platform B, and Platform C**, consistently with the earlier research. Their names, identifying URLs, images, logos, and quotations are withheld. Anonymous source codes identify the official materials used; the underlying private ledger is retained locally but is not linked or published. **Anonymization limits independent verification.** Existing public repository documents can still identify the incumbent through contextual linkage; withholding identities here does not provide repository-wide anonymity. Processor, regulator, federation, and accessibility-standard sources are linked normally. No competitor feature or fee is promoted to a verified product requirement.

Local UI/API requests at documented defaults and alternatives refused connections; no event_reg listener was identified and other deployments were not verified. No service was started. This is a code/document assessment with historical evidence, **not fresh UI, mobile or accessibility testing**. Competitor authentication, registration, payment, refund, waiver, email, export, and offline workflows were not exercised. Public discovery extraction was incomplete for A and B; C returned text controls/listings, without a submitted search. No registrations, payments, refunds, account changes, purchases, production changes, or contacts occurred.

### Available customer evidence does not establish a market

[D01](../discovery/interviews/D01.md) is one project-owner/promoter answering across director, registration-lead, treasurer, and racer roles, recorded November 14 with November 15 follow-ups. It is not four independent customers. Unmeasured estimates were eight hours/event for reconciliation including merchandise, one hour for bibs, and 30–60 minutes for initial timer export versus five minutes with a reused template. Merchandise work is outside the implemented ledger's scope, so eight hours cannot become an assumed saving. D01's closing answers report zero duplicate entries, zero license issues, no known registration-caused weekend incident, and no disputes. This contradicts a strategy premised on frequent observed registration failures. F, not measured incidence. D01 recalled participant-paid fees of roughly 10% above entry price, without checking a provider quote, and reported no fee surprise at checkout. This is one person's recollection, not a measured current rate or evidence that other participants find fees clear.

Owner feedback identified unclear discounted package pricing and excessive scrolling for a 50-year-old Cat 4 rider eligible for several fields. The comparison and matching shortcut are already implemented; independent comprehension remains unvalidated. The [design findings](design-research.md#existing-project-evidence-favors-comprehension-over-another-feature-list) preserve that distinction. No funnel, abandonment, support-ticket, churn, willingness-to-pay or measured-workload dataset was found in the bounded review; private records could exist elsewhere. Public QA issues are not customer-demand evidence.

### Buyers, fee payers, and users are different

This **role/segment hypothesis** needs recent-purchase evidence.

| Role or segment | Likely job and decision influence | Evidence needed before treating it as a customer |
|---|---|---|
| Volunteer club director/registration lead | Selects and configures the tool; needs repeatable setup and successor handoff | Most recent provider choice, setup artifact, actual changes, staff time, and decision participants |
| Treasurer/club officer/committee | Approves spending and financial responsibility; reviews payouts, refunds, reserves, and reconciliation | Who signed the last agreement, account authority, actual invoices/net payouts, and budget approval |
| Commercial promoter | Repeats events and expects portfolio reporting, integrations, dependable support, and predictable unit economics | Independent recent-event interview and artifact review; no demand or buying authority established here |
| Participant | Chooses an event/category and bears effort and sometimes service fees | Correct unaided selection, full-price comprehension, and recovery from uncertainty |
| Parent/guardian | Acts for a child; must distinguish athlete, account holder, payer, and authorized signer | Actual junior-registration episode and fictional task evidence; no assumption that paying proves signing authority |
| Check-in volunteer | Needs fast safe triage, restricted access, and an escalation owner | Observed lookup/exception/outage tasks and workload, separately from director reports |
| Timer/official | Can reject unusable identifiers, revisions, or consent procedures | Acceptance and round trip of the intended export and approved race-readiness process |

Platforms document organizer configuration with participant-paid, absorbed, or split fees. That does not establish who makes a particular club's purchase. A participant-paid charge remains a participant cost; it is not automatically club revenue or a saving available to fund development. H/D, A01/B01/C01.

| Event shape | What changes | Initial fit judgment, E |
|---|---|---|
| One-day road race or criterium | Bounded schedule, shared starts/caps, one close, one event-day handoff | Best first live-pilot candidate after existing gates |
| Two-day omnium weekend | Day/package comprehension, compatible extra entries, one bib across applicable ranges, more revisions | Berkeley reference and rehearsal target; prove a smaller pilot first |
| Multi-event series | Cross-event entitlement, changing calendars, partial-use refunds, possibly different accounts/organizations | Validate demand before extending same-event packages |
| Clinic | Skill/session prerequisites, instructor ratios, attendance, distinct consent/guardian needs | Different workflow hypothesis; not validated by cycling race demos |
| Broad event/ticketing business | Different inventory, group/team/seat models, taxes, admission, and support expectations | Defer; no demonstrated advantage or service economics |

## The product is substantial locally and incomplete operationally

“Implemented” below means source and documented local behavior exist, not that this research executed or independently verified the feature. Specific current status/source takes precedence over older narrative. Acceptance sections are linked because there is no complete atomic requirements-ID scheme.

| Journey | Implemented locally, R | Incomplete or Planned | Consequence for a first live event |
|---|---|---|---|
| Discover/select | Published-event browsing; full schedule; opt-in matching shortcut; structured eligibility/review states; package-rate comparison | Beginner knowledge/comprehension and current phone/assistive use unvalidated | Validate existing design; unknown/stale license facts must remain review, not clearance. [Registration](../../product.md#2-rider-registration) |
| Multiple entries/total | One rider per order, several category entries; conflict checks; packages, extra-entry discounts, coupons, configured fees; accepted quote snapshot | Multi-person/family cart not established; cross-event packages and broader entitlements Planned | Do not promise one family checkout. Validate package contents, total, and protected paid prices. [Berkeley criteria](../../product.md#berkeley-weekend-acceptance-criteria) |
| Junior and waiver | Managed junior profiles; up to two explicit guardians through private APIs and My registrations acceptance; optional read-only junior viewer; guardian fields/signature; sample versioned waiver | Guardian email, invitation creation/cancellation and removal; configured-age claim; accepted federation/legal process | Sample signatures and account links are not approved consent. Under-13 direct login needs separate applicability assessment. [Account security](../../product.md#sign-in-and-account-security) |
| Payment/confirmation | Atomic holds; simulated/test-mode hosted payment; independent entry/payment/readiness; check-in code and own-order access | Real provider rehearsals, live account approval/settlement, complete financial exception handling | Existing money blockers and account responsibilities must be resolved; never infer confirmation from browser return. [Money](../../product.md#6-money-and-reporting) |
| Corrections/changes | Organizer lookup, reasoned corrections, confirmed identity linking, transfers/withdrawals, policy snapshots, simulated/test refunds | Rider self-service, automated promotion/email, reusable credits, full cancellation workflow | A narrow event can use an approved staffed request route; refund, withdrawal, and readiness must remain separate. [Participant management](../../product.md#participant-management) |
| Organizer preparation | Structured categories/eligibility; distinct start/classification/capacity concepts; limits; prices/deadlines; imports; validation; immutable publication and impact review | Independent non-developer setup/handoff, approved real-event fixtures, remaining change/reconciliation cases | Prove correct published configuration and paid-entry handling, not just a complete editor. [Builder](../../product.md#1a-road-race-and-criterium-category-builder--p0) |
| Check-in/bibs | Search/code; ready/blocked next actions; repeat-safe check-in/undo; range/collision controls; batch preview/apply; opt-in post-close assignment and protected corrections | Staff rehearsal, live camera/real print checks; walk-up registration and offline sync not established | Run normal and blocked cases with actual-role volunteers; a paid rider is not automatically ready. [Race day](../../product.md#5-race-day-operations) |
| Finance/timer handoff | Numbered start-list snapshots/diffs, entry/ledger/sample timer CSV, printable roster/blocked checklist | Actual timer agreement/round trip, full provider reconciliation, recovery and stale-list procedure | “Download works” is insufficient; every confirmed entry and revision must reach the accepted list. [Start lists](../../roadmap.md#start-lists-and-timer-export) |
| Service operation | Server-scoped organization roles, minimized volunteer access, health/shutdown and deployment configuration | Hosted operation, real identity rehearsal, demonstrated backup restore/load/monitoring/support, retention decisions | Operating capability is a launch dependency, not an optional dashboard. [Quality](../../product.md#quality-requirements) |

### Existing controls need operational proof

Source inspection found an event transaction lock for admission, atomic order/entry insertion, shared-rule capacity checks, and repeat-request ownership checks. The last-place test uses independent database/app connections and expects one success and one refusal; coupon tests also exercise concurrent redemption. These are **test definitions read**, not tests run for this report. See [capacity/concurrency](../../DATA_MODEL.md#capacity-and-concurrency), [orders](../../src/server/orders.ts), and [risk-based coverage](../testing/test-plan.md#2-risk-based-coverage).

Test-mode payments reuse session/idempotency information; webhook handling checks signatures, event identity, session, amount and currency. Late success rechecks capacity or becomes an explicit exception; refunds reserve amounts and preserve retry identity. They do not prove live operation or reconciliation. Existing [issue #84](https://github.com/kchan1028/event-registration/issues/84), accessed November 16, is a payment release blocker concerning a retryable provider error during concurrent Pay requests. It explicitly does **not** demonstrate a duplicate charge and was not reproduced against the provider in this research.

Existing [#117](https://github.com/kchan1028/event-registration/issues/117) reports header overflow at 390px, not a freshly reproduced checkout failure. [#98](https://github.com/kchan1028/event-registration/issues/98) records a bib-draft owner question; [#105](https://github.com/kchan1028/event-registration/issues/105) records stale audit text. None is closed here; closure evidence belongs in [AUDIT.md](../../AUDIT.md).

### Launch blockers differ from optional improvements

Before real riders or money, the existing gates require an accepted payment/merchant process, approved federation waiver/license path, timer acceptance, resolved money/capacity/eligibility/waiver/access blockers, approved retention, demonstrated restore and load behavior, event-day rehearsal, named support, and measured custom benefit. [Launch criteria](../../product.md#launch-criteria), [quality requirements](../../product.md#quality-requirements), [predeployment gate](../testing/test-plan.md#4-predeployment-testing). Organizer MFA and sensitive-action re-verification remain the **last pre-launch security gate**, as the owner requested, after other build work and fictional rehearsals; they are not waived or pulled forward into immediate Phase 3. [Existing sequence](../../roadmap.md#final-pre-launch-security-gate-planned).

Rider self-service, a family cart, automatic marketing, broad reports, TT/team entry, series passes, clinics, extra payment methods, and offline synchronization are not automatic prerequisites for a deliberately narrow pilot. Require observed demand or an explicit event dependency; narrow/reject a pilot needing an unbuilt capability without an accepted alternative.

## Alternatives already solve much of the workflow

All cells below are D or D-indexed, not exercised capabilities, unless marked O/U. Configuration and event policy determine actual behavior. No measured conversion, uptime, throughput or accessibility ranking is established.

| Same task | Platform A | Platform B | Platform C |
|---|---|---|---|
| Find event/category | Sub-events, demographic choices, times/prices/caps documented; current discovery extraction unsuccessful. A02–A03/A15 | Category/group/event caps documented; public list returned client shell; beginner comprehension U. B02/B12 | O-text discovery filters/listings; participant-first event choices documented; licensed cycling-category suitability U. C02–C04 |
| Several entries/people | Grouped options and series passes documented; recovery/conflict semantics U. A02–A04 | Configurable category/participant changes, charges and deadlines; general schedule conflict behavior U. B03/B05 | Additional participants and event choices documented; cycling start conflicts U. C03/C05 |
| Parent/waiver | Scoped/updated waivers and outstanding-signature links; household authority U. A05–A06 | Guardian relationship/details and proxy-to-guardian signature routing documented; authority/legal validity untested. B04 | Self/other adult/minor and linked participants documented; long-term guardian authority untested. C03 |
| Checkout/confirmation | Fee breakdown and no required initial athlete account documented; remaining-signature link; email delivery U. A01/A06 | Per-registration fee, edit links, unsigned-waiver follow-up documented; checkout/email U. B01/B04–B05 | Review/receipt, confirmation recovery and account guidance documented; checkout/email U. C01/C03 |
| Setup/waitlist | Sub-event/combined caps; passes; configurable cancellation/next invite. A02–A04/A07 | Event/category/group caps; configurable waitlist promotion/charging and preview. B02/B06–B07 | Setup/product tools and director-enabled transfers documented; settings not exercised. C04–C05 |
| Refund/change | Refund does not cancel; cancellation does not refund; available balance and normally retained service fees matter. A07–A09 | Changes/transfers, optional credits and cancellation/funds procedures documented. B03/B08–B09 | Policy/financial contract and director-enabled change mechanisms; event-specific availability U. C05–C06 |
| Volunteer/check-in | Identity lookup, code/QR, waiver/bib review and undo; reliable connection expected. A10 | Search/QR, waiver follow-up, category/bib/manual finish; live tool requires Wi-Fi/cell. B13 | Offline check-in and reconnect sync documented, not tested; some actions require connection. C07 |
| Export/timing | CRM CSV and timer guidance/integration documentation; our timer acceptance U. A08/A11 | Customizable CSV columns/order/sort and bib/manual data; round trip U. B14 | Participant/payment reports and scoring synchronization documented; our timer acceptance U. C07–C08 |
| Support | Live team/setup help stated; hours/response guarantee U. A01/A11 | Phone/email help documented; response guarantee U. B14 | Seven-day support stated; response/uptime guarantee U. C09 |

### Current fee and payout documentation is not a total-cost comparison

The following snapshot is USD standard public pricing for **one $90 paid base entry, one person, one order**, with participant-paid fees, no extras or tax. This is documented-formula arithmetic, not a quote or absorbed-fee comparison. Do not double-count included processing. A01 is indexed-only, with its pricing document dated August 11, 2026; B01 is directly readable, dated September 19, 2025; C01 is directly readable current pricing. These current observations do not rewrite earlier dated research.

| Platform | Documented standard fee basis | Fee / checkout on this example | Cash availability and limits |
|---|---|---:|---|
| A | 6.5% + $1; documented one-participant example. Fixed-fee allocation across several people U. A01 | $6.85 / $96.85 | Connected-account setup; daily/weekly/monthly/manual schedules in October 17 guidance. Available balance, reserves, bank arrival and manual-reporting limits matter. A13–A14 |
| B | Per registration: 6.5% + $1.25 below $250; 3.5% + $8.75 from $250. B01 | $7.10 / $97.10 | On-demand direct-deposit requests normally processed within one business day; new-director activation required. Not a guaranteed bank-arrival date. B15 |
| C | Per cart: 6% + $1 below $250; 5% + $1 from $250–999.99; 4% + $1 from $1,000. C01 | $6.40 / $96.40 | Weekly release default, optional schedules/holds and refund reserves; bank arrival adds time and underwriting varies. C10–C11 |

B's per-registration basis and C's per-cart basis prevent applying this single-entry comparison blindly to family or multi-entry purchases. A's multi-person fixed-fee basis needs confirmation. At 500 separate example orders, fee collections would be $3,425/$3,550/$3,200 respectively; **these are participant costs under that setting, not proven organizer savings**. Uptime and account-specific terms are not ranked.

### Switching is a financial and operational cutover

D01 values familiar discovery, audience trust and existing registration ease. E: other likely reasons to stay are reusable setup, known participant accounts, preserved refund history, established support, approved waiver process and timer files; interview and artifact evidence must establish their importance. A12 documents assisted migration where prior payments are not recreated, illustrating why importing rows does not transfer refund authority.

A future migration review needs a named cutover/rollback owner; mappings for categories, starts, classifications, shared limits, stable participant/order/entry/bib keys; preserved accepted price/policy snapshots; reconciled holds/waitlists/offers/credits; separately established guardian and waiver evidence; accepted timer revision/round trip; clear late-change communication; and retention/offboarding rules. Existing payment/refund/dispute authority stays with its provider unless an expressly supported agreement changes that. Marketing permission is separate from operational contact and export access. **Use fake records for validation; this report authorizes no real-data import or dual live registration.** A live pilot must have one authoritative entry source and payment path.

### Anonymous source register

Codes are specific to this November 16 report; exact-source verification needs the private ledger.

| Sources | Official material and access quality |
|---|---|
| A01–A04 | Pricing, sub-events, combined limits, series. D-indexed; direct pricing body unreadable |
| A05–A10 | Waiver versions/links, cancellation, CRM, refunds, volunteer check-in. D-indexed |
| A11–A14 | FAQ, migration, payout schedules and payment accounts. D-indexed; latest payout detail takes precedence over older FAQ wording |
| A15 | Attempted public discovery returned a reader error; route/current behavior U |
| B01 | Service-fee policy. D, directly readable |
| B02–B10 | Caps, transfers, guardian waiver, edit links, waitlists, credits, cancellation and terms. D-indexed |
| B12–B15 | Discovery client shell, check-in help, director FAQ, payout help. B14 directly readable but includes visibly old browser references; scope narrowly. Other help D-indexed; discovery U |
| C01–C04 | Current pricing D; discovery O-text with cookie notice; participant/setup guidance D-indexed |
| C05–C06 | Transfers and financial contract. D-indexed |
| C07–C11 | Check-in overview D; reports, support and payout/account help D-indexed |

## Own-event economics differ from a registration business

### Model operating responsibility before choosing a price

The existing [business-model hypothesis](../../product.md#business-model-hypothesis) favors a transparent per-paid-entry fee with absorbed or passed-through options, but price and rider tolerance remain unvalidated. Compare this with a seasonal organizer subscription and an explicitly club-funded tool. A subscription spreads fixed cost but can charge volunteer clubs in inactive months; a per-entry fee follows seasonality but does not match per-order payment costs; participant-paid fees move cost to riders; an internal tool can be subsidized without proving commercial margin. None establishes willingness to pay. Ask who approved the most recent actual provider budget and inspect the resulting economics before proposing a sales price.

For a single club, compare a direct club account with the current provider before adopting multi-party settlement. [ADR 0005](../decisions/0005-merchant-and-settlement-model.md#decision-proposed) remains Proposed. Stripe documentation says charge type determines whose balance bears refunds/chargebacks; configuration and contract still determine loss responsibility. Connect's platform-controlled pricing lists account/payout charges, while its alternative pricing model differs; those charges must not be added indiscriminately to a direct-club account. First-payout delays and account risk review defeat any promise that authorization equals race-date cash. D, [funds flow](https://docs.stripe.com/connect/charges), [Connect pricing](https://stripe.com/us/connect/pricing), [payouts](https://docs.stripe.com/payouts), accessed November 16, 2026.

Define the legal seller, fund recipient, account owner, refund/dispute operator, negative-balance/reserve responsibility, tax/insurance responsibility, and support owner explicitly. Participant relationships are not settled by declaring “data ownership”: contracts must distinguish operational communications, marketing permission, authorized access, portability, retention/deletion, subprocessors and exit rights. The club-direct model does not resolve all of those questions.

### Illustrative costs include labor and quiet-season maintenance

**Assumptions, not forecasts, quotes, actual Berkeley volumes, or a completion estimate:** The baseline is one event per year (K=1); N is that event's paid entries, T its successful payment transactions, and the assumed ratio is 1.25 entries per transaction, so T=N/1.25; $72 average entry and $90 average order; domestic cards only. Stripe's documented standard processing is 2.9% + $0.30; original processing fees are not returned with refunds. Thus gross entry receipts G=72N and processing P=0.029G+0.30T=2.91T. D, [pricing](https://stripe.com/pricing), accessed November 16, 2026.

Assume 0.5% of transactions disputed, all manually countered, half lost. The documented $15 received-dispute fee plus $15 counter fee, refunded for a won counter, gives expected D=0.005T×($15+0.5×$15). These are synthetic incidence assumptions, not project experience. Support S values 26 event hours at $50/hour, plus 2% of orders needing 12 minutes: S=50×(26+0.02T×0.2). Annual fixed F is an unquoted $90/month infrastructure/email/identity/backup/monitoring allowance plus four maintenance hours/month at $75/hour: **$4,680/year**, including months with no race. Price each actual service and measure labor before deciding.

| Paid entries N | Transactions T | Entry receipts G | Processing P | Dispute fees D | Event support S | Annual recurring own-event cost P+D+S+F | Cost/entry |
|---:|---:|---:|---:|---:|---:|---:|---:|
| 300 | 240 | $21,600 | $698.40 | $27 | $1,348 | $6,753.40 | $22.51 |
| 600 | 480 | $43,200 | $1,396.80 | $54 | $1,396 | $7,526.80 | $12.54 |
| 1,000 | 800 | $72,000 | $2,328.00 | $90 | $1,460 | $8,558.00 | $8.56 |

An additional illustrative 120 hours at $75/hour adds $9,000 to the first-year budget, giving $15,753.40/$16,526.80/$17,558.00. **120 hours is a sensitivity allowance, not an estimate of remaining development.** Obtain a scoped estimate after gate/blocker review; separate sunk work from future investment. These are registration-operation costs, not event profit. They exclude race production, permits, insurance, taxes, counsel, migration, unquoted add-ons and major incidents. They include club tasks an incumbent also leaves to organizers: compare both options with the same labor boundary rather than treating either side's volunteer labor as free.

At an assumed 3% refunded orders, principal reversals are $648/$1,296/$2,160; retained processing within those refunds is $20.95/$41.90/$69.84, **already inside P**. Do not add that fee twice. Expected lost disputed principal is separately $54/$108/$180, a receipts reversal rather than another processor fee. Fractional expected disputes are modeling arithmetic, not possible observed counts. Refunds can remain pending without sufficient available balance. A whole-event cancellation can require far more cash than a routine 3% scenario. Reserve cash is liquidity, not another expense unless actual losses occur. D, [refunds](https://docs.stripe.com/refunds), accessed November 16, 2026.

For K supported events, allocate annual F/K and an explicit launch-recovery amount, while funding simultaneous event support. At a hypothetical $2 per paid entry, 600 entries yield $1,200, below even this scenario's $1,396 event support. This rejects a careless low-fee model, not a particular market price. If a passed-on platform fee f per entry joins the same card charge, processing becomes 0.029×(G+fN)+0.30T; processing the fee itself has a cost. Absorbed versus passed-through settings must use quoted account terms and a defined rounding policy. No commercial margin or willingness to pay follows from a processor-only comparison.

| Option | What it buys | Costs/responsibilities still to establish | Smallest decision evidence |
|---|---|---|---|
| Improve current provider setup | Familiar purchase path, current financial/waiver history, documented tools/support | Real organizer labor, configuration limits, actual all-in fee/payout agreement | Reconstruct one recent event's setup, reconciliation and timer handoff; test better existing configuration |
| Own Berkeley-focused tool | Direct control of cycling rules and volunteer handoffs | Future development, annual maintenance, identity/data/consent, support, money exceptions, recovery and cash reserves | Fictional paired rehearsal against the improved-incumbent baseline and a funded owner/deputy |
| Product for similar cycling promoters | Reuse across a tightly defined segment | Independent onboarding, contracts, tenant isolation, support coverage, settlement/offboarding, measured contribution margin | Another organizer supplies an authorized rehearsal commitment and cost/contract review after first-event gates |
| Broad registration business | Potentially more event shapes | Unvalidated demand, new semantics, integrations, legal/support scope and acquisition costs | No build now; evidence of a repeated adjacent need and positive repeatable service economics first |

## Legal and reliability questions remain operating decisions

This section records authoritative statements and applicability questions, **not legal advice, compliance certification, federation acceptance, or new accepted release criteria**. Keep responses in the existing [federation packet](../usac-questions.md#answers), [payment questions](../payment-model-questions.md#unresolved-operating-decisions), [decision backlog](../decisions/README.md#decision-backlog), and [operations questions](../operations.md#open-questions).

California AG guidance says mandatory fees generally belong in advertised/listed prices for covered goods/services; a compulsory card fee cannot be cured merely by disclosure near checkout. Review event/category/package price presentation and ask counsel to determine the seller/event's applicability. The FTC federal fee rule addresses live-event audience tickets and short-term lodging; that alone does not establish coverage of race-entrant fees. Do not conflate those scopes. D, [California fee guidance](https://oag.ca.gov/hiddenfees), [FTC fee-rule FAQ](https://www.ftc.gov/business-guidance/resources/rule-unfair-or-deceptive-fees-frequently-asked-questions), accessed November 16, 2026.

COPPA applicability depends on the operator, service audience, actual knowledge and direct collection from children. The FTC distinguishes parent-supplied child information from collection from the child. Evaluate the implemented optional junior viewer/sign-in and tracking separately from guardian-led entry. A sporting waiver or relationship checkbox does not substitute for applicable privacy consent. The 2025 amendments generally required compliance by April 22, 2026; use the revised rule. CCPA applicability is also conditional; a nonprofit club's position does not automatically settle a separately operated commercial service or contract duties. D, [FTC COPPA guidance](https://www.ftc.gov/business-guidance/resources/complying-coppa-frequently-asked-questions), [current rule](https://www.ecfr.gov/current/title-16/chapter-I/subchapter-C/part-312), [amendments](https://www.govinfo.gov/content/pkg/FR-2025-04-22/html/2025-05904.htm), [California privacy overview](https://oag.ca.gov/privacy/ccpa), [current adjusted thresholds](https://cppa.ca.gov/regulations/cpi_adjustment.html), accessed November 16, 2026.

The 2026 federation insurance summary documents an approved-platform electronic-waiver route or physically signed paper for an unapproved platform, with restrictions on modifying the waiver and secure retention of paper originals/digitized copies for at least ten years; policy terms prevail. This is not approval of CycleReg. Confirm the actual event and guardian process through the unanswered packet, including the staffing/storage cost of any accepted manual route. Do not apply waiver-retention rules to all emergency contacts or drafts. D, [2026 insurance summary](https://assets.usacycling.org/prod/documents/2026-Event-Insurance-Coverage-Summary.pdf), accessed November 16, 2026.

### Rehearse failure with a second operator

These are Proposed exercises implementing existing risk concerns; no exercise was executed here. Outcomes must be recorded under the [test plan](../testing/test-plan.md), with real-data conditions respected. Use fictional data and approved isolated/sandbox environments only.

| Risk | Smallest useful exercise | Required observable result / unresolved dependency |
|---|---|---|
| Overselling | Independent sessions contest last shared place, including package expiry and several classifications | One admitted rider; atomic package; correct unique-rider counts; expected peak/load baseline still needed |
| Retry/unknown payment | Provider sandbox timeout, refresh, repeat Pay, duplicate/out-of-order event, late success | One authoritative charge/entry or explicit exception; provider/local records reconcile; resolve #84 |
| Refund/change inconsistency | Partial refund/retry, withdrawn versus refunded entry, pending/failure, extra-charge recovery | Cent-for-cent finance reconciliation; no inferred withdrawal or clearance; named finance owner |
| Connection loss | Ready rider, blocked rider and late change using a versioned printed snapshot, then restoration | No false clearance or guessed live write; exceptions routed and reconciled once; approved fallback/owner |
| Recovery | Restore fictional event and reconcile post-backup provider outcomes, bibs and revisions | Measured recovery duration/data loss against agreed targets; no claim that a backup file proves recovery |
| Permissions/handoff | Volunteer versus finance/timer exports, revoked access, developer-absent incident drill | Minimized fields and authorized actions; second operator finds runbook and escalation; sensitive findings handled privately |

## Research with people must test recent behavior and safe task completion

### Proposed interview plan: twelve unique people

No recruitment, interview, or participant session occurred in this task. The plan covers 12 unique adults: three organizers, a treasurer, a timer, three racers, two parents, and two check-in volunteers. It includes commercial-promoter comparison without presuming that segment should be served. Record overlapping experience but do not turn one person's several roles into independent evidence.

| People | Recent-event focus | Artifact or decision to reconstruct |
|---|---|---|
| Volunteer director, registration lead, commercial promoter: 3 | Last actual provider selection, setup, registration change and staff handoff | Who initiated/approved/signed; event configuration, change sequence, time/cost and support escalation |
| Treasurer: 1 | Last settlement, refund/cancellation, discrepancy or closeout | Gross-to-net explanation, fee allocation, actual bank arrival, account access, reserves and labor |
| Timer: 1 | Last roster received and last late revision | Required identifiers/columns, rejected file, revision receipt and actual timing-system round trip |
| Beginner, returning and multi-entry racers: 3 | Most recent attempt to find an event, pick a field and recover from uncertainty | What information they had, what they chose, full cost, help sought and event-day instructions |
| Parents: 2 | Most recent junior entry, including another child or an open-category entry where relevant | Child/payer/signer identities, account access, consent steps, missed requirements and correction route |
| Volunteers: 2 | Last check-in shift and actual exception/connectivity incident | Lookup sequence, escalation, queue time, list freshness, scope of access and recovery |

Use 40–60 minutes per interview. Ask the person to walk through the last real event chronologically: what triggered the task; what they did first; which information/tool/person they used; where they paused; what happened next; and how they knew it was finished. Ask “show or describe the last example” and “who approved/paid for that?” rather than hypothetical feature preferences. Probe consequences and workarounds without suggesting that duplicates, licenses, or fees were a problem. If nothing went wrong, record that. Separate recalled estimates, privately observed artifacts and timed observations.

Reuse the [consent and privacy rules](../discovery/README.md#protect-people-and-their-data): participant codes, separate optional recording consent, private raw storage, anonymized summaries, no real rider records committed or imported. Use fictional details for product tasks and no junior participant recruitment in this adult plan. Capture attempted versus completed interviews and limitations; twelve agreeable interviewees do not establish market prevalence or willingness to pay. A real budget/contract/rehearsal commitment is stronger than a favorable response, but cannot authorize live use before gates.

### Proposed usability tasks for five roles

Use the existing [kit](../usability/README.md), [Berkeley tasks](../usability/tasks.md#berkeley-weekend-initial-round), consent/storage and rescue rules. Start with the existing formative round of 3–5 riders/parents and 2–3 staff. Separately consent and expose at least five riders/parents, two organizers and two volunteers for the existing Phase 1 panel. Interview participation alone does not count; a market-only commercial interview is not task success. The 12-person pool could supply those roles, but actual attempts and overlaps must be recorded.

| Role/task using fictional data | Observable success | Critical failure and measurement |
|---|---|---|
| First-time racer: find a suitable race with an unknown license category, then a provided verified profile | Finds help/review without inventing qualification; selects a compatible field after facts are supplied; explains start, deadline, full cost and remaining clearance | Guessing an unsupported category or treating a match as cleared is critical. Record task completion, help, wrong choices and teach-back |
| Returning racer: age-50 Cat 4, two days plus an extra criterium entry | Uses All races or shortcut; chooses intended compatible entries; explains package coverage, extra-entry price, lowest eligible rate and complete total; finds confirmation/instructions | Wrong purchased days/price, prohibited shared start, or paid-as-ready claim is critical. Record time after sign-in, corrections and retained selections |
| Parent: junior in a junior field and separately in an open/adult field; inspect a second-child route | Keeps child, guardian/payer and signer distinct; completes applicable child-specific requirements; identifies outstanding consent; understands another child requires another current order | Wrong child/signer, bypassed guardian process, or assumed family cart/other-household access is critical. Observe privacy expectations and recovery |
| Organizer: configure/publish a small road/crit program, then change a category and resolve an entry | Preserves category/start/classification/pool distinctions; verifies prices/windows/caps; previews impact; retains accepted paid prices; produces finance/timer handoff and explains refund versus withdrawal | Unsafe cap/price/entry mutation or missing confirmed rider is critical. Time setup/admin against same-scope incumbent task; validate file with timer separately |
| Volunteer: ready rider, paid-but-blocked rider, repeated scan, stale snapshot and connection loss | Finds correct identity; issues permitted bib only when ready; duplicate action stays repeat-safe; explains blocker and routes to authorized desk; recognizes stale data and approved fallback | False clearance, wrong bib/person, unauthorized financial action or invented offline success is critical. Time standard cases and count exceptions separately |

Record correct completion without rescue, time, errors, help, abandons/skips, participant confidence and explanation, and system state separately. An abandoned task is not removed from the denominator; report reasons and every attempted/omitted task. The existing gate is **at least 90% unassisted core-task completion and no unresolved critical blocker**, with critical fixes re-tested with new participants. It is a local gate, not statistical proof. Preserve the existing [success measures](../../product.md#success-measures): setup/admin at least 30% below comparable baseline; returning signed-in checkout median under three minutes; standard check-in median under 30 seconds/P95 under 90 seconds; exceptions separately reported; no unexplained money/capacity/list incidents. None is an observed result here.

Include keyboard-only and screen-reader task passes, zoom, actual phone layouts, both themes, non-color states, field/error focus, accessible authentication, and hold-expiry recovery under the [manual checks](../testing/test-plan.md#5-manual-checks). Assess WCAG timing requirements and relevant exceptions rather than assuming every inventory hold must be extendable. The current [WCAG 2.2 standard](https://www.w3.org/TR/WCAG22/), accessed November 16, 2026, is a reference, not a claim of legal applicability or conformance. Volunteers also need a real printer/outdoor/device rehearsal after authorization; a screenshot or scanner is insufficient.

## Proposed priorities and a thirty-day evidence cycle

The groups below are **recommendations for review**, mapped to existing requirements/gates. They do not change roadmap ordering, acceptance criteria or status. Effort is a planning-size assumption: **S** up to two person-days, **M** three to ten, **L** more than ten or externally uncertain. Sizes include named research/rehearsal work, are not engineering estimates, and need scoping before commitment. Security sequencing is unchanged.

### Required for our first live event

| Recommendation: problem and expected outcome | Evidence | Effort and dependencies | Risk and smallest useful validation |
|---|---|---|---|
| P01: accept a narrow operating scope; avoid an unsafe event depending on missing capabilities | R: [launch criteria](../../product.md#launch-criteria), empty pilot shortlist | S decision; product owner, organizer, timer and support owner | Scope creep or premature migration. Complete one pilot suitability review and keep incumbent live meanwhile |
| P02: resolve payment/reconciliation blockers; preserve money and entries through retries/refunds | R: #84, test-mode controls; D: provider balance behavior | M/L; merchant decision, authorized sandbox and finance owner | Lost/duplicate/unexplained outcomes. Reconcile one retry/late-payment/partial-refund sandbox script cent-for-cent |
| P03: agree waiver, eligibility, junior data and fee-display route; prevent unsafe consent/price assumptions | R: unanswered external packets; D: regulator/federation sources above | L external; federation/counsel/treasurer, accepted retention | Unapproved consent, disclosure or access. Review one junior/open-category and all-in-price scenario with accountable approvers |
| P04: prove roster, bib and outage handoff; make volunteers safe without the developer | R: built tools, unaccepted timer format, no recovery evidence | M; actual timer, deputy, print/version procedure, agreed recovery/load baseline | Stale list/false clearance. Run one blocked/ready/outage drill and timer round trip, then restore/reconcile a fictional event |
| P05: validate existing selection/pricing/mobile/accessibility; reduce preventable wrong purchases | F: owner feedback; R: implemented shortcut/comparison, #117; H: beginner comprehension | M; recruit/consent adult role panel, scoped fixes approved separately | Mistaking polish for validation. Run the five-role tasks and fix/retest critical failures before using gate evidence |
| P06: finish final security gate last; protect real data/money without changing agreed sequence | R: [final gate](../../roadmap.md#final-pre-launch-security-gate-planned) | L scope unknown; all preceding rehearsals, role/security verification | Live use before controls. Require existing independent verification and predeployment evidence before accepting real records |

### Validate with customers

| Recommendation: problem and expected outcome | Evidence | Effort and dependencies | Risk and smallest useful validation |
|---|---|---|---|
| P07: measure setup/reconciliation/bib work and test improve/buy/build; identify a recurring valuable problem | F: D01 estimates; no measured baseline | M; separate staff, private sanitized artifacts, comparable scope | Counting merchandise or donated time incorrectly. Reconstruct and time one matched workflow with both approaches |
| P08: establish buyer, budget, switching cost and fee tolerance; determine who can authorize change | H: club/committee/commercial role map; D: existing alternatives | M; 12-person plan and actual spending evidence | Positive feedback mistaken for purchase. Reconstruct one actual approval and obtain a specific bounded rehearsal/budget decision |
| P09: test junior/multi-entry/conflict/confirmation comprehension before expanding cart or self-service | F: narrow owner feedback; R: one-rider order; H: household needs | S/M; current UI/prototype and fictional profiles | Building group commerce for a rare problem. Observe current recovery and count cases requiring another person/order |

### Required before onboarding another promoter

| Recommendation: problem and expected outcome | Evidence | Effort and dependencies | Risk and smallest useful validation |
|---|---|---|---|
| P10: prove independent onboarding and successor operation; reduce founder dependency | R: local build, no independent operated service | M/L; first-event evidence, approved rules, second organizer | Bespoke setup/support hidden as scalable software. Have another comparable organizer configure a fictional event without author help |
| P11: fund support, settlement, contracts, isolation and exit; make service responsibilities explicit | R: Proposed ADR0005/operations; D: conditional funds flow; cost model | L; finance/legal owners, measured unit costs, privacy/security review | Underfunded peak support, unclear liability or access. Review one actual prospective event cost/contract and isolated organization/offboarding rehearsal |

### Defer or stop

| Recommendation: problem and expected outcome | Evidence | Effort and dependencies | Risk and smallest useful validation |
|---|---|---|---|
| P12: defer broad event types, series/team/clinic commerce, extra payment buttons and speculative automation | U: independent demand; R: current cycling model boundaries | S scope decision; later [observed-demand phase](../../roadmap.md#phase-6--expand-only-from-observed-demand) | Dilution and unowned complexity. Record a repeated unmet adjacent job before accepting new scope |
| P13: stop custom expansion if improved incumbent meets the measured need at lower total burden | R: existing Phase 0 stop option; D: substantial incumbent tools | S decision after M evidence cycle; owner signs decision memo | Sunk-cost momentum. Compare same-scope outcomes/costs and explicitly choose improve/buy/build rather than defaulting to more code |

### Thirty days buys evidence, not a launch promise

This Proposed timebox starts only after owner approval and recruitment authorization. Record unmet gates caused by missing replies/participants. No outreach occurred or is authorized here.

| Days | Work and accountable role to appoint | Measurable output and decision gate |
|---|---|---|
| 1–5 | Product owner defines bounded question, time/budget ceiling and incumbent comparator; appoints technical, finance, support/deputy and research owners | One scope/budget sheet, named responsibilities and current blocker list linked to existing homes. **Gate 1:** no owner/budget means desk work can continue, live expansion cannot |
| 6–12 | Research lead conducts adult interviews; registration lead/treasurer/timer reconstruct last event and current-tool alternative | Target 12 unique interviews with role/attempt ledger; one sanitized baseline workflow and actual cost/funds map. Identify what is measured versus recalled. **Gate 2:** no recurring costly unmet job means improve incumbent/stop |
| 13–20 | Research lead runs formative tasks, then fills existing role coverage; authorized engineers/operators run fictional/provider-sandbox rehearsals when prerequisites allow | At least 5 racer/parent, 2 organizer and 2 volunteer task exposures for gate consideration; completion/error/time tables; critical-failure retest plan; one reconciled timer and failure-script record. Unavailable prerequisites remain Pending |
| 21–26 | Finance/support/technical owners replace synthetic costs with quotes and measured hours; deputy rehearses incident/fallback; owner resolves accepted scope changes through normal review | One comparable buy/build budget, support rota, cutover/fallback proposal, recovery/load evidence or explicit blocker. **Gate 3:** no safe/funded operation means no live migration, regardless of UI scores |
| 27–30 | Product owner reviews evidence in existing decision memo and pilot-selection packet | Signed continue/improve/buy/stop decision or recorded unanswered conditions; prioritized accepted changes go into product/roadmap only after review. **Gate 4:** approve only the next safe experiment; no automatic launch or broader-market announcement |

Expansion beyond Berkeley requires more than a favorable study: repeated unmet jobs from independent comparable organizers; first controlled event evidence under the existing gates; measured preparation/support/reconciliation outcomes; a second non-developer operator; tested isolation/exit/restore and agreed timer/waiver/financial paths; and a real prospective organizer willing to review a costed, bounded commitment. Commercial expansion needs funded seasonal support and positive contribution after onboarding/maintenance/risk allocation. Broadening event types additionally requires evidence that their different inventory, eligibility/consent and operational jobs justify an explicit scope decision. No such proof is established today.

## Three owner decisions and the next action for each

These decisions remain **open**, reviewed November 16, 2026. Record answers in existing authoritative homes; silence approves nothing.

| Decision and owner | Why it matters; provisional assumption | Next concrete action; what proceeds or stays blocked |
|---|---|---|
| **1. Fund a bounded evidence cycle, or improve the current provider and stop custom expansion?** Product owner | No independent measured benefit or buying evidence. Provisional recommendation: Berkeley-focused fictional rehearsal, with incumbent retained live | Set an explicit time/budget ceiling and complete the existing [build-versus-improve decision](../discovery/decision-memo.md#build-versus-improve) using baseline evidence. Desk research can proceed; expansion/migration stays blocked until the [exit conditions](../discovery/decision-memo.md#exit-gate-conditions) are answered. Revisit at Day 12 and Day 30 |
| **2. Who is accountable for money, data and race-week support, with what budget?** Product owner and treasurer; support/technical deputies currently unassigned | Seller, reserve, dispute, retention and support obligations change the economics. No merchant model or operating targets accepted by this report | Appoint owners in [team and owners](../discovery/decision-memo.md#team-and-owners); resolve [ADR0005](../decisions/0005-merchant-and-settlement-model.md#decision-proposed), [payment decisions](../payment-model-questions.md#unresolved-operating-decisions) and [operations questions](../operations.md#open-questions). Fictional evaluation can continue; real money/data and promoter onboarding remain blocked. Revisit before Gate 3 |
| **3. Which lower-risk cycling pilot and evidence would justify serving another promoter?** Product owner with pilot organizer, timer and support owner, not yet appointed | Berkeley remains a reference, not an approved migration; broader demand is unknown. Provisional recommendation: one-day comparable race first, broader events deferred | Fill one candidate in the existing [pilot shortlist](../discovery/pilot-selection.md#shortlist), secure actual-role rehearsal/acceptance evidence and apply [launch criteria](../../product.md#launch-criteria). Interviews and candidate assessment can proceed; pilot approval and broader scope remain blocked pending existing gates. Revisit at Day 30 or when missing external answers arrive |

## Change summary

What changed: Added this dated customer/launch-strategy research and linked it from the research index.
Why: Separate a useful own-event experiment from an unvalidated registration business and identify the next evidence needed.
Product impact (product.md): None; recommendations remain Proposed and no requirements or accepted scope were changed.
Roadmap impact (roadmap.md): None; priorities, phase gates and delivery status remain authoritative there.
Feature impact (feature.md): None; no functionality or feature status changed.
Security impact (SECURITY.md): None; no access, payment, data-handling or deployment behavior changed; applicability questions are research, not compliance claims.
Docs updated: This report and docs/research/README.md; DATA_MODEL.md needs no update because no data behavior or schema changed.
Test plan: No test plan update needed: proposed research exercises reference existing coverage and gates without adopting new workflows, release criteria or testing policy; no application change.
Status: Proposed recommendations; source/document/issue synthesis only. No application tests, builds, sessions or fresh UI/a11y audit ran. Independent review evidence is recorded in the pull request.
Open questions: The three decisions above link existing decision-memo, pilot, merchant/payment and operations questions; federation and timer acceptance remain in their existing packets. No customer demand, willingness to pay, launch date or compliance approval is inferred.
