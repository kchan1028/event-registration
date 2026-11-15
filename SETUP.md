# Setup

Quick start for running the CycleReg prototype on your own computer. The full steps, configuration, and expected output are in [docs/runbooks/local-setup.md](docs/runbooks/local-setup.md), which is the source of truth if the two ever disagree.

The prototype has no sign-in. It listens only on `127.0.0.1` and must not be exposed to a network or deployed.

## Requirements

- Node.js 20 or later (`node -v`) and npm
- Git
- No database server, cloud account, or API key. Nothing connects to USA Cycling or a payment provider.

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
