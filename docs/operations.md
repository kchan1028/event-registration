# Operations (proposed)

**Status: Proposed.** Nothing here is in use. The application runs locally; there is no hosted production service, demonstrated monitoring, or staffed support rota. This document sets out how CycleReg is meant to be operated once it exists, so that operating needs shape the build instead of being added after it. The requirements it draws on are in [product.md](../product.md#quality-requirements); the phases that deliver them are in [roadmap.md](../roadmap.md#phase-3--make-race-day-operable).

The short version: every event has a named support owner and escalation route, the riskiest moments (registration opening and race morning) get a change freeze and a rehearsed fallback, money and capacity problems are treated as critical, and a successor organizer must be able to run all of it without the developer.

## Document maintenance rule (mandatory)

Every change must review both [product.md](../product.md) and [roadmap.md](../roadmap.md) for impact.

- Update `product.md` when requirements, scope, user flows, business rules, acceptance criteria, or product decisions change.
- Update `roadmap.md` when priorities, dependencies, milestones, blockers, or delivery status change.
- When a change affects neither document, state that explicitly in the change summary instead of making cosmetic edits.
- Keep `README.md` and affected guides consistent with the implementation.
- Mark roadmap work complete only after its acceptance criteria are verified.
- Distinguish planned, implemented, and verified behavior.
- Do not maintain a competing product roadmap elsewhere.

This document describes the operating model. Step-by-step procedures belong in `docs/runbooks/`; the phone handoff and check-in volunteer guides exist for local rehearsals, while accepted recovery procedures remain Proposed. See [documentation-guide.md](documentation-guide.md#where-things-live).

The [check-in volunteer guide](runbooks/race-day-check-in.md) covers desk preparation, role boundaries, blocked riders, uncertain outcomes and shift handoff. It is source-checked documentation, not evidence of staff independence or an approved offline process.

The first phone-first desk increment has a [walk-up registration runbook](runbooks/walkup-registration.md). It reuses participant checkout and existing check-in; it does not complete the operational rehearsals below.

## Who does what

These map to the roles in [roadmap.md](../roadmap.md#responsibilities). They are roles to assign, not people already committed.

| Role | Operating duties |
|---|---|
| Support owner | First contact for organizer and volunteer problems on opening day and race day; runs incidents; sends status updates |
| Technical lead | Fixes system faults, restores from backup, rotates secrets, approves changes during a freeze |
| Registration lead | Works the exception queue; decides rider-level corrections; trains check-in volunteers |
| Treasurer | Refund approvals, payout checks, reconciliation against provider statements |
| Timer / officials liaison | Confirms start-list snapshots and exports; reports race-day field changes back |
| Event owner (organizer role) | Publishes the event's support contact; transfers ownership to a successor |

Each event must publish, before registration opens:

- the support owner's name and how to reach them on opening day and race morning;
- a backup contact if the support owner cannot respond; and
- where volunteers find the printable fallback and the event runbook.

A volunteer should never have to guess who handles a race-morning failure.

## Operating calendar for an event

```mermaid
flowchart LR
    A["Setup and publishing checks"] --> B["Pre-opening freeze"]
    B --> C["Registration opening"]
    C --> D["Open registration period"]
    D --> E["Race-week freeze"]
    E --> F["Race morning"]
    F --> G["Close-out and reconciliation"]
    G --> H["Handoff and review"]
```

An event moves through these stages in order. The two freezes protect the busiest moments: registration opening, when demand peaks, and race morning, when there is no time to recover from a bad change. Close-out reconciles money and entries before the event is handed to its next owner.

| Stage | What happens | Exit check |
|---|---|---|
| Setup and publishing checks | Organizer configures categories, limits, prices, bib ranges, and questions; publishing checks run | Preview of every day reviewed by the registration lead |
| Pre-opening freeze (proposed: 48 hours) | No code or configuration changes except fixes approved by the technical lead | Support owner confirmed; monitoring and alerts tested |
| Registration opening | Support owner watches payments, capacity, and email for the first hours | No stuck reservations, failed payment notifications, or bounced confirmations left unexplained |
| Open registration period | Exception queue worked at least every few days; corrections logged with a reason | Queue has no item older than the agreed limit |
| Race-week freeze (proposed: from 72 hours before the first start) | Changes limited to rider-level corrections and approved fixes | Start-list snapshot sent to the timer; fallback roster printed |
| Race morning | Check-in, bib assignment, field changes, timer updates | Every change after the snapshot appears in the change report |
| Close-out | Refunds settled, ledger reconciled with provider statements, exports archived | Treasurer signs off reconciliation |
| Handoff and review | Lessons recorded; template cloned for next year; ownership transferred if needed | A successor can open the event and its runbook without the original owner's credentials |

Freeze lengths are proposals for the pilot organizer to confirm.

## Incident severity

An incident is anything that stops riders registering, stops volunteers checking riders in, or makes money, capacity, or entry records wrong.

| Severity | Examples | Response target (proposed) |
|---|---|---|
| Critical | Oversold place, duplicate charge, lost confirmed entry, unexplained ledger difference, private data exposed, checkout down during registration opening, check-in unusable on race morning | Support owner engaged immediately; technical lead paged; registration paused if records are being corrupted |
| High | Payment notifications delayed, confirmation emails not sending, timer export rejected, a role sees data it should not | Same day, or within the hour on opening day or race morning |
| Normal | A single rider's record wrong, a confusing message, a slow report | Next working session |

The critical examples match the integrity failures that [product.md](../product.md#success-measures) says must be zero, and any unresolved critical defect blocks the pilot ([roadmap.md](../roadmap.md#critical-risks-and-decision-points)).

## Handling an incident

1. **Stop the damage.** If money, capacity, or entries are being recorded wrongly, pause registration for the affected event. Pausing is preferred over letting bad records pile up.
2. **Tell people.** The support owner posts a short status to organizers and, if riders are affected, a rider-facing notice that says what is wrong and what to do. Do not promise a time you cannot meet.
3. **Fix or fall back.** If check-in cannot be restored quickly, use the printable roster as a reference and hold affected bib handovers. The [reference-only outage rehearsal](runbooks/race-day-check-in.md#reconcile-a-reference-only-outage) tests lead escalation and recovery using fictional data. Connectivity is required for live changes; offline sync does not exist and must not be promised.
4. **Reconcile.** Before reopening, compare entries, capacity counts, and the ledger against the payment provider's records. Correct with an audit reason; never edit history.
5. **Record it.** Write a short incident note: what happened, who was affected, what was done, and what will prevent it. Link it from the event's review.

## Monitoring and alerts

Proposed signals, from [product.md](../product.md#quality-requirements). Tools are not chosen; see the hosting, backups, and monitoring entry in the [decision backlog](decisions/README.md#decision-backlog).

| Signal | Why | Alert goes to |
|---|---|---|
| Failed or delayed payment notifications | Paid riders without entries, or entries without payment | Technical lead, support owner |
| Capacity reservations older than their expiry | Places held that no one can buy | Technical lead |
| Checkout error rate during opening | Riders cannot register | Support owner |
| Email bounces and suppressions | Riders miss confirmations or race notices | Support owner |
| Sign-in and second-factor failure spikes | Riders locked out, or an attack | Technical lead |
| Backup job failures | Recovery would not be possible | Technical lead |
| `GET /api/health` failing (HTTP 503 means the app is up but cannot reach the database) | Nobody can register or check in | Technical lead |

Alerts must not include card data, emergency contacts, or other restricted fields.

Implemented in the local build (November 15, 2026): `GET /api/health` runs a database query and answers 503 when it fails, so a platform health check (Render's health-check path, per [ADR 0004](decisions/0004-hosted-stack-and-database.md)) can take an instance out of service. On `SIGTERM` the server stops taking new requests, finishes the ones in progress, and closes its database connections. The [local database health check](testing/test-plan.md#local-database-health-check) verifies the outage and return to HTTP 200 without restarting the application. No platform is configured yet. The planned Render setup is in [docs/runbooks/deploy-render.md](runbooks/deploy-render.md).

## Backups and recovery

The [local fictional-data restore procedure](runbooks/local-backup-restore.md) exercises a separate logical archive/restore, record comparison and application recovery checks without touching the working database. It is technical rehearsal preparation; hosted scheduled/off-site recovery, agreed targets and staff acceptance remain open.

- Back up the primary datastore on a schedule set by the hosting ADR, and keep copies somewhere a single failure cannot remove.
- A backup counts only after a restore has been demonstrated. Phase 3 requires that demonstration during the mock-weekend rehearsal ([roadmap.md](../roadmap.md#phase-3--make-race-day-operable)).
- Record a target for how much data may be lost and how long a restore may take, agreed with the pilot organizer before the pilot.
- After any restore, reconcile entries and the ledger with the payment provider before reopening.

## Changes and releases

- Every change follows [CONTRIBUTING.md](../CONTRIBUTING.md) and is reviewed before it reaches the running system.
- No releases during a freeze unless the technical lead approves a fix and the support owner knows it is going out.
- Configuration changes to a published event go through the impact preview; paid entries keep the price and rules they were sold under ([product.md](../product.md#changes-after-registration-opens)).
- Each release has a known way back: a previous version to return to, and a note of any data change that cannot be reversed.

## Access and secrets

- Every person uses their own account (organizers with MFA enforced at the final pre-launch security gate, before the live pilot), including on shared check-in tablets ([product.md](../product.md#sign-in-and-account-security)).
- Give each role the least access its job needs. Remove access when a volunteer's event ends.
- Secrets live in the hosting platform's secret store, never in the repository or in chat. Rotate them when someone with access leaves, and after any suspected exposure.
- Access to restricted data (emergency contacts, license numbers, payment references, audit history) is logged.

## Rider data requests

Retention and deletion periods are not set; they are in the [decision backlog](decisions/README.md#decision-backlog) and must be decided before the pilot. Until then:

- route requests to see, correct, or delete rider data to the event owner and the support owner;
- keep waiver and financial records that the federation or tax rules may require, even when other data is deleted; and
- record each request and its outcome in the audit history.

## Handoff to a successor

The [organizer handoff guide](runbooks/organizer-handoff.md) documents the existing organization-wide role transfer, retained access, successor checks and uncertain-result recovery. Its local separate-account rehearsal is technical evidence only; actual successor/volunteer acceptance and external responsibilities remain open.

The handoff acceptance criterion in [product.md](../product.md#core-flows-and-acceptance-criteria) is the test: a second authorized organizer can operate the event and its runbook without the original owner's credentials. To support it:

- keep each event's runbook, support contacts, and fallback documents inside the organizer workspace, not in one person's email;
- use event templates so next year's setup starts from this year's verified configuration; and
- transfer ownership through the product, never by sharing a login.

The [readiness checklist](research/prelaunch-readiness.md#race-day-readiness-checklist), [failure recovery matrix](research/prelaunch-readiness.md#payment-and-failure-recovery-matrix) and [Proposed measurement protocol](research/prelaunch-readiness.md#proposed-launch-measurement-specification) identify evidence for the existing operating requirements. They do not establish staff independence or approve telemetry collection.

## Open questions

1. Who funds and staffs support after launch? ([product.md](../product.md#open-decisions), question 3)
2. What freeze lengths and response targets does the pilot organizer accept?
3. What data loss and restore-time targets are acceptable for registration opening and race morning?
4. Which monitoring and alerting tools fit a small volunteer team? (hosting ADR)
5. What retention periods apply to waivers, financial records, and everything else?

### November 16, 2026 research follow-up

The existing questions above remain open. Owners below are roles to assign, not commitments. Research and synthetic scenario design can proceed under the provisional assumptions; no answer is inferred from silence.

| Existing question | Owner / why it matters | Provisional assumption, blocked work and revisit |
|---|---|---|
| 1, support coverage | Project owner; named primary/deputy needed for independent operation | Assume no committed coverage. Live event support remains blocked; revisit before hosted pilot rehearsal. Includes responsibility for paid-but-not-ready follow-up and measurement review. |
| 2, freeze/response targets | Product owner with registration lead; race-morning disruption needs an agreed response | Existing proposed values are not approved. Rehearsal design proceeds; accepted incident response remains blocked until organizer review before rehearsal. |
| 3, data-loss/restore targets | Technical lead and treasurer, unassigned; restore must preserve money, capacity and entries | No approved RPO/RTO assumed. Isolated synthetic restoration can be planned; recovery sign-off blocked until targets agreed, before hosted rehearsal. |
| 4, monitoring/tools | Technical/support lead, unassigned; failures need an accountable receiver | No monitoring service, alert thresholds or after-hours rota accepted. Synthetic fault cases proceed; hosted operational sign-off blocked pending routing/tool review. |
| 5, retention | Project owner/privacy responsibility unassigned; waivers, financial records, paper rosters and opaque telemetry keys remain personal data | No retention period or analytics collection approved. Synthetic measurements proceed; real-data collection blocked until access/retention approval before pilot. |

Related decisions remain in [product.md decisions 4–6 and 8–10](../product.md#open-decisions), [ADR 0005](decisions/0005-merchant-and-settlement-model.md), [federation questions](usac-questions.md) and [timer review](timer-export-review.md). The new research does not resolve merchant liability, event-year waiver/licensing approval, timer acknowledgement or safe device/accessibility arrangements. Revisit those existing records before the corresponding live-money, sanctioned-event or physical rehearsal gate.
