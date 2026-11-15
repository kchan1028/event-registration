# Local setup

Last verified: November 14, 2026 on macOS 26 (Apple silicon) with Node.js 20.19 and npm 10.8, by the technical lead.

This runs the organizer workspace prototype on your own computer. It has no sign-in, so it listens only on `127.0.0.1` and must not be exposed to a network or deployed.

## What you need

- Node.js 20 or later, from [nodejs.org](https://nodejs.org/). Check with `node -v`.
- npm (comes with Node.js).
- Git.
- Optional, for the browser test: about 300 MB of disk space for the Playwright Chromium download.

No database server, cloud account, or API key is needed. Nothing connects to USA Cycling or a payment provider.

## Steps

1. Clone the repository and open its folder.
2. Install dependencies:

   ```bash
   npm ci
   ```

   Expected result: npm finishes without errors. `better-sqlite3` downloads a prebuilt native module for your platform.

3. Optional: load the Berkeley Omnium into your local database:

   ```bash
   npm run seed:omnium
   ```

   Expected result: a line starting `Demonstration event created in data/cyclereg.sqlite`. You can also load it from the home page. `npm run seed:demo` loads the fictional example weekend instead.

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

This runs the TypeScript check, the unit and API tests (Vitest), and a production build.

```bash
npx playwright install chromium
```

```bash
npm run test:e2e
```

The end-to-end test builds the app, starts it on port 3105 with a throwaway database (`data/e2e.sqlite`), and drives the organizer workflow in Chromium.

To regenerate the README screenshots:

```bash
SCREENSHOTS=1 npx playwright test e2e/screenshots.spec.ts
```

## Configuration

| Setting | Purpose | Default | Secret? |
|---|---|---|---|
| `DB_PATH` | SQLite file for organizations, drafts, published versions, and test entries | `data/cyclereg.sqlite` | No |
| `PORT` or `API_PORT` | API server port | `3001` | No |
| `NODE_ENV=production` | Makes the API also serve the built web app from `dist/web` | unset | No |
| `HOLD_MINUTES` | How long rider checkout holds places before payment | `10` | No |

The `data/` folder is ignored by Git. Delete `data/cyclereg.sqlite` to start over.

## Common problems

See [troubleshooting.md](troubleshooting.md).
