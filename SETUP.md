# Setup

Quick start for running the CycleReg prototype on your own computer. The full steps, configuration, and expected output are in [docs/runbooks/local-setup.md](docs/runbooks/local-setup.md), which is the source of truth if the two ever disagree.

The prototype has no sign-in. It listens only on `127.0.0.1` and must not be exposed to a network or deployed.

## Requirements

- Node.js 20 or later (`node -v`) and npm
- Git
- A database. The app stores user data (rider details, waivers), event data, registrations, bibs, check-ins, and start lists in it and does not run without one. Locally this is a SQLite file that the app creates and migrates on first start, so there is nothing to install. See [Database](#database).
- No cloud account or API key. Nothing connects to USA Cycling or a payment provider.

## Run it

```bash
npm ci
```

```bash
npm run dev
```

Open `http://127.0.0.1:5273/`. Create an organization, select **Load Berkeley Omnium**, or select **Open the rider demo**.

To preload demo data from the command line instead:

```bash
npm run seed:omnium
```

`npm run seed:demo` loads the fictional example weekend.

## Database

- Default location: `data/cyclereg.sqlite`. Set `DB_PATH` to use a different file.
- Created automatically by `npm run dev`, `npm start`, or a seed command. Pending migrations run on startup.
- `better-sqlite3` (installed by `npm ci`) provides SQLite; no separate database server is needed for the local prototype.
- The `data/` folder is ignored by Git. It can hold test registrations, so do not commit or share it.
- To start over, stop the app and delete `data/cyclereg.sqlite`.

Tables, relationships, and deletion behavior: [DATA_MODEL.md](DATA_MODEL.md). The hosted database for a real event is an open decision ([product.md](product.md#data-storage)).

## Check it

```bash
curl http://127.0.0.1:5273/api/health
```

Expected output: `{"ok":true}`.

## Tests

```bash
npm run check
```

Runs the TypeScript check, unit and API tests, and a production build.

```bash
npx playwright install chromium
```

```bash
npm run test:e2e
```

## Configuration

| Setting | Default | Purpose |
|---|---|---|
| `DB_PATH` | `data/cyclereg.sqlite` | Local SQLite database |
| `PORT` or `API_PORT` | `3001` | API server port |
| `NODE_ENV=production` | unset | API also serves the built web app from `dist/web` |
| `HOLD_MINUTES` | `10` | How long checkout holds places before payment |

To start over, delete `data/cyclereg.sqlite`. Problems: see [docs/runbooks/troubleshooting.md](docs/runbooks/troubleshooting.md).
