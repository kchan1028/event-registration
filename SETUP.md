# Set up local demos

Status: Implemented local demo. Commands checked November 15, 2026.

## Generated case-study collection

For broader race, pricing, capacity, checkout-recovery, and organizer-operation cases, load the collection into a separate local PostgreSQL database (created automatically on first use):

```bash
DATABASE_URL=postgres://cyclereg:cyclereg@127.0.0.1:5432/cyclereg_cases npm run seed:cases -- --owner you@example.com
DATABASE_URL=postgres://cyclereg:cyclereg@127.0.0.1:5432/cyclereg_cases npm run dev
```

The collection contains a multi-category criterium, shared-field road race, two-day omnium, empty draft, and large event. It also contains clearly labeled simulated payment states. List or load one case with `npm run seed:cases -- --list` and `npm run seed:cases -- --scenario omnium`. Remove only generated collection data with `npm run seed:cases -- --reset`. Keep the same `DATABASE_URL` for every command. `--owner` names the email you sign in with ([sign-in keys](docs/runbooks/local-setup.md#sign-in-keys)); without it the collection loads but your account cannot see it. Full rules and expected outcomes are in [fixture documentation](docs/fixtures/README.md#generated-race-case-studies).

Previously loaded generated cases keep their published snapshots; loader reuse does not rewrite their old race labels. To get the updated labels, use a fresh local database, or deliberately reset and reload only the generated collection with `npm run seed:cases -- --reset` followed by the load command above. Reset removes that collection’s fictional orders and history; it does not reset the standalone Berkeley events.

## Berkeley standalone events

This setup uses two standalone events: Berkeley Hills Road Race ($80) and Berkeley Streets Criterium ($60). Each has one day and one race, with Berkeley's draft category definitions. There is no package, series, podium nomination, extra-entry discount, surcharge, or fee in these two fixtures. Payments and rider details must be simulated.

Use Node.js 20 or later and npm. See [local setup](docs/runbooks/local-setup.md) for installation requirements and troubleshooting.

A database is required for event data, registrations, waivers, bibs, check-ins, and start lists. Locally it is PostgreSQL in a Docker container, set up once in [local setup](docs/runbooks/local-setup.md#what-you-need); the app creates its tables automatically. The general setup uses the `cyclereg` database. The steps below deliberately use a separate demo database, `cyclereg_berkeley`.

## Prepare and seed

From the repository root, install dependencies if you have not already done so:

```bash
npm ci
```

Seed a dedicated demo database. The seed creates the `cyclereg_berkeley` database on your local PostgreSQL if it does not exist yet:

```bash
DATABASE_URL=postgres://cyclereg:cyclereg@127.0.0.1:5432/cyclereg_berkeley npm run seed:berkeley -- --owner you@example.com
```

Use the email you sign in with ([sign-in keys](docs/runbooks/local-setup.md#sign-in-keys)). Expected result: `Owner: you@example.com.`, then `Demonstration events created in database cyclereg_berkeley`, followed by the organization and event IDs. The seed publishes both events so they appear in the rider event list. It creates no rider registrations, orders, or simulated capacity entries. Running it again reports `already exist` and preserves the existing event IDs, organizer edits, and published versions.

The database lives in your local PostgreSQL container and the credentials are local-only test values. Existing databases are not cleared or migrated to this fixture. Use this dedicated database for a catalog containing only the two events; seeding into a database with other events keeps those events.

## Run the demo

```bash
DATABASE_URL=postgres://cyclereg:cyclereg@127.0.0.1:5432/cyclereg_berkeley npm run dev
```

Open the rider event list at `http://127.0.0.1:5273/#/register`. It should list Berkeley Hills Road Race and Berkeley Streets Criterium. The organizer workspace is at `http://127.0.0.1:5273/`.

Keep `DATABASE_URL` identical when seeding and starting the app. The home page's other sample-loading buttons still load their existing fixtures; they are not needed for this demo.

Choose an event, select an eligible category, and use made-up rider information or a fictional demo rider. A single road-race entry totals $80; a single criterium entry totals $60. Demo mode allows testing outside the registration windows. Complete the sample waiver and simulated payment. Payment moves no money, and an unreviewed license remains in review.

Sign in with your email to open the organizer workspace ([sign-in keys](docs/runbooks/local-setup.md#sign-in-keys)); the rider event list is open without sign-in. MFA is not built, so use fictional details only, and keep the app on this computer at `127.0.0.1`. Stop the servers with Ctrl+C.

For a single-process built demo:

```bash
npm run build
```

```bash
DATABASE_URL=postgres://cyclereg:cyclereg@127.0.0.1:5432/cyclereg_berkeley npm start
```

Then open `http://127.0.0.1:3001/#/register`.

## Check the data

With the development servers running:

```bash
curl http://127.0.0.1:5273/api/public/events
```

Expected result: a JSON array containing the two event names, each with one race day and one race. Category definitions and fixture notes are in [events.md](docs/fixtures/events.md).

Run the automated checks with `npm run check`. The seed tests verify the isolated category references, prices, published catalog, persistence, safe reruns, and preservation of unrelated local data.

## Configuration and troubleshooting

| Setting | Default | Purpose |
|---|---|---|
| `DATABASE_URL` | `postgres://cyclereg:cyclereg@127.0.0.1:5432/cyclereg` | Local PostgreSQL database; use the same value for seeding and running |
| `PORT` or `API_PORT` | `3001` | API server port |
| `NODE_ENV=production` | unset | Serves the built web app from `dist/web` |
| `HOLD_MINUTES` | `10` | Checkout reservation duration |

If port 5273 or 3001 is already in use, stop your existing development server before running the demo. To keep that server running, use the built app on an unused port instead:

```bash
DATABASE_URL=postgres://cyclereg:cyclereg@127.0.0.1:5432/cyclereg_berkeley PORT=3106 npm start
```

Then open `http://127.0.0.1:3106/#/register`. Build first with `npm run build` as shown above.

Database tables and data behavior: [DATA_MODEL.md](DATA_MODEL.md). Other problems: [troubleshooting](docs/runbooks/troubleshooting.md). Keep the database local; it may contain test registrations.
