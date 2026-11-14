# Troubleshooting

Problems you may hit running the organizer workspace prototype locally. Each entry starts with what you see. Setup steps are in [local-setup.md](local-setup.md).

## "Port 5273 is already in use" when running `npm run dev`

Who sees it: anyone running the dev servers.
Likely causes:
1. Another copy of this project's dev server is still running. Find it with `lsof -nP -iTCP:5273 -sTCP:LISTEN` and stop that process by its PID.
2. Another project uses port 5273. Change `server.port` in `vite.config.ts`.

The port is fixed (`strictPort`) on purpose, so the app never silently moves to a port that belongs to something else.
Last confirmed: November 14, 2026

## The page loads but says "Cannot reach the CycleReg server"

Who sees it: organizer using the dev servers.
Likely causes:
1. The API process stopped. Check the terminal running `npm run dev` for an error from `[api]`, then restart.
2. Port 3001 is taken by another program. Run with `API_PORT=3011 npm run dev`; Vite forwards `/api` to that port.
Last confirmed: November 14, 2026

## Save status shows "Changed elsewhere"

Who sees it: organizer editing an event open in two tabs or on two computers.
Cause: the draft was saved from another tab after this one loaded. The server refuses the older save instead of overwriting it.
Fix: select **Reload**, then redo the last change.
Last confirmed: November 14, 2026

## Save status shows "Not saved" with a message about entries

Who sees it: organizer lowering a cap or removing a category.
Cause: a category cap, start group field limit, or pool limit would fall below riders already entered, or a category with entries was deleted. The server refuses both.
Fix: raise the limit back, archive the category instead of deleting it, or remove test entries in **Event setup**.
Last confirmed: November 14, 2026

## `npm ci` fails building `better-sqlite3`

Who sees it: contributors on an unusual platform or Node version.
Likely causes:
1. Node.js is older than 20. Upgrade.
2. No prebuilt module exists for your platform, so npm tries to compile it. Install your platform's build tools (Xcode Command Line Tools on macOS, `build-essential` and `python3` on Linux) and retry.
Last confirmed: November 14, 2026

## End-to-end test says the browser is missing

Who sees it: anyone running `npm run test:e2e` for the first time.
Fix: run `npx playwright install chromium`.
Last confirmed: November 14, 2026

Escalate to: the technical lead named in the roadmap responsibilities table, when an entry here does not fix the problem.
