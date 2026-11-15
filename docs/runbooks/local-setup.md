# Local setup

Last verified: November 15, 2026 on macOS 26 (Apple silicon) with Node.js 20.19, npm 10.8, Docker 27.4, and PostgreSQL 17, by the technical lead.

This runs the organizer workspace on your own computer. It has no sign-in, so it listens only on `127.0.0.1` and must not be exposed to a network or deployed.

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

No cloud account or API key is needed. Nothing connects to USA Cycling or a payment provider. The app creates and migrates its tables on start ([DATA_MODEL.md](../../DATA_MODEL.md#storage-and-migrations)).

## Steps

1. Clone the repository and open its folder.
2. Install dependencies:

   ```bash
   npm ci
   ```

   Expected result: npm finishes without errors.

3. Optional: load the Berkeley Omnium into your local database:

   ```bash
   npm run seed:omnium
   ```

   Expected result: a line starting `Demonstration events created in database cyclereg`. You can also load it from the home page. `npm run seed:demo` loads the fictional example weekend instead.

4. Start the development servers:

   ```bash
   npm run dev
   ```

   Expected result: the API logs `Server listening at http://127.0.0.1:3001` and Vite prints `Local: http://127.0.0.1:5273/`.

5. Open `http://127.0.0.1:5273/` in a browser. Create an organization, or select **Load Berkeley Omnium**.

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

Expected output: `{"ok":true}`.

## Run the checks

```bash
npm run check
```

This runs the TypeScript check, the unit and API tests (Vitest), and a production build. The API tests need the PostgreSQL server above: they create one migrated template database per run, clone a fresh database for each test (so tests never see each other's data), and drop them all at the end. Your `cyclereg` database is not touched. Set `TEST_DATABASE_URL` to use another server; its user must be allowed to create databases.

```bash
npx playwright install chromium
```

```bash
npm run test:e2e
```

The end-to-end test builds the app, drops and recreates a throwaway `cyclereg_e2e` database on the same server (`E2E_DATABASE_URL` overrides it), starts the app on port 3105, and drives the organizer workflow in Chromium. The reset script refuses any database whose name does not end in `_e2e` or `_test`.

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
| `PORT` or `API_PORT` | API server port | `3001` | No |
| `NODE_ENV=production` | Makes the API also serve the built web app from `dist/web` | unset | No |
| `HOLD_MINUTES` | How long rider checkout holds places before payment | `10` | No |

## Start over

To empty your local data, drop and recreate the database:

```bash
docker exec cyclereg-postgres dropdb -U cyclereg --force cyclereg
```

```bash
docker exec cyclereg-postgres createdb -U cyclereg cyclereg
```

The next `npm run dev` recreates the tables. Data from the earlier SQLite file (`data/cyclereg.sqlite`) is not imported; reseed with `npm run seed:omnium` or `npm run seed:demo`.

## Common problems

See [troubleshooting.md](troubleshooting.md).
