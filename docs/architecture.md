# Architecture

**Status: partly implemented.** The [local category builder](#what-exists-today-implemented) is built on the stack in [ADR 0001](decisions/0001-stack-for-category-builder-milestone.md). Everything under [Proposed logical components](#proposed-logical-components) beyond that build is still proposed. Components become decided only through accepted [architecture decision records](decisions/README.md).

The short version: CycleReg needs one source of truth with strong consistency for capacity and money, a clear boundary between public schedule pages and private organizer and rider data, and replaceable connections to Stripe (selected in [ADR 0002](decisions/0002-stripe-payments.md), integration Planned), an email provider, timer files, and (if approved) USA Cycling. The production stack stays open until Phase 0 answers the federation and payment questions, as [roadmap.md](../roadmap.md#next-actions) requires.

## What exists today (implemented)

```mermaid
flowchart LR
    subgraph Browser["Browser (React, Vite)"]
        UI["Organizer workspace: category schedule, field board, editor, setup, pools, publish"]
        PV["Rider preview with eligibility checker"]
        SH1["Shared rules: eligibility, capacity, validation"]
    end
    subgraph Server["Local server on 127.0.0.1 (Node.js, Fastify)"]
        API["JSON API under /api"]
        SH2["Same shared rules module"]
        REPO["Repository: drafts, versions, test entries"]
    end
    DB[("PostgreSQL database (local container)")]
    UI -->|"autosave with revision number"| API
    PV --> SH1
    UI --> SH1
    API --> SH2
    API --> REPO
    REPO -->|"transactions with a per-event lock"| DB
```

The browser and the server import the same rules module (`src/shared`), so the preview, the issue list, and the server's save and publish checks always agree. The organizer edits a working copy; changes autosave about half a second after typing stops, carrying the revision number they started from. The server refuses a save from an out-of-date revision instead of overwriting newer work. Every write that can change capacity, holds, payments, or bibs runs in a PostgreSQL transaction that first takes that event's lock, which makes the capacity check and the insert one indivisible step, even across two server processes ([ADR 0004](decisions/0004-hosted-stack-and-database.md)). Publishing copies the draft into an immutable numbered version. Rider checkout reads only the latest published version. An order holds every place it needs in one transaction for 10 minutes; held, confirmed, and test entries all count toward limits, and expired holds stop counting without a background job. Simulated payment notifications carry an attempt ID and are processed once. Nothing is sent to USA Cycling. Payments use the simulated provider or Stripe test mode. Organizer invitation emails are recorded in the database and sent through Amazon SES only when `EMAIL_MODE=ses` is set for the test-only beta ([ADR 0006](decisions/0006-transactional-email-amazon-ses.md)). Every API route except the health check, the public event list, and rider event pages requires a Clerk session token (passwordless email sign-in, [ADR 0003](decisions/0003-sign-in-and-mfa.md) Phase 2); the server maps it to one account per person and checks that account's role in the event's organization before any organizer action (`src/server/auth.ts`, roles in `src/shared/roles.ts`). Riders' orders belong to their account. Tests fake the session behind the same interface.

| Concern | Where it lives |
|---|---|
| Document schema (Zod) | `src/shared/schema.ts` |
| Eligibility (AND within a path, OR between paths) | `src/shared/eligibility.ts` |
| Capacity limits, rider counted once | `src/shared/capacity.ts` |
| Pre-publication checks | `src/shared/validation.ts` |
| Templates, duplicate, reorder | `src/shared/factory.ts` |
| Demonstration data (labeled examples) | `src/shared/demo.ts` |
| HTTP routes | `src/server/app.ts` |
| Transactions and storage | `src/server/repo.ts`, `src/server/db.ts` |
| Pricing, bundles, and discount precedence | `src/shared/pricing.ts` |
| Checkout rules: conflicts, selection checks, readiness | `src/shared/checkout.ts` |
| Orders, holds, simulated payment, license review | `src/server/orders.ts` |
| Interface | `src/web/` (rider checkout in `Register.tsx`, exception queue in `Registrations.tsx`) |

### Post-close bib allocation

Opt-in automatic bib allocation runs inside each listening API process, once on startup and then once a minute. Durable jobs and assignment links are stored in PostgreSQL ([DATA_MODEL.md](../DATA_MODEL.md#automatic_bib_jobs)). Multiple API instances may poll the same job; the event lock and completion check permit one allocation. The job rechecks published closing windows, outstanding checkout holds, and the enabling organizer's current permission. All days and job completion commit together, with failed allocations rolled back for retry. Shutdown drains the running job before closing the database. No external scheduler or cloud resource is provisioned; a stopped API resumes pending work when restarted.

## Document maintenance rule (mandatory)

Every change must review both [product.md](../product.md) and [roadmap.md](../roadmap.md) for impact.

- Update `product.md` when requirements, scope, user flows, business rules, acceptance criteria, or product decisions change.
- Update `roadmap.md` when priorities, dependencies, milestones, blockers, or delivery status change.
- When a change affects neither document, state that explicitly in the change summary instead of making cosmetic edits.
- Keep `README.md` and affected guides consistent with the implementation.
- Mark roadmap work complete only after its acceptance criteria are verified.
- Distinguish planned, implemented, and verified behavior.
- Do not maintain a competing product roadmap elsewhere.

## Constraints from the product brief

These come from [product.md](../product.md) and apply whatever stack is chosen.

| Constraint | Why it matters | Source section |
|---|---|---|
| Atomic capacity across categories, start groups, pools, and bundles | Two buyers must never both get the last shared place | Capacity and entry integrity |
| Idempotent payment handling with authoritative confirmation | Retries and duplicate notifications must not create duplicate orders, charges, or entries | Money and reporting; acceptance criteria |
| Versioned configuration and price snapshots | Paid entries keep the rules and price they were sold under | Changes after registration opens |
| Independent entry, payment, and readiness states | Paying does not clear a rider to race | Data model |
| Server-enforced roles and least-privilege data access | Volunteers see only what their job needs; emergency contacts stay restricted | Quality requirements |
| Append-only audit history | Money, category, waiver, capacity, and permission changes stay traceable | Quality requirements |
| Hosted payment flow, no stored card data | Keeps card data out of the system entirely | Money and reporting |
| Mobile-first, accessible interface | Riders use phones; volunteers use tablets outdoors | Quality requirements |
| Connectivity required for live changes, with a printable fallback | Full offline sync is deferred and must not be advertised | Race-day operations |
| Backups with a demonstrated restore, and failure monitoring | Race-morning failures need a known recovery path | Quality requirements |
| Load and recovery checks at twice the expected pilot opening peak | Registration opening is the busiest moment | Quality requirements |

## Proposed logical components

This is the target shape for the hosted product. Only the registration core rules and the organizer workspace exist today, running locally on one computer. Accepted for the hosted product: sign-in through Clerk (email sign-in on the free plan; MFA on Clerk Pro with SMS off for organizer roles, required before the live pilot) ([ADR 0003](decisions/0003-sign-in-and-mfa.md)), and the existing TypeScript app on Render with Render Postgres ([ADR 0004](decisions/0004-hosted-stack-and-database.md)).

```mermaid
flowchart LR
    subgraph Public["Public, no sign-in"]
        P1["Event and schedule pages"]
    end
    subgraph App["CycleReg application (proposed)"]
        R["Rider registration and checkout"]
        O["Organizer workspace and category builder"]
        C["Check-in"]
        CORE["Registration core: eligibility, pricing, capacity, state machines"]
        L["Ledger and reconciliation"]
        AUD["Audit history"]
        DB[("Single primary datastore")]
    end
    subgraph External["External services (none chosen)"]
        PAY["Stripe hosted Checkout, Planned"]
        MAIL["Transactional email provider"]
        FED["USA Cycling, if access is approved"]
        TIMER["Timer software, via agreed files"]
    end
    P1 --> R
    R --> CORE
    O --> CORE
    C --> CORE
    CORE --> DB
    L --> DB
    AUD --> DB
    R -->|"redirect to hosted checkout"| PAY
    PAY -->|"signed payment notifications"| L
    CORE -->|"confirmations and notices"| MAIL
    CORE -.->|"license checks, pending approval"| FED
    O -->|"start-list export files"| TIMER
```

This diagram shows logical parts, not services to deploy separately. Public schedule pages need no sign-in and show no private data. Rider checkout, the organizer workspace, and check-in all go through one registration core that owns eligibility, pricing, capacity, and state rules, so every checkout path enforces the same limits. One primary datastore keeps capacity and money consistent. The payment provider handles card entry on its own hosted page and reports results back through signed notifications that update the ledger. The dotted line to USA Cycling marks a connection that may never exist: [product.md](../product.md#integrations-and-dependencies) requires labeled simulated checks or a manual review process until USAC approves an integration. Timer exchange is by agreed files.

### Responsibilities

| Component | Owns | Does not own |
|---|---|---|
| Registration core | Eligibility evaluation, price calculation, reservations and capacity, entry and readiness transitions | Card data, email delivery |
| Organizer workspace | Category builder, impact previews, exception queue, corrections, exports | Rules enforcement (delegates to the core) |
| Rider registration | Profile, guardian entry, entry selection, waiver signing, receipts | Final price or capacity decisions |
| Check-in | Lookup, readiness display, bib assignment | Editing payments |
| Ledger | Order lines, fees, refunds, settlement references, reconciliation report | Deciding eligibility |
| Audit history | Who changed what, when, and why | Being editable |

## Data boundaries

- **Public:** published schedules, category descriptions, prices, start times, and, only if the organizer turns it on, a participant list without sensitive fields.
- **Rider-private:** profile, guardian relationships, orders, receipts, waiver status. Visible to the rider and to organizer roles that need it.
- **Restricted:** emergency contacts, license numbers, payment references, audit history. Limited to named roles.
- **Never stored:** card numbers and security codes.

Private pages must not be indexable by search engines. See [content-guide.md](content-guide.md#keep-private-data-out-of-public-pages).

## Open technical questions

Each of these needs an ADR before implementation depends on it. Options and tradeoffs are in the [decision backlog](decisions/README.md#decision-backlog).

1. Application stack (language, framework, front-end approach): decided in [ADR 0004](decisions/0004-hosted-stack-and-database.md)
2. Primary datastore and the capacity-locking approach: decided in [ADR 0004](decisions/0004-hosted-stack-and-database.md) (PostgreSQL)
3. Merchant-of-record and Stripe charge/transfer/settlement operating model (provider selected in ADR 0002)
4. USA Cycling license and waiver path
5. Hosting, backups, and monitoring: decided in [ADR 0004](decisions/0004-hosted-stack-and-database.md) (Render)
6. Authentication for riders, guardians, and organizers: decided in [ADR 0003](decisions/0003-sign-in-and-mfa.md) (Clerk; email sign-in for everyone, MFA for organizer roles before the live pilot, SMS off)
7. Transactional email provider: decided in [ADR 0006](decisions/0006-transactional-email-amazon-ses.md) (Amazon SES; organizer invitation emails implemented, test-only)
8. Timer export formats
9. Data retention and deletion periods

## How this document changes

When an ADR is accepted, update the matching section here, change its label from Proposed to the ADR's decision, and link the ADR. Keep this document describing the system as it is decided, and leave the reasoning in the ADRs.


## Planned multi-organization purchases

The [product requirements](../product.md#cross-organization-bundles-and-season-passes) distinguish same-event packages from cross-event, cross-organization bundles/season passes. The current event-scoped configuration and orders implement only same-event purchases. Planned passes require approved membership across organizations, accepted per-event configuration references, a shared purchase record with component entries and financial allocations, all-component capacity reservations, and role-isolated views. Design and migration details remain open; no cross-organization tables, approvals, settlements, or Stripe accounts exist today. Stripe provider selection does not settle the multi-party operating model.
