# Architecture decision records

An architecture decision record (ADR) is a short document that captures one significant decision: the context, the options considered, what was chosen, and the consequences. ADRs let a successor understand why the system looks the way it does without asking the person who built it.

**Current state:** two ADRs are accepted. [0002](0002-stripe-payments.md) selects Stripe for Planned payments while leaving the merchant/settlement model open. The prototype stack is recorded in [0001](0001-stack-for-category-builder-milestone.md). The backlog below lists decisions still open, with known options and tradeoffs. Options listed in the backlog are not recommendations.

## Document maintenance rule (mandatory)

Every change must review both [product.md](../../product.md) and [roadmap.md](../../roadmap.md) for impact.

- Update `product.md` when requirements, scope, user flows, business rules, acceptance criteria, or product decisions change.
- Update `roadmap.md` when priorities, dependencies, milestones, blockers, or delivery status change.
- When a change affects neither document, state that explicitly in the change summary instead of making cosmetic edits.
- Keep `README.md` and affected guides consistent with the implementation.
- Mark roadmap work complete only after its acceptance criteria are verified.
- Distinguish planned, implemented, and verified behavior.
- Do not maintain a competing product roadmap elsewhere.

An accepted ADR often changes `product.md` (a product decision or dependency) or `roadmap.md` (a dependency resolved or a blocker removed). Update them in the same change.

## When to write an ADR

Write one when a choice:

- is expensive or slow to reverse (stack, datastore, payment provider, hosting);
- affects money, capacity, privacy, or federation compliance; or
- closes an open decision listed in `product.md` or this backlog.

Routine choices (a library for date formatting, a variable name) do not need one.

## Process

1. Copy the template below into `docs/decisions/NNNN-short-title.md`, using the next unused number.
2. Set the status to Proposed and fill in the context and options. Include "do nothing" or "keep the current process" when it is a real option.
3. Ask the accountable role to review (see [roadmap.md](../../roadmap.md#responsibilities)); for example, the treasurer for payment decisions.
4. Mark it Accepted or Rejected with the date. Update [architecture.md](../architecture.md), the index below, and any affected source documents in the same change.
5. Never rewrite an accepted ADR's decision. To change it, write a new ADR that supersedes it and mark the old one Superseded with a link.

Statuses: Proposed, Accepted, Rejected, Superseded.

## Template

```markdown
# NNNN. <Decision title>

Status: Proposed | Accepted | Rejected | Superseded by NNNN
Date: <YYYY-MM-DD>
Deciders: <roles>
Related: <product.md or roadmap.md sections>

## Context
What problem forces a decision now? Which requirements and constraints apply?

## Options considered
### Option A
Pros, cons, cost, and risks.
### Option B
...

## Decision
What was chosen, in one or two sentences.

## Consequences
What becomes easier, what becomes harder, what must happen next.
Product impact (product.md):
Roadmap impact (roadmap.md):
```

## Index

| Number | Title | Status | Date |
|---|---|---|---|
| [0001](0001-stack-for-category-builder-milestone.md) | Stack for the category builder milestone | Accepted | 2026-11-14 |
| [0002](0002-stripe-payments.md) | Stripe for planned payments | Accepted | 2026-11-14 |

## Decision backlog

These are unresolved. They are ordered roughly by when the roadmap needs them. "Needed by" refers to roadmap phases.

| Decision | Needed by | Options known so far | Main tradeoffs |
|---|---|---|---|
| Build versus improve the current setup | Phase 0 exit | Improve the incumbent workflow; buy more support; build CycleReg | The roadmap stops the build if a custom product shows no credible advantage |
| USA Cycling license and waiver path | Before any sanctioned pilot (Phase 3 gate) | Approved platform integration; organizer manual review with paper waivers; a hybrid | Approval may be slow or unavailable; manual paths add volunteer work, which is the problem being solved |
| Merchant-of-record and Stripe operating model (provider selected in ADR 0002) | Phase 2; expand before Phase 6 passes | Stripe organizer account; Connect charge/transfer models subject to review | Who handles disputes, payouts, and tax; onboarding effort for each club |
| Application stack | Phase 2 for the core | Prototype decided in ADR 0001 (TypeScript, Node.js, React, SQLite). Revisit for the hosted product after Phase 0 | Successor maintainability and hosting cost matter more than novelty; choose after the federation and payment questions (roadmap next actions) |
| Primary datastore and capacity enforcement | Phase 2 | Prototype: SQLite with immediate write transactions (ADR 0001). Hosted: a relational database with transactions and row locks; atomic conditional counters; a queue that serializes reservations | Correctness under concurrency first; then operational simplicity for a small team |
| Hosting, backups, and monitoring | Phase 2 | Managed platform; self-managed cloud resources | Managed services cost more but need less volunteer expertise; restore must be demonstrated either way. Signals to monitor are in [operations.md](../operations.md#monitoring-and-alerts) |
| Support coverage and incident response | Phase 3 exit | Volunteer support owner per event; paid support; a hybrid | Who answers on opening day and race morning, freeze lengths, and response targets. See [operations.md](../operations.md) |
| Authentication | Phase 2 | First factor: email magic links, passwords, or third-party sign-in. Second factor (required for all accounts): passkeys, authenticator apps, SMS fallback for riders and guardians only (never organizers) | MFA is required by [product.md](../../product.md#sign-in-and-account-security); choose methods that occasional riders and guardians can complete, and phishing-resistant factors for organizers |
| Transactional email provider | Phase 2 | To be compared | Delivery status and suppression handling are required |
| Timer export format | Phase 1 (samples), Phase 3 (tested) | Whatever the actual timer accepts | Must be tested with the real timer; no assumed standard |
| Data retention and deletion periods | Before the pilot | To be set with the club and federation requirements | Waiver and financial records may need long retention; other data should be kept as briefly as possible |
| Product name | Before any public page | CycleReg (working name, availability not checked) | Trademark and domain availability |
| Repository license | Before sharing the code | Private; an open-source license; source-available | Reuse by other clubs versus control of support burden |
