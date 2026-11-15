# Troubleshooting

Problems you may hit running the organizer workspace locally. Each entry starts with what you see. Setup steps are in [local-setup.md](local-setup.md).

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

## Rider registration says "Registration is not open"

Who sees it: anyone opening the rider registration page.
Cause: the event has no published version. Riders only ever see a published version.
Fix: in the organizer workspace, open **Review and publish**, fix any errors, and publish. The page then shows the published schedule.
Last confirmed: November 14, 2026

## A category shows "Opens …" or "Registration closed" and cannot be chosen

Who sees it: rider on a real (non-demo) event, or on a demo event with the demo window setting turned off.
Cause: the current time in the event's time zone is outside that category's registration window.
Fix: organizers change the category's opening or closing time in the category editor and publish again. For a demo, turn on "let testers register outside the registration windows" in **Event setup**.
Last confirmed: November 14, 2026

## Checkout says a race is full and nothing was held

Who sees it: rider at the "Sign and review the order" step.
Cause: another order or test entry took the last place in a category, start group, or shared pool. Orders are all or nothing, so no other race in the order was held either.
Fix: go back to races, choose another category, and try again. Organizers can remove test entries in **Event setup**.
Last confirmed: November 14, 2026

## The API or the tests cannot connect to PostgreSQL

Who sees it: anyone running `npm run dev`, `npm test`, or `npm run test:e2e`.
Symptoms: `ECONNREFUSED 127.0.0.1:5432`, `The API tests need PostgreSQL at 127.0.0.1:5432`, or `password authentication failed for user "cyclereg"`.
Likely causes:
1. The database container is not running. Start it with `docker start cyclereg-postgres` (or create it as in [local setup](local-setup.md#what-you-need)).
2. Something else uses port 5432 with other credentials. Stop it, or point `DATABASE_URL`, `TEST_DATABASE_URL`, and `E2E_DATABASE_URL` at your server. The test user must be allowed to create databases.
Last confirmed: November 15, 2026

## `database "cyclereg_berkeley" does not exist`

Who sees it: anyone pointing `DATABASE_URL` at a database that does not exist on a PostgreSQL server that is not on this computer.
Cause: the dev server, `npm run seed:*`, and `npm run seed:cases` create a missing database only when the host is `localhost`, `127.0.0.1`, or `::1`. They never create one anywhere else.
Fix: for a local database, check the host in `DATABASE_URL`. For another server, create the database there yourself, for example `createdb -h <host> -U <user> cyclereg_berkeley`.
Last confirmed: November 15, 2026

## End-to-end test says the browser is missing

Who sees it: anyone running `npm run test:e2e` for the first time.
Fix: run `npx playwright install chromium`.
Last confirmed: November 14, 2026

Escalate to: the technical lead named in the roadmap responsibilities table, when an entry here does not fix the problem.
