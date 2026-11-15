# Deploy to Render

Status: Planned. Nothing is deployed and no Render account, Blueprint, service, or database exists. The files below are ready in the repository; using them waits on the gates listed next.

[ADR 0004](../decisions/0004-hosted-stack-and-database.md) chose Render web services and Render Postgres on the Pro workspace plan. This runbook says what the repository already contains, what must be true before the first deploy, and the steps to follow then.

## Gates before the first deploy

All of these must be true. Until then, do not create a Blueprint or any Render resource.

1. Sign-in ([ADR 0003](../decisions/0003-sign-in-and-mfa.md): email sign-in on Clerk's free plan) is built, and the listen guard in `src/server/listen.ts` is removed in that same change. Until then the server refuses `HOST=0.0.0.0` at start-up, so a deploy fails its health check by design.
2. The treasurer has approved the monthly cost (ADR 0004 estimates about $75 a month on the Pro plan).
3. Legal review of minors' data is done, if any riders are under 13 (ADR 0004 caveats).
4. The project owner has said, in writing, to create the Render resources.
5. Before production holds any real rider data or takes a live payment: MFA is required for every organizer role (Phase 3; riders and guardians use email sign-in, [product.md](../../product.md#sign-in-and-account-security)). Until then, hosted use is staging and rehearsals with fictional data only. Agents must not create accounts or cloud resources on their own (AGENTS.md boundaries).

## What the repository contains

| File | Purpose |
|---|---|
| [`Dockerfile`](../../Dockerfile) | Builds the web app, then runs the API (which also serves the web app) as one Node.js process, so `SIGTERM` reaches the graceful shutdown. Listens on `PORT` (10000 by default). |
| [`.dockerignore`](../../.dockerignore) | Keeps tests, docs, local data, and secrets out of the image. |
| [`render.yaml`](../../render.yaml) | Render Blueprint: production service `cyclereg` (two `0.5c-512mb` instances, manual deploys) and staging service `cyclereg-staging` (one instance, deploys on each push to `main`), each with its own Render Postgres 17 database (`0.5c-1g` and `0.1c-256mb`). Both databases accept private-network connections only. `DATABASE_URL` comes from the database; no secrets are in the file. |
| [`src/server/listen.ts`](../../src/server/listen.ts) | Listen address from `HOST` (default `127.0.0.1`). Refuses any network address until sign-in exists. |

Every service uses `/api/health` as its health check: it answers 503 while the database cannot be reached ([operations.md](../operations.md#monitoring-and-alerts)). Migrations run when each instance starts, under a database lock, so two instances starting together migrate once.

## Build and run the image locally

This works today and needs only Docker and the local PostgreSQL from [local setup](local-setup.md):

```bash
docker build -t cyclereg:local .
```

```bash
docker run --rm -e DATABASE_URL=postgres://cyclereg:cyclereg@host.docker.internal:5432/cyclereg cyclereg:local
```

Expected result: the log shows `Server listening at http://127.0.0.1:10000`. The app listens inside the container only (the guard keeps it on 127.0.0.1), so check it from inside:

```bash
docker exec $(docker ps -q --filter ancestor=cyclereg:local) node -e "fetch('http://127.0.0.1:10000/api/health').then(r=>r.text()).then(console.log)"
```

Expected output: `{"ok":true}`. Stop the container with Ctrl+C; it shuts down cleanly. Setting `HOST=0.0.0.0` makes it exit at once with "Refusing to listen on 0.0.0.0", which is the guard working.

Last verified: November 15, 2026 with Docker 27.4 and PostgreSQL 17.

## First deploy (once every gate is met)

1. In the Render Dashboard, on the Pro workspace, create a Blueprint from this repository's `render.yaml` (Blueprints > New Blueprint Instance). Review the four resources and their plans before applying.
2. Wait for both databases to become available, then for the staging service's first deploy. Check `https://<staging service>.onrender.com/api/health` returns `{"ok":true}`.
3. Seed staging with fictional data only (no real rider data in staging): run `npm run seed:cases` from the staging service's shell.
4. Start the first production deploy by hand (production has automatic deploys turned off).
5. Rehearse a restore before the pilot: restore the production database to a new database at a point in time, point a staging copy at it, and check the data ([operations.md](../operations.md#backups-and-recovery)). Record the date here.
6. Update this runbook's status, [roadmap.md](../../roadmap.md#phase-2--build-the-registration-core), and [SECURITY.md](../../SECURITY.md).

## Notes

- The image includes dev dependencies (Vite and tsx), about 390 MB. A smaller image that compiles the server ahead of time is possible later; it is not needed for correctness.
- Render keeps the previous deploy running until the new one passes its health check, and sends `SIGTERM` with a 30-second grace period (`maxShutdownDelaySeconds`) to instances it replaces.
