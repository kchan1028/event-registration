# Deploy to Render

Status: Planned. Nothing is deployed and no Render account, Blueprint, service, or database exists. The files below are ready in the repository; using them waits on the gates listed next.

[ADR 0004](../decisions/0004-hosted-stack-and-database.md) chose Render web services and Render Postgres on the Pro workspace plan. This runbook says what the repository already contains, what must be true before the first deploy, and the steps to follow then.

## Gates before the first deploy

All of these must be true. Until then, do not create a Blueprint or any Render resource.

1. Done (November 15, 2026): email sign-in ([ADR 0003](../decisions/0003-sign-in-and-mfa.md), Clerk's free plan) is built and every API route except the health check, the public event list, rider event pages, the Stripe webhook (trusted only by its verified signature), and, outside production when `RESEND_WEBHOOK_SECRET` is set, the Resend delivery webhook (trusted only by its verified signature; production refuses that secret, so the route stays off) requires it. The listen guard was removed in the same change. Still needed before the first deploy: a Clerk instance for each hosted environment (staging and production), created by the owner, with email code or link sign-in only (no passwords, no SMS); its keys go in the Render Dashboard, never in the repository.
2. The treasurer has approved the monthly cost (ADR 0004 estimates about $75 a month on the Pro plan).
3. Legal review of minors' data is done, if any riders are under 13 (ADR 0004 caveats).
4. The project owner has said, in writing, to create the Render resources.
5. Before production holds any real rider data or takes a live payment: the final pre-launch security gate must pass, including organizer MFA and sensitive-action re-verification (riders and guardians use email sign-in, [product.md](../../product.md#sign-in-and-account-security)). Until then, hosted use is staging and rehearsals with fictional data only. Agents must not create accounts or cloud resources unless the owner asks for it in the current task.

## What the repository contains

| File | Purpose |
|---|---|
| [`Dockerfile`](../../Dockerfile) | Builds the web app, then runs the API (which also serves the web app) as one Node.js process, so `SIGTERM` reaches the graceful shutdown. Listens on `PORT` (10000 by default). |
| [`.dockerignore`](../../.dockerignore) | Keeps tests, docs, local data, and secrets out of the image. |
| [`render.yaml`](../../render.yaml) | Render Blueprint: production service `cyclereg` (two `0.5c-512mb` instances, manual deploys) and staging service `cyclereg-staging` (one instance, deploys on each push to `main`), each with its own Render Postgres 17 database (`0.5c-1g` and `0.1c-256mb`). Both databases accept private-network connections only. `DATABASE_URL` comes from the database; no secrets are in the file. |
| [`src/server/listen.ts`](../../src/server/listen.ts) | Listen address from `HOST` (default `127.0.0.1`; `render.yaml` sets `0.0.0.0`). |
| [`src/server/auth.ts`](../../src/server/auth.ts) | Sign-in: verifies Clerk session tokens. The server starts without `CLERK_SECRET_KEY` only outside production on `127.0.0.1`, `localhost`, or `::1`; anywhere else it will not start without that key. Set `CLERK_AUTHORIZED_PARTIES` to the site's own origin. |

Every service uses `/api/health` as its health check: it answers 503 while the database cannot be reached ([operations.md](../operations.md#monitoring-and-alerts)). Migrations run when each instance starts, under a database lock, so two instances starting together migrate once.

## Build and run the image locally

This needs Docker, the local PostgreSQL from [local setup](local-setup.md), and the Clerk development keys in your local `.env` (also from local setup):

```bash
docker build --build-arg VITE_CLERK_PUBLISHABLE_KEY="$(grep '^VITE_CLERK_PUBLISHABLE_KEY=' .env | cut -d= -f2-)" -t cyclereg:local .
```

```bash
docker run --rm --env-file .env -e DATABASE_URL=postgres://cyclereg:cyclereg@host.docker.internal:5432/cyclereg cyclereg:local
```

Expected result: the log shows `Server listening at http://127.0.0.1:10000`. With `HOST` unset the app listens inside the container only, so check it from inside:

```bash
docker exec $(docker ps -q --filter ancestor=cyclereg:local) node -e "fetch('http://127.0.0.1:10000/api/health').then(r=>r.text()).then(console.log)"
```

Expected output: `{"ok":true}`. Stop the container with Ctrl+C; it shuts down cleanly. Without `CLERK_SECRET_KEY` the container exits at once with "CLERK_SECRET_KEY is not set".

Last verified: November 15, 2026 with Docker 27.4 and PostgreSQL 17, before sign-in was added. The sign-in variables above have not been run in the image yet.

## First deploy (once every gate is met)

1. In the Render Dashboard, on the Pro workspace, create a Blueprint from this repository's `render.yaml` (Blueprints > New Blueprint Instance). Review the four resources and their plans before applying. Enter each service's `CLERK_SECRET_KEY`, `VITE_CLERK_PUBLISHABLE_KEY`, and `CLERK_AUTHORIZED_PARTIES` when asked, and confirm the publishable key reaches the Docker build (the signed-out page must show "Sign in with email", not "Sign-in is not set up").
2. Wait for both databases to become available, then for the staging service's first deploy. Check `https://<staging service>.onrender.com/api/health` returns `{"ok":true}`.
3. Seed staging with fictional data only (no real rider data in staging): run `npm run seed:cases` from the staging service's shell.
4. Start the first production deploy by hand (production has automatic deploys turned off).
5. Before the pilot, [rehearse and measure a hosted restore](../testing/test-plan.md#measure-hosted-recovery-before-the-pilot) using a fictional source with the backup configuration intended for the pilot and a separate restore target. Repoint and redeploy an isolated application copy, reconcile its records and capture timing and results in the rehearsal record or pull request. Render documents a ten-minute minimum age for a requested recovery point. An immediate request may therefore require an older point than the approved gap permits. Wait for a suitable point and include that wait in the time to safe reopening. If none will become available, record a recovery hold. The rehearsal fails once the approved reopening limit passes, even if no restore has started. [Render Postgres recovery and backups](https://render.com/docs/postgresql-backups#perform-a-recovery)
6. Update this runbook's status, [roadmap.md](../../roadmap.md#phase-2--build-the-registration-core), and [SECURITY.md](../../SECURITY.md).

## Upgrades and rollbacks across migration 44

Status: Planned. Not exercised, because nothing is deployed.

A server from before migration 44 can start Stripe checkout without recording it. Normal deploys overlap old and new instances, so production and staging keep staff hold release off unless `STAFF_HOLD_RELEASE` is `on`.

To turn it on, after the first upgrade or after upgrading again from a rollback:

1. Deploy with `STAFF_HOLD_RELEASE` unset or `off`.
2. Confirm that every instance from before migration 44 has stopped, including its shutdown grace period.
3. Mark the holds those instances could have sent to checkout. They then expire or go to the treasurer:

```sql
UPDATE orders SET stripe_checkout_tracked = false WHERE status IN ('held', 'payment_failed');
```

4. Set `STAFF_HOLD_RELEASE=on` and deploy.

Before rolling back to a version from before migration 44, set `STAFF_HOLD_RELEASE=off`, deploy, and confirm every instance that had it on has stopped. Only then deploy the older version. Rehearse both directions on staging before production uses staff release.

## Notes

- The image includes dev dependencies (Vite and tsx), about 390 MB. A smaller image that compiles the server ahead of time is possible later; it is not needed for correctness.
- Render keeps the previous deploy running until the new one passes its health check, and sends `SIGTERM` with a 30-second grace period (`maxShutdownDelaySeconds`) to instances it replaces.
