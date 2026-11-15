# 0004. Hosted application stack and database

Status: Proposed
Date: 2026-11-14
Deciders: Project owner; technical lead
Related: [ADR 0001](0001-stack-for-category-builder-milestone.md), [architecture.md](../architecture.md), [operations.md](../operations.md), [Phase 2](../../roadmap.md#phase-2--build-the-registration-core), [decision backlog](README.md#decision-backlog)

## Context

ADR 0001 chose TypeScript, Node.js, React, and SQLite for the local prototype only, and says the hosted product needs its own decision. Phase 2 needs a hosted service that many riders reach at once on registration opening, with atomic enforcement of shared capacity limits, a reconcilable ledger, backups with a demonstrated restore, and monitoring (operations.md). A successor organizer, not the original developer, must be able to keep it running. Hosting cost matters for a small club.

## Options considered

### Option A: Keep the TypeScript application; move data to a managed PostgreSQL database; run on a managed application platform

- Pros: reuses all prototype code and tests; PostgreSQL transactions and row locks handle "last place" races across several app instances; managed backups and point-in-time restore are standard; a managed platform needs little server administration.
- Cons: data-access code must move from SQLite to PostgreSQL (queries are mostly portable; JSON columns and locking need care); monthly cost for two managed services.
- Risk: platform pricing changes; mitigated by keeping the app a plain Node.js container that can move.

### Option B: Keep SQLite on one managed server with continuous backup replication

- Pros: smallest change from the prototype; cheapest; SQLite's immediate transactions already enforce capacity on one machine.
- Cons: one server is a single point of failure on opening day and race morning; scaling past one instance means rework; restore drills and replication need more hands-on care from volunteers.
- Risk: a server failure at the worst moment with no second instance.

### Option C: Rebuild on a hosted backend platform (database, auth, and functions in one service)

- Pros: fewer moving parts to wire up; built-in auth could pair with ADR 0003.
- Cons: rewrites server logic that is already tested; capacity and ledger rules spread into platform-specific functions; stronger lock-in.

### Option D: Do nothing (stay local)

Blocks every hosted Phase 2 outcome. Not viable past Phase 1.

## Decision (proposed)

Recommend **Option A**: keep the TypeScript, Node.js, and React application and its tests; move persistence to a **managed PostgreSQL** database with transactions and row-level locking for capacity, holds, and the ledger; deploy the app as a container on a **managed application platform** with at least two instances during registration openings. Requirements for the providers chosen:

1. Automated daily backups plus point-in-time restore, with a restore rehearsed before the pilot (operations.md).
2. Staging and production kept separate; no real rider data in staging.
3. Secrets held in the platform's secret store, never in the repository.
4. Health checks, error alerts, and logs that a volunteer can read (operations.md monitoring signals).
5. A region and data-processing terms acceptable for U.S. rider and minor data.
6. Total monthly cost recorded and approved by the treasurer.

No specific vendors are chosen here, and nothing in this ADR authorizes creating cloud resources. Before acceptance, compare at least two platform and database providers against the six requirements, with dated prices, and record them here.

## Consequences

- The prototype's domain rules in `src/shared/` carry over unchanged; the server's SQL moves to PostgreSQL behind the same functions, with the concurrency tests (last place, holds, payments) rerun against it.
- Local development keeps working (PostgreSQL in a local container, or SQLite for the demo build if kept).
- DATA_MODEL.md must be updated when the schema moves.
- Next: provider comparison and cost approval, then an accepted version of this ADR, then a migration plan. Deployment remains blocked until ADR 0003 (sign-in) is accepted and implemented.

Product impact (product.md): None; requirements unchanged.
Roadmap impact (roadmap.md): Phase 2 hosting and data-store work waits on acceptance of this ADR.
