# Set up local demos

Status: Implemented local demo. Commands checked November 15, 2026.

## Generated case-study collection

For broader race, pricing, capacity, checkout-recovery, and organizer-operation cases, load the collection into a separate local PostgreSQL database (created automatically on first use):

```bash
DATABASE_URL=postgres://cyclereg:cyclereg@127.0.0.1:5432/cyclereg_cases npm run seed:cases -- --owner you@example.com
DATABASE_URL=postgres://cyclereg:cyclereg@127.0.0.1:5432/cyclereg_cases npm run dev
```

The collection contains a multi-category criterium, shared-field road race, two-day omnium, empty draft, and large event. It also contains clearly labeled simulated payment states. List or load one case with `npm run seed:cases -- --list` and `npm run seed:cases -- --scenario omnium`. Remove only generated collection data with `npm run seed:cases -- --reset`. Keep the same `DATABASE_URL` for every command. `--owner` names the email you sign in with ([sign-in keys](docs/runbooks/local-setup.md#sign-in-keys)); without it the collection loads but your account cannot see it. Full rules and expected outcomes are in [fixture documentation](docs/fixtures/README.md#generated-race-case-studies).

Previously loaded generated cases keep their published snapshots; loader reuse does not rewrite their old race labels. To get the updated labels, use a fresh local database, or deliberately reset and reload only the generated collection with `npm run seed:cases -- --reset` followed by the load command above. Reset removes that collection’s fictional orders and history; it does not reset the Berkeley Omnium.

Named loaders use reserved fixture organization IDs. They preserve existing local workspace/event IDs; organization names are display labels, not lookup keys. A reserved workspace with additional events or non-demo draft/published configurations refuses shared loading.

## Team time trial read-only research examples

BBC TTT and Pinole TTT currently load **published read-only research examples**, not working TTT registration demos. TT/team entry, roster consent, team capacity, interval starts, and team timing are not implemented. No road race or criterium is substituted. Historical sources connect the two names as related versions; they are not verified separate upcoming events. See the [BBC case](docs/case-studies/organizer-templates/berkeley-bicycle-club-team-time-trial.md) and [Pinole case](docs/case-studies/organizer-templates/pinole-team-time-trial.md).

```bash
npm run seed:bbc-ttt -- --owner organizer@example.test
npm run seed:pinole-ttt -- --owner organizer@example.test
```

Use the same `DATABASE_URL` as the app and sign in with that email. Open the examples in `#/register`; they are labeled research, and registration is unavailable. Organizer edits still require sign-in. The BBC draft uses the archived March 9, 2008 identity. Pinole's November 15, 2026 day is explicitly a required **research placeholder, not a race date** because its edition/date is unresolved. Both contain no race/categories and accept no entries/payments. Only the explicit demo research flag permits empty publication; normal empty events still fail validation. Reruns preserve IDs, edits, published versions, and unrelated events. Existing older local research drafts require an explicit flag update and publication; reruns do not overwrite them. Do not add a fake road race to publish a team time trial.

## Additional Northern California historical demos

| Demo | Scope | Seed command |
|---|---|---|
| [Wente](docs/case-studies/organizer-templates/wente-vineyards-classic.md) | April 29, 2018 identity; three explicitly synthetic road fields, not a verified full program | `npm run seed:wente -- --owner organizer@example.test` |
| [Mount Hamilton](docs/case-studies/organizer-templates/mount-hamilton-classic.md) | May 26, 2019 full-course schedule, nine starts and 14 categories; Observatory event excluded | `npm run seed:mount-hamilton -- --owner organizer@example.test` |
| [Chico](docs/case-studies/organizer-templates/chico-stage-race.md) | Selected Pro/1 and Women P/1/2/3 road/crit components, March 17–18, 2018; four categories, not full stage-race admission | `npm run seed:chico -- --owner organizer@example.test` |
| [Sunset](docs/case-studies/organizer-templates/sunset-criterium.md) | July 29, 2017 San Rafael geared sample: three slots; kids/fixed-gear activities excluded | `npm run seed:sunset -- --owner organizer@example.test` |

Use the same `DATABASE_URL` for seeding and running the app. Each command publishes one empty historical demo at `http://127.0.0.1:5273/#/register`, grants the specified owner access, and preserves IDs, draft edits, published versions, and unrelated data on rerun. Every selection uses a $40 test price, zero fees/surcharges, a synthetic 60-rider start limit, annual licenses, and draft adult eligibility requiring review. Case studies specify which dates, times, and lengths are sourced versus synthetic. Use fictional riders, the sample waiver, and simulated payment only. These demos do not announce future events or implement stage progression, general classification, professional admission, or equipment-specific race registration.

## Red Kite historical criterium sample

This is an explicit three-round sample of the 2017 Red Kite Omnium, not its full 14-round mixed-format series. It publishes one empty event containing rounds #2 (March 19), #5 (April 23), and #9 (July 9): three races, 33 starts, and 42 categories. Test assumptions are $40 entries, 60 riders per shared start, 30-minute races, and draft adult eligibility requiring organizer review. No series pass, package, points, or standings is implemented. See the [case study and full-series gaps](docs/case-studies/organizer-templates/red-kite-series.md).

```bash
npm run seed:red-kite -- --owner organizer@example.test
```

Use the same `DATABASE_URL` when seeding and running the app. The sample appears at `http://127.0.0.1:5273/#/register`. Reruns preserve IDs, edits, publication, and other local events. Use fictional data and simulated payment only.

## San Francisco Grand Prix historical demo

This studies the September 4, 2005 professional road race, not Il Giro or an upcoming event. It publishes one empty demo with one start/category, the historical 108.1-mile course description, and explicit test assumptions: 09:00 start, $40 entry, 60-rider limit, and draft adult annual-license PRO eligibility. Organizer/license review remains mandatory; individual checkout does not implement professional team admission. See the [case study](docs/case-studies/organizer-templates/san-francisco-grand-prix.md).

```bash
npm run seed:sf-grand-prix -- --owner organizer@example.test
```

Keep `DATABASE_URL` identical when seeding and running the app. Open the event at `http://127.0.0.1:5273/#/register`. Reruns preserve IDs, edits, and published versions. Berkeley, Burlingame, and unrelated local data are preserved. Use fictional riders and simulated payment only.

## Burlingame historical demo

The organizer lists Burlingame Criterium as on hiatus. This demo studies the June 25, 2017 program, not an upcoming edition. It publishes one event with seven starts and nine categories, no prefilled entries, and explicit test assumptions: $40 entries and 60 riders per shared start. Eligibility requires review; 40-minute durations are test values. See the [case study](docs/case-studies/organizer-templates/burlingame-criterium.md).

```bash
npm run seed:burlingame -- --owner organizer@example.test
```

Use the same `DATABASE_URL` when seeding and running the app. The event appears in `http://127.0.0.1:5273/#/register`. Reruns preserve IDs, edits, and published versions; Berkeley and other local events remain untouched. Payments and rider information must be simulated.

## Berkeley Omnium

This setup publishes one event, Berkeley Omnium 2027, containing Berkeley Hills Road Race (April 17, $80) and Berkeley Streets Criterium (April 18, $60). These are the standard rates; junior, collegiate and women’s rates use the [lowest eligible price](docs/case-studies/organizer-templates/berkeley-omnium.md#organizer-approved-demo-pricing). Its standard $130 two-race package includes a podium nomination subject to organizer review. The category definitions and eligibility remain draft reference data. Payments and rider details must be simulated.

Use Node.js 22 or later and npm. See [local setup](docs/runbooks/local-setup.md) for installation requirements and troubleshooting.

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

Use the email you sign in with ([sign-in keys](docs/runbooks/local-setup.md#sign-in-keys)). Expected result: `Owner: you@example.com.`, then `Demonstration events created in database cyclereg_berkeley`, followed by the organization and event IDs. The seed publishes the combined Omnium so it appears in the rider event list. It creates no rider registrations, orders, or simulated capacity entries. Running it again reports `already exist` and preserves the existing event IDs, organizer edits, and published versions.

The database lives in your local PostgreSQL container and the credentials are local-only test values. Existing databases are not cleared or migrated to this fixture. Previously seeded standalone Berkeley events remain untouched; use a fresh database for the combined-only catalog. Use this dedicated database for a catalog containing only the combined Omnium; seeding into a database with other events keeps those events.

## Run the demo

```bash
DATABASE_URL=postgres://cyclereg:cyclereg@127.0.0.1:5432/cyclereg_berkeley npm run dev
```

Open the rider event list at `http://127.0.0.1:5273/#/register`. It should list Berkeley Omnium 2027, with both race days. The organizer workspace is at `http://127.0.0.1:5273/`.

Keep `DATABASE_URL` identical when seeding and starting the app. The home page's **Load Berkeley Omnium** button and `seed:omnium` remain separate organizer working-copy loaders: they create a draft with simulated capacity entries. They are not needed for this published, empty demo.

Choose an event, select an eligible category, and use made-up rider information or a fictional demo rider. A single road-race entry totals $80; a single criterium entry totals $60 before the configured $15 day-of surcharge. One entry in each race costs $130 as a package; an additional criterium race costs $20. Fees are zero. Demo mode allows testing outside the registration windows. Complete the sample waiver and simulated payment. Payment moves no money, and an unreviewed license remains in review.

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

Expected result: a JSON array containing Berkeley Omnium 2027, with two race days, two races, and 54 categories. Category definitions and fixture notes are in [events.md](docs/fixtures/events.md).

For changes to this seed, run `npm run typecheck` and `npx vitest run tests/berkeley-events.test.ts`. Reserve `npm run check` and the full browser suite for phase completion, predeployment, or an explicit owner request ([test plan](docs/testing/test-plan.md)). The seed tests verify the isolated category references, prices, published catalog, persistence, safe reruns, and preservation of unrelated local data.

## Configuration and troubleshooting

| Setting | Default | Purpose |
|---|---|---|
| `DATABASE_URL` | `postgres://cyclereg:cyclereg@127.0.0.1:5432/cyclereg` | Local PostgreSQL database; use the same value for seeding and running |
| `PORT` or `API_PORT` | `3001` | API server port |
| `NODE_ENV=production` | unset | Serves the built web app from `dist/web` |
| `HOLD_MINUTES` | `10` | Checkout reservation duration; keep short. Stripe mode requires no more than 1409 minutes because its fixed session deadline is the hold deadline plus 31 minutes (not startup-validated) |

If port 5273 or 3001 is already in use, stop your existing development server before running the demo. To keep that server running, use the built app on an unused port instead:

```bash
DATABASE_URL=postgres://cyclereg:cyclereg@127.0.0.1:5432/cyclereg_berkeley PORT=3106 npm start
```

Then open `http://127.0.0.1:3106/#/register`. Build first with `npm run build` as shown above.

Database tables and data behavior: [DATA_MODEL.md](DATA_MODEL.md). Other problems: [troubleshooting](docs/runbooks/troubleshooting.md). Keep the database local; it may contain test registrations.
