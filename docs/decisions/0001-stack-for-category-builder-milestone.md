# 0001. Stack for the category builder milestone

Status: Accepted
Date: 2026-11-14
Deciders: Project owner (acting product owner and technical lead)
Related: [product.md: road race and criterium category builder](../../product.md#1a-road-race-and-criterium-category-builder--p0), [roadmap.md: delivery status](../../roadmap.md#delivery-status)

## Context

The owner asked for a working organizer milestone: organizations, draft events, the category builder, start groups, capacity rules, a rider-facing preview, validation, and persistent storage. The roadmap lists the stack decision after the federation and payment questions. Those questions are still open, so this decision covers only what the milestone needs and is meant to be revisited before Phase 2 work that depends on payments, sign-in, or hosting.

Requirements that shaped the choice:

- Eligibility and validation rules must give the same answer in the organizer preview and on the server.
- Capacity checks must be atomic: two simultaneous requests cannot both take the last shared place.
- Published configurations are immutable versions; drafts autosave.
- A successor volunteer must be able to install and run it with one runtime and no database server.
- Tests must cover the category fixtures and the shared-capacity acceptance criterion.

## Options considered

### Option A: TypeScript on Node.js, React front end, SQLite

One language end to end. The domain rules (eligibility, validation, capacity math) live in one shared module imported by the browser and the server. SQLite runs in-process with no server to install, and its write transactions serialize writers, which makes the capacity check simple to get right. Drawbacks: SQLite allows one writer at a time and is a single file, which is fine for one organizer workspace but not for a hosted multi-club service. Two build tools (Vite for the browser, a TypeScript runner for the server).

### Option B: Python with Django and server-rendered pages

Mature admin, migrations, and auth. Validation would run on the server only; the live preview would need either round trips for every edit or a second copy of the rules in JavaScript. A good choice for the later hosted product, less good for a rule-heavy interactive editor.

### Option C: Hosted backend service (managed database plus serverless functions)

Fast to start, but it creates cloud accounts and secrets, which this milestone must not do, and it ties the project to a vendor before the hosting decision.

## Decision

Option A for this milestone: Node.js 20 or later, TypeScript, Fastify for the HTTP API, better-sqlite3 for storage, Zod for input schemas, React with Vite for the organizer interface, Vitest for unit and API tests, and Playwright for an end-to-end browser test.

Storage design:

- Each event's draft configuration is one validated JSON document with a revision number. Saves use optimistic concurrency: a save with an out-of-date revision is rejected rather than overwriting someone else's change.
- Publishing copies the draft into an immutable, numbered version.
- Test entries (simulated, no payment) are rows in their own table. Each entry is created inside a `BEGIN IMMEDIATE` transaction that rechecks every applicable limit before inserting.

## Consequences

- Easier: one rule implementation for preview and server; one command to install; tests run without external services.
- Harder: moving to a multi-club hosted service will need a server database (for example PostgreSQL) and a decision on keeping the document model or normalizing it. The capacity function is written against a small repository interface so the change is contained.
- Not decided here: payment provider, authentication and MFA methods, hosting, email, timer formats. Those stay in the [decision backlog](README.md#decision-backlog).
- Product impact (product.md): None. Requirements are unchanged; this records how the milestone implements them.
- Roadmap impact (roadmap.md): The delivery status table records the milestone. The stack backlog row now points here, and will be revisited before Phase 2 payment and sign-in work.
