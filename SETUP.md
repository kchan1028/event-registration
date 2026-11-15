# Set up the Berkeley demo

Status: Implemented local demo. Commands checked November 14, 2026.

This setup uses two standalone events: Berkeley Hills Road Race ($80) and Berkeley Streets Criterium ($60). Each has one day and one race, with Berkeley's draft category definitions. There is no package, series, podium nomination, extra-entry discount, surcharge, or fee in these two fixtures. Payments and rider details must be simulated.

Use Node.js 20 or later and npm. See [local setup](docs/runbooks/local-setup.md) for installation requirements and troubleshooting.

A database is required for event data, registrations, waivers, bibs, check-ins, and start lists. Locally it is a SQLite file created and migrated automatically; no database server is needed. The general setup defaults to `data/cyclereg.sqlite`. The steps below deliberately use a separate demo database.

## Prepare and seed

From the repository root, install dependencies if you have not already done so:

```bash
npm ci
```

Seed a dedicated demo database:

```bash
DB_PATH=data/berkeley-demo.sqlite npm run seed:berkeley
```

Expected result: `Demonstration events created in data/berkeley-demo.sqlite`, followed by the organization and event IDs. The seed publishes both events so they appear in the rider event list. It creates no rider registrations, orders, or simulated capacity entries. Running it again reports `already exist` and preserves the existing event IDs, organizer edits, and published versions.

The database is a local SQLite file created automatically and ignored by Git. No database server or credentials are required. Existing databases are not cleared or migrated to this fixture. Use this dedicated file for a catalog containing only the two events; seeding into a database with other events keeps those events.

## Run the demo

```bash
DB_PATH=data/berkeley-demo.sqlite npm run dev
```

Open the rider event list at `http://127.0.0.1:5273/#/register`. It should list Berkeley Hills Road Race and Berkeley Streets Criterium. The organizer workspace is at `http://127.0.0.1:5273/`.

Keep `DB_PATH` identical when seeding and starting the app. The home page's other sample-loading buttons still load their existing fixtures; they are not needed for this demo.

Choose an event, select an eligible category, and use made-up rider information or a fictional demo rider. A single road-race entry totals $80; a single criterium entry totals $60. Demo mode allows testing outside the registration windows. Complete the sample waiver and simulated payment. Payment moves no money, and an unreviewed license remains in review.

The prototype has no sign-in. Keep it on this computer at `127.0.0.1`; do not deploy it or expose it to a network. Stop the servers with Ctrl+C.

For a single-process built demo:

```bash
npm run build
```

```bash
DB_PATH=data/berkeley-demo.sqlite npm start
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
| `DB_PATH` | `data/cyclereg.sqlite` | Local SQLite file; use the same value for seeding and running |
| `PORT` or `API_PORT` | `3001` | API server port |
| `NODE_ENV=production` | unset | Serves the built web app from `dist/web` |
| `HOLD_MINUTES` | `10` | Checkout reservation duration |

If port 5273 or 3001 is already in use, stop your existing development server before running the demo. To keep that server running, use the built app on an unused port instead:

```bash
DB_PATH=data/berkeley-demo.sqlite PORT=3106 npm start
```

Then open `http://127.0.0.1:3106/#/register`. Build first with `npm run build` as shown above.

Database tables and data behavior: [DATA_MODEL.md](DATA_MODEL.md). Other problems: [troubleshooting](docs/runbooks/troubleshooting.md). Keep the database local and uncommitted; it may contain test registrations.
