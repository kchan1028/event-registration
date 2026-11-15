# Local setup

Last verified: November 15, 2026 on macOS 26 (Apple silicon) with Node.js 20.19, npm 10.8, Docker 27.4, and PostgreSQL 17, by the technical lead.

This runs the organizer workspace on your own computer, listening on `127.0.0.1`. Sign-in is a passwordless emailed code or link through a Clerk development instance ([ADR 0003](../decisions/0003-sign-in-and-mfa.md), Phase 2). MFA is not built yet, so use fictional data only.

For the two standalone Berkeley demo events, follow [Set up the Berkeley demo](../../SETUP.md). It seeds a separate database and publishes both events for rider testing.

## What you need

- Node.js 20 or later, from [nodejs.org](https://nodejs.org/). Check with `node -v`.
- npm (comes with Node.js).
- Git.
- PostgreSQL 17 on your computer. The simplest way is [Docker Desktop](https://www.docker.com/products/docker-desktop/) and this container (local-only test credentials, listening on `127.0.0.1` only):

  ```bash
  docker run -d --name cyclereg-postgres -e POSTGRES_USER=cyclereg -e POSTGRES_PASSWORD=cyclereg -e POSTGRES_DB=cyclereg -p 127.0.0.1:5432:5432 postgres:17
  ```

  Expected result: Docker prints a container ID. Check it with `docker exec cyclereg-postgres pg_isready -U cyclereg`, which prints `accepting connections`. After a restart, run `docker start cyclereg-postgres`. A PostgreSQL you installed another way works too; set `DATABASE_URL` (below) to match it.
- Optional, for the browser test: about 300 MB of disk space for the Playwright Chromium download.
- A Clerk development instance for sign-in (free plan). The project owner creates it; see [Sign-in keys](#sign-in-keys). The tests do not need it.

Nothing connects to USA Cycling or a payment provider. The app creates and migrates its tables on start ([DATA_MODEL.md](../../DATA_MODEL.md#storage-and-migrations)).

## Steps

1. Clone the repository and open its folder.
2. Install dependencies:

   ```bash
   npm ci
   ```

   Expected result: npm finishes without errors.

3. Add the Clerk development keys to `.env` in the repository folder, as in [Sign-in keys](#sign-in-keys). Without them the API refuses to start and says `CLERK_SECRET_KEY is not set`.

4. Optional: load the Berkeley Omnium into your local database, owned by the email you will sign in with:

   ```bash
   npm run seed:omnium -- --owner you@example.com
   ```

   Expected result: lines starting `Owner: you@example.com.` and `Demonstration events created in database cyclereg`. You can also load it from the home page once signed in. `npm run seed:demo -- --owner you@example.com` loads the fictional example weekend instead.

5. Start the development servers:

   ```bash
   npm run dev
   ```

   Expected result: the API logs `Server listening at http://127.0.0.1:3001` and Vite prints `Local: http://127.0.0.1:5273/`.

6. Open `http://127.0.0.1:5273/` in a browser and select **Sign in with email**. Clerk emails you a code or link. Then create an organization (you become its owner), or select **Load Berkeley Omnium**. Use **Team and roles** under an organization to give other people a role by email.

To run the built app from one process instead (as the end-to-end test does):

```bash
npm run build
```

```bash
npm start
```

Then open `http://127.0.0.1:3001/`.

## Check it worked

```bash
curl http://127.0.0.1:5273/api/health
```

Expected output: `{"ok":true}`. The health check also queries the database: if PostgreSQL is stopped while the app runs, it answers HTTP 503 with `{"ok":false,...}` (see [troubleshooting](troubleshooting.md#the-api-or-the-tests-cannot-connect-to-postgresql)).

Stopping the app with Ctrl+C (or a `SIGTERM` from a hosting platform) lets requests in progress finish and closes the database connections before it exits.

## Run the checks

```bash
npm run check
```

This runs the TypeScript check, the unit and API tests (Vitest), and a production build. The API tests fake sign-in (`tests/support/auth.ts`), so they need no Clerk keys. The API tests need the PostgreSQL server above: they create one migrated template database per run, clone a fresh database for each test (so tests never see each other's data), and drop them all at the end. Your `cyclereg` database is not touched. Set `TEST_DATABASE_URL` to use another server; its user must be allowed to create databases.

```bash
npx playwright install chromium
```

```bash
npm run test:e2e
```

The end-to-end test builds the app, drops and recreates a throwaway `cyclereg_e2e` database on the same server (`E2E_DATABASE_URL` overrides it), starts the app on port 3105, and drives the organizer workflow in Chromium. It uses a local-only test sign-in (`AUTH_MODE=test`, fictional `.test` emails) instead of Clerk; the server refuses that mode with `NODE_ENV=production` or on any address other than this computer. The reset script refuses any database whose name does not end in `_e2e` or `_test`.

To regenerate the README screenshots:

```bash
SCREENSHOTS=1 npx playwright test e2e/screenshots.spec.ts
```

## Configuration

| Setting | Purpose | Default | Secret? |
|---|---|---|---|
| `DATABASE_URL` | PostgreSQL connection string for the app and the seed scripts | `postgres://cyclereg:cyclereg@127.0.0.1:5432/cyclereg` | Locally no (test credentials). A hosted database password is a secret and belongs in the platform's secret store |
| `TEST_DATABASE_URL` | PostgreSQL server for the API tests (any database on it; tests create their own) | `postgres://cyclereg:cyclereg@127.0.0.1:5432/cyclereg` | No |
| `E2E_DATABASE_URL` | Throwaway database for the end-to-end test, reset on each run | `postgres://cyclereg:cyclereg@127.0.0.1:5432/cyclereg_e2e` | No |
| `PORT` or `API_PORT` | API server port | `3001` (`10000` in the Docker image) | No |
| `HOST` | Address the API listens on ([deploy runbook](deploy-render.md)) | `127.0.0.1` | No |
| `CLERK_SECRET_KEY` | Clerk secret key (`sk_test_...` for a development instance). The API verifies sign-in with it and will not start without it | none | **Yes.** Only in `.env` or the platform's secret store; never commit, log, or paste it |
| `VITE_CLERK_PUBLISHABLE_KEY` | Clerk publishable key (`pk_test_...`), built into the web app | none | No (public by design), but keep it in `.env` with the secret key |
| `CLERK_AUTHORIZED_PARTIES` | Comma-separated origins allowed to send session tokens, for example `http://127.0.0.1:5273` locally or the site's own origin when hosted | unset (any origin) | No |
| `SEED_OWNER_EMAIL` | Same as `--owner` for the seed scripts | unset | No |
| `NODE_ENV=production` | Makes the API also serve the built web app from `dist/web` | unset | No |
| `SERVE_WEB=1` | Serves the built web app without production mode (used by the end-to-end test) | unset | No |
| `AUTH_MODE=test`, `VITE_AUTH_MODE=test` | Local-only test sign-in for the end-to-end test. Refused in production and on network addresses | unset | No |
| `HOLD_MINUTES` | How long rider checkout holds places before payment | `10` | No |
| `STRIPE_SECRET_KEY` | Stripe test-mode secret key (`sk_test_...` or `rk_test_...`). Set it to use Stripe hosted Checkout instead of the simulated payment. Live keys are refused | unset (simulated payment) | **Yes.** Only in `.env` or the platform's secret store |
| `STRIPE_WEBHOOK_SECRET` | Webhook signing secret (`whsec_...`). Required when `STRIPE_SECRET_KEY` is set | none | **Yes** |
| `PUBLIC_APP_URL` | Origin Stripe sends riders back to after paying. Required in production when Stripe is on | `http://127.0.0.1:5273` outside production | No |

## Sign-in keys

Sign-in uses a Clerk development instance on the free plan. The project owner creates the Clerk account and instance; agents and scripts never create accounts.

1. In the Clerk Dashboard, create an application. Under sign-in options, turn on **Email address** with **Email verification code** and/or **Email verification link**. Turn off **Password**, **Phone number**, and social sign-in. Clerk applies its own sign-in attempt rate limits and lockout.
2. Copy the two keys from **API keys** into a file named `.env` in the repository folder (the main checkout, or each worktree you run from). `.env` is gitignored:

   ```bash
   CLERK_SECRET_KEY=sk_test_replace_me
   VITE_CLERK_PUBLISHABLE_KEY=pk_test_replace_me
   ```

3. Restart `npm run dev`. The API and Vite read `.env` when they start. Real environment variables win over `.env`.

Never commit `.env`, and never paste the secret key into an issue, chat, log, or screenshot. If it leaks, roll it in the Clerk Dashboard.

## Stripe test mode (optional)

Without Stripe keys, checkout uses the simulated payment. To try Stripe hosted Checkout in test mode, the project owner uses their own Stripe account's sandbox; agents never create accounts or use live keys.

1. In the Stripe Dashboard, switch to test mode (sandbox) and copy the secret key (`sk_test_...`) into `.env` as `STRIPE_SECRET_KEY`.
2. Forward webhooks to the local API with the Stripe CLI and copy the `whsec_...` secret it prints into `.env` as `STRIPE_WEBHOOK_SECRET`:

   ```bash
   stripe listen --forward-to 127.0.0.1:3001/api/payments/stripe/webhook --events checkout.session.completed,checkout.session.async_payment_succeeded,checkout.session.async_payment_failed,checkout.session.expired
   ```

3. Restart `npm run dev`. The review step now shows **Pay on Stripe (test mode)**. Pay with a Stripe test card such as `4242 4242 4242 4242`; the order confirms when the webhook arrives.

Each person signs in with their own email (one account per email). Organizations created before sign-in existed have no owner; give yourself one by reseeding with `--owner`, or start over below. If you seeded with `--owner` but never signed in with that email, the owner invitation expires after 14 days and signing in then gives no role; reseed with the same `--owner` to renew it.

## Start over

To empty your local data, drop the database:

```bash
docker exec cyclereg-postgres dropdb -U cyclereg --force cyclereg
```

The next `npm run dev` (or `npm run seed:*`) creates the database again, empty, and its tables. The app creates a missing database only on a local host (`localhost`, `127.0.0.1`, or `::1`), so a separate demo database such as `cyclereg_berkeley` needs no setup step either. Data from the earlier SQLite file (`data/cyclereg.sqlite`) is not imported; reseed with `npm run seed:omnium -- --owner you@example.com` or `npm run seed:demo -- --owner you@example.com`.

## Common problems

See [troubleshooting.md](troubleshooting.md).

## Automatic bib assignment after registration closes

In **Race-day check-in → Bib ranges**, save a range for every day that needs one, choose an automatic sort, and select **Enable after-close assignment**. This opts the event into one recorded allocation job. **Refresh automatic status** shows its current reason or result; **Cancel automatic assignment** stops a pending job without changing existing bibs. If allocation completed first, cancellation reports that no pending job was cancelled; refresh shows the completed result.

The running API checks once a minute and on startup. Every non-archived published category must have closed in the event time zone (or be explicitly closed), and active checkout holds must settle or expire. An unset closing time or the demo's registration-window bypass keeps the job waiting. Use fictional data while organizer MFA remains unbuilt. Range exhaustion leaves all days unchanged, and the job retries after the ranges are corrected. A completed job stays complete; later walk-ups use normal check-in assignment. Re-enabling creates another job, preserving the earlier history.

The API must keep running for the close-time check. A restart catches up pending jobs. This is an in-process worker, not a provisioned cloud scheduler. Assignment reserves a number and never authorizes bib handoff while readiness is blocked.


## Protected bib changes

Managers open **Reassign bibs** at check-in and select riders with existing assignments. Choose **Enter each new number** or **Resequence selected riders**, enter a reason, and preview. Review the current/proposed numbers, ranges, checked-in days, and affected start lists before applying. Only selected assignments change; unchanged rows keep their history. A shared weekend bib affects every applicable race across both days.

Check-in staff can use **Change bib** on a rider card, including a number allocated before check-in. Individual corrections use the same preview and historical-change rules. A missing, conflicting, or stale preview is refused. Re-preview after changing any choice or after another staff action changes the relevant state. Every successful change records who requested it and why, and saves new start-list revisions; timer locks remain attached to the version originally sent. A number change never clears readiness or checks a rider in.
