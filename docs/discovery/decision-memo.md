# Phase 0 decision memo

Status: In progress. Evidence collection started November 14, 2026 with interview [D01](interviews/D01.md); no decision yet. Fill this in at the end of Phase 0 and link it from the Phase 0 row in [roadmap.md](../../roadmap.md#delivery-status).

Decision: _Continue to Phase 1 / Improve the current workflow and stop the build_  
Decided by: _product owner, role_  
Date: _date_

## Summary

_Two or three sentences: the decision, the main reason, and the biggest remaining risk._

## Exit-gate conditions

The roadmap's [Phase 0 exit gate](../../roadmap.md#phase-0--establish-the-case-to-build) has four conditions. All four must be met to continue. If any is not met, recommend improving the incumbent workflow.

| Condition | Met? | Evidence |
|---|---|---|
| A specific, recurring problem has a measurable workload cost | | Link to [workload-baseline.md](workload-baseline.md) summary and the top rows of [workflow-map.md](workflow-map.md) |
| A custom product has a credible advantage | | Link to [options-comparison.md](options-comparison.md) |
| A team and budget exist | | [Team and owners](#team-and-owners) below |
| External requirements have named owners | | [external-requirements.md](external-requirements.md#status) |

## Evidence collected

| Deliverable | Status | Where |
|---|---|---|
| Interviews: race director, registration lead, treasurer, timer | Partial: race director, registration lead, and treasurer answered by one person; timer not interviewed | [D01](interviews/D01.md) |
| Interviews: at least five riders or parents | 1 of 5. The project owner offered more answers as a racer (2026-11-15); those are D01 follow-ups, not new interviews. Four riders or parents outside the project are still needed | [D01](interviews/D01.md) (rider answers) |
| Sample data | Partial. Category setups are public on BikeReg and berkeleyomnium.com (2026-11-15) and already back the Berkeley fixtures. A timer export, an exception list, and a reconciliation example are not public and are still needed, anonymized | [fixtures](../fixtures/README.md) |
| Workflow observation | | Date and event |
| Workflow map | Partial, from D01 estimates | [workflow-map.md](workflow-map.md) |
| Workload baseline | Partial, estimates only | [workload-baseline.md](workload-baseline.md) |
| Options comparison | Evidence noted, not scored | [options-comparison.md](options-comparison.md#evidence-so-far-not-scored) |
| USAC questions sent and answered | | [external-requirements.md](external-requirements.md#usa-cycling) |
| Payment operating model assessed | | [external-requirements.md](external-requirements.md#payment-provider-operating-models) |
| road-results.com path researched | Public research done 2026-11-15; more research planned by the project owner; the timer's confirmation is still needed | [timer-export-review.md](../timer-export-review.md#what-public-sources-already-say) |
| Pilot event, organizer, and support owner identified | | [pilot-selection.md](pilot-selection.md) |

## Build versus improve

_The options comparison result, the recommendation, and the one reason that decided it._

## Team and owners

| Role | Name | Confirmed |
|---|---|---|
| Product owner | KC (project owner) | Yes, 2026-11-15 |
| Registration lead | KC (project owner) | Yes, 2026-11-15 |
| Developer or technical lead | | |
| USAC contact owner | KC (project owner) | Yes, 2026-11-15 |
| Payments owner | KC (project owner), sends the payment-model questions | Yes, 2026-11-15 |
| Pilot accountable organizer | | |
| Pilot support owner | | |

One person holds the product owner, registration lead, USAC contact, and payments roles, and is also interviewee D01 and a racer. That keeps decisions fast, but the Phase 0 gate still needs evidence from people outside the project (the timer, riders or parents, a second organizer) so the decision does not rest on one view. The technical lead, pilot accountable organizer, and pilot support owner are still open; the roadmap's handoff goal needs at least one of them to be someone else.

Budget: _who funds development, hosting, and payment fees, and for how long_

## If continuing

- Revised estimates for Phases 1 to 3, based on what was learned.
- Changes to [product.md](../../product.md) requirements or success measures that the evidence calls for.
- Risks to watch in Phase 1.

## If stopping

- The specific improvements to the current workflow, each with an owner.
- What happens to this repository (archive, keep for reference).
