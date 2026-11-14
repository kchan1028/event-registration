# Roadmap: cycling race registration

Status: Proposed; no migration or delivery date committed  
Date: November 14, 2026  
Related brief: [product.md](product.md)

## Delivery status

Status values: Planned, In progress, Implemented, Verified, Blocked. Work is Verified only after its acceptance criteria or exit gate have been checked. See [docs/documentation-guide.md](docs/documentation-guide.md#status-vocabulary).

| Item | Status | Notes |
|---|---|---|
| Repository and documentation foundation | Implemented (November 14, 2026) | Supporting work, not a roadmap phase. No application code exists. |
| Phase 0: Establish the case to build | Planned | Not started. Next actions are listed at the end of this document. |
| Phase 1: Test the experience without live money | Planned | Depends on Phase 0. |
| Phase 2: Build the registration core | Planned | Depends on Phase 1 and a settled payment model. |
| Phase 3: Make race day operable | Planned | USAC acceptance gates live sanctioned use. |
| Phase 4: Run a controlled live pilot | Planned | Depends on Phase 3. |
| Phase 5: Prove a two-day weekend and handoff | Planned | Depends on a successful Phase 4. |
| Phase 6: Expand only from observed demand | Planned | P2. |

## Delivery approach

Validate that the product saves volunteer time before building a replacement registration system. Deliver in dependency order, using phase exit criteria rather than a fixed launch date. Do not anchor the first live use to Berkeley Omnium's registration opening.

Effort ranges below are planning estimates for a dedicated product engineer with part-time design, QA, and organizer input. They are not calendar commitments. External approvals, payment onboarding, and event availability can extend delivery. Re-estimate after discovery; an intermittently available volunteer team will need longer.

## Phase 0 — Establish the case to build

Indicative effort: 2–3 weeks. Priority: P0.

Deliverables:

- Observe the current registration workflow and interview the race director, registration lead, treasurer, timer, and at least five riders/parents.
- Map the road race and criterium setup, shared fields, discounts, changes, exceptions, check-in, and exports.
- Measure organizer hours, check-in times, errors, and support requests.
- Compare improving the current setup, purchasing additional support, and building a new platform.
- Contact USAC about integration and accepted waiver/license processes, including future access to pull waiver status and validate licenses. Assess payment-provider operating models.
- Research how results reach road-results.com for comparable events: who uploads, the CSV columns that matter, and whether the timer export can serve both. See [product.md](product.md#results-site-updates-research).
- Identify a smaller pilot event, its accountable organizer, and a support owner.

Exit gate: A specific, recurring problem has a measurable workload cost; a custom product has a credible advantage; a team and budget exist; external requirements have named owners. If not, recommend improving the incumbent workflow and stop the build.

## Phase 1 — Test the experience without live money

Indicative effort: 2–3 weeks. Depends on Phase 0. Priority: P0.

Deliverables:

- Clickable rider checkout for one day, both days, a junior entry, and an uncertain-license case.
- Organizer event builder and registration exception queue prototype.
- Check-in prototype showing ready/blocked states and bib assignment.
- Draft category/start-group model, state transitions, and timer export samples.
- Test with at least two organizers, two check-in volunteers, and five riders/parents. Participants may overlap with discovery.

Exit gate: Participants complete the core tasks without facilitator rescue; all serious confusion is resolved; the timer accepts the proposed sample format; scope is small enough to operate with the identified team. Proposed usability threshold: at least 90% unassisted completion across the core tasks, with no unresolved critical blocker.

## Phase 2 — Build the registration core

Indicative effort: 5–7 weeks. Depends on Phase 1 and a settled payment model. Priority: P0.

Build:

- Organization access, roles, ownership transfer, audit history, and event templates.
- Required multi-factor authentication (MFA) for every account, step-up re-verification for sensitive organizer actions, and audited account recovery. See [product.md](product.md#sign-in-and-account-security).
- Event/day/race/category/start-group setup and publishing checks.
- Mobile registration, guardian data, accepted waiver flow, and license-review status, behind one verification interface that can later use a live USAC source without reworking registration. See [product.md](product.md#future-usa-cycling-waiver-and-license-integration).
- Individual entries and two-day bundles with transparent totals.
- Capacity reservations and atomic enforcement of shared limits.
- Hosted payment flow, verified payment notifications, receipts, refunds, and a reconciliable ledger.
- Registration lookup, manual corrections, cancellation, and organizer-managed waitlists.
- Transactional email and basic operational reporting.

Verification:

- Concurrent checkout for the last place, expired reservations, and bundle rollback.
- Payment failure, timeout, duplicate notification, refund retry, and cancellation scenarios.
- Role access, private-data visibility, waiver/version integrity, and keyboard/mobile use.
- MFA enforcement for every account type, step-up prompts on sensitive organizer actions, recovery paths that cannot bypass MFA, and attempt rate limits.

Exit gate: Sandbox money and entry states reconcile; no overselling or duplicate processing in concurrency/retry tests; core flows pass with realistic categories. No public paid launch yet.

## Phase 3 — Make race day operable

Indicative effort: 3–5 weeks. Depends on Phase 2; USAC acceptance gates live sanctioned use. Priority: P0.

Build:

- Agreed license verification and exception-review workflow, with freshness/source visible.
- Search and QR check-in, bib-range rules, conflict detection, and repeat-scan handling.
- Timer export fields agreed from the road-results research, so results uploads need no retyping.
- Timestamped start lists, change reports, and tested timer exports.
- Minimal printable fallback roster and an access-restricted emergency-contact process.
- Payment/email failure alerts, backup/restore, incident handling, and support runbook.
- Organizer handoff guide and role-specific volunteer instructions.

Rehearsal:

- Run an entire mock weekend with sample data and staff other than the developer.
- Include field changes, missing licenses/signatures, refunds, duplicate names, and a lost-connection scenario.
- Measure check-in speed and validate every export with the timer.
- Reconcile the financial report with provider records and demonstrate backup recovery.

Exit gate: Registration lead, timer, treasurer, and pilot organizer accept the workflow; all P0 defects are closed; contingency and support ownership are documented.

## Phase 4 — Run a controlled live pilot

Indicative effort: 2–4 weeks of preparation and review, plus the chosen event date. Depends on Phase 3. Priority: P0.

Scope:

- One lower-risk cycling event with a named support team and manageable participant volume.
- Monitor registrations, payment callbacks, capacity, email delivery, and support demand.
- Use the new system as the single authoritative source for pilot entries. Any comparison exports must be read-only; avoid duplicate live payments or competing registration lists.
- Establish cancellation, outage, and communication procedures before opening entries.
- Collect rider/volunteer feedback and measure workload against the baseline.

Exit gate: No critical integrity failures, financial reconciliation is complete, exports are correct, and workload targets show meaningful improvement. If targets fail, fix the workflow and repeat a small pilot before expanding.

## Phase 5 — Prove a two-day weekend and handoff

Indicative effort: 3–5 weeks plus event scheduling. Depends on a successful Phase 4. Priority: P1.

Deliverables:

- Exercise both-day bundles, separate day entries, category changes, combined capacities, and bib rules in a full two-day rehearsal.
- Validate discounts, partial refunds, reporting per day, and final weekend reconciliation.
- Confirm that a successor organizer can clone the setup, update rules, and operate it without the original owner.
- Agree on support coverage and a rollback/cutover plan before any Berkeley Omnium adoption.

Exit gate: The committee explicitly chooses adoption based on demonstrated workload savings and operational readiness. Migrate only before registration opens, unless an exceptional migration plan has been separately agreed. Never assume existing waiver signatures or payment credentials can be moved.

## Phase 6 — Expand only from observed demand

Priority: P2. Estimates follow pilot evidence.

Candidate improvements, in likely order:

1. Automated waitlist offers with expiring reservations and explicit payment consent.
2. Better rider self-service changes, transfers, and refunds under organizer rules.
3. Series registration and reusable season bib assignments.
4. Live USAC waiver pull and license validation, as soon as USAC grants access and approves the workflow. This moves ahead of other P2 items when access arrives.
5. Additional cycling disciplines and other federation integrations.
6. Offline check-in synchronization, only with a defined conflict-resolution model.
7. Public event discovery once organizer operations are reliable.

Omnium scoring, timing hardware, weather, training tools, and general event ticketing remain outside this roadmap unless discovery establishes a compelling need.

## Priority definitions

| Priority | Meaning | Examples |
|---|---|---|
| P0 | Required before a safe, usable pilot | Correct capacity/payments, MFA sign-in, accepted waivers, license review, check-in, exports, support |
| P1 | Required for the intended two-day adoption | Validated weekend operations, successor handoff, complete day-by-day reconciliation |
| P2 | Improves a proven product | Automated waitlists, series features, additional disciplines |

## Responsibilities

These are roles to assign, not assumed staffing commitments.

| Role | Accountable for |
|---|---|
| Product owner | Scope, research, baseline, priorities, and go/no-go recommendation |
| Technical lead | Architecture, implementation, integrity, deployment, and recovery |
| Registration lead | Category rules, exception handling, check-in, and volunteer acceptance |
| Treasurer | Payment operating model, refunds, fees, payouts, and reconciliation |
| Federation liaison | USAC permissions and accepted licensing/waiver workflows |
| Timer / officials liaison | Start lists, export acceptance, and race-day change handling |
| Support owner | Opening-day and race-day response, incidents, and communications |

## Critical risks and decision points

| Risk | Response | Stop / change condition |
|---|---|---|
| Too little volunteer capacity | Dedicated delivery/support ownership; brief scheduled research sessions | No funded capacity or support owner: do not commit to a live event |
| Federation access unavailable | Seek approval early; prototype with labeled simulation; keep a verification interface ready for a live USAC source | No accepted licensing/waiver workflow: no sanctioned-event launch |
| Incumbent already solves the problem | Benchmark real tasks before building | No material workload benefit: improve existing setup |
| Money or capacity inconsistency | Transactional state design, retry protection, reconciliation tests | Any unresolved critical integrity defect blocks pilot |
| Timer incompatibility | Test actual files with the actual timer | No accepted export blocks race-day adoption |
| Weak connectivity | Connectivity requirement, printed fallback, incident rehearsal | No workable event-day contingency blocks launch |
| Successor cannot operate it | Early role testing, templates, ownership transfer, runbook | Developer remains essential to routine operations: defer expansion |

## Next actions

1. Assign a product owner and registration lead for discovery.
2. Obtain an anonymized existing category setup, timer export, exception list, and reconciliation example.
3. Schedule one workflow observation and the initial interviews.
4. Submit federation and payment-model questions before choosing an implementation stack.
5. Research the road-results.com update process with the timer and a recent promoter.
6. Complete the build-versus-improve decision and revise estimates from evidence.
