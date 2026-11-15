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

### Recommended providers (from the comparison below)

**Render for the app and Render Postgres for the database, on the Pro workspace plan: about $75 a month** ($25 Pro, about $21 for two small production instances and one staging instance, $19 for a 1 GB production database, $6 for a staging database, about $3 storage). Pro gives 7-day point-in-time restore (Hobby gives 3 days) and autoscaling. One vendor, a data-processing agreement on every plan, health checks built in, and restores go to a new database, which makes rehearsals safe. This is the simplest option for volunteers.

**Alternative: Render or Fly.io for the app with Neon Launch for the database, about $25 to $50 a month.** It's the cheapest pairing that still has point-in-time restore (up to 7 days on Launch), and Neon branches give cheap staging databases and restore rehearsals. Budget for Neon Scale if a SOC 2 report is needed.

Nothing in this ADR authorizes creating accounts or cloud resources.

## Provider comparison (sources retrieved 2026-11-14)

Prices change often; recheck before budgeting. "NC" means not confirmed.

| App platform | Fit against requirements 2 to 6 | 2 production + 1 staging instance | Notes |
|---|---|---|---|
| Render | Environments (2 on Hobby, unlimited on Pro), manual scaling on paid plans, health-check path, DPA and SOC 2 on all plans | About $21 (+$25 for Pro) | A service with a persistent disk can't run more than one instance; our app keeps no disk |
| Fly.io | Cheap US regions; DPA through support (community source only) | About $11 | Paid support from $29/mo |
| Railway | Replicas, logs 7 to 30 days, self-serve DPA | Usage-based, NC | Its Postgres has no point-in-time restore, so it fails requirement 1 |
| Google Cloud Run | Request-based billing, autoscaling, US regions | NC (pricing page didn't load fully) | Would pair with Cloud SQL, not compared |
| AWS App Runner | Closed to new customers since 2026-04-30 | n/a | Do not choose |
| DigitalOcean App Platform | $5 smallest container; DPA published | NC (conflicting multi-instance rules) | Dev database has no backups |

| PostgreSQL | Point-in-time restore | Backups | Smallest suitable cost | DPA | Notes |
|---|---|---|---|---|---|
| Render Postgres | Paid instances: 3 days Hobby, 7 days Pro | Logical backups 7 days | $19 (1 GB) + storage; $6 for staging | Yes | Restores to a new database |
| Neon | Paid plans; Launch up to 7 days, Scale up to 30 | Restore history window | About $5 to $25 (usage-based estimate) | Yes | Branches for staging; SOC 2 on Scale only |
| DigitalOcean Managed PG | Last 7 days | Daily plus write-ahead log | $15.15 | Yes | Standby price NC |
| Supabase (database only) | Paid add-on, 7 days about $100/mo | 7 days on Pro | About $125 | Yes | Expensive for this need |
| Crunchy Bridge | Within a 10-day window | 10 days | $70 (Hobby not for production) | NC | High availability doubles the price |
| Fly Managed Postgres | Yes (v2 clusters) | NC | $38 + storage | See Fly | High availability included |
| AWS RDS | Within configured retention | NC | NC (pricing didn't load) | AWS DPA | Most setup work for volunteers |

Caveats:
- None of the DPAs checked mention children. If any riders are under 13, COPPA obligations fall on the club, and a standard DPA does not cover them. Get legal review before collecting junior data in production.
- Each staging database roughly doubles database cost; Neon branches avoid most of that.
- Fly's restore retention and DigitalOcean's multi-instance rules are unconfirmed; ask the vendor before choosing either.

Sources: render.com/pricing; render.com/docs/scaling; render.com/docs/postgresql-backups; docs.fly.io/about/pricing; docs.fly.io/mpg/overview; community.fly.io (DPA thread); fly.io/changelog/managed-postgres-point-in-time-restore; railway.com/pricing; docs.railway.com/reference/backups; railway.com/legal/dpa; cloud.google.com/run/pricing; aws.amazon.com/apprunner; AWS RDS automated backups guide; aws.amazon.com/rds/postgresql/pricing; digitalocean.com/pricing/app-platform; DigitalOcean App Platform limits; DigitalOcean PostgreSQL features; digitalocean.com/pricing/managed-databases; digitalocean.com/legal/data-processing-agreement; neon.com/pricing; neon.com/docs/introduction/branching; neon.com/dpa; supabase.com/pricing; supabase.com/docs/guides/platform/backups; supabase.com/legal/dpa; docs.crunchybridge.com plans and backups pages.

Before acceptance: the treasurer approves the monthly cost, and legal review covers minors' data.

## Consequences

- The prototype's domain rules in `src/shared/` carry over unchanged; the server's SQL moves to PostgreSQL behind the same functions, with the concurrency tests (last place, holds, payments) rerun against it.
- Local development keeps working (PostgreSQL in a local container, or SQLite for the demo build if kept).
- DATA_MODEL.md must be updated when the schema moves.
- Next: provider comparison and cost approval, then an accepted version of this ADR, then a migration plan. Deployment remains blocked until ADR 0003 (sign-in) is accepted and implemented.

Product impact (product.md): None; requirements unchanged.
Roadmap impact (roadmap.md): Phase 2 hosting and data-store work waits on acceptance of this ADR.
