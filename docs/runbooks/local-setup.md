# Local setup

Last verified: November 15, 2026 on macOS 26 (Apple silicon) with Node.js 20.19, npm 10.8, Docker 27.4, and PostgreSQL 17, by the technical lead. The project moved to Node.js 22 on November 16, 2026; `npm run check` and `npm run test:e2e` passed on Node.js 22.23.4 that day. The rest of this guide was not re-verified on Node.js 22.

This runs the organizer workspace on your own computer, listening on `127.0.0.1`. Without Clerk keys, sign-in is a local test form that takes any fictional address ending in `.test` and sends no email. With a Clerk development instance, sign-in is a passwordless emailed code or link ([ADR 0003](../decisions/0003-sign-in-and-mfa.md), Phase 2). MFA is not built yet, so use fictional data only.

For BBC and Pinole team-time-trial research, follow [TTT research setup](../../SETUP.md#team-time-trial-read-only-research-examples). These examples are publicly readable but do not enable rider entry.

For Wente, Mount Hamilton, Chico, and San Rafael Sunset historical demos, follow [regional setup](../../SETUP.md#additional-northern-california-historical-demos) and review each sample's source and scope limits.

For the historical Red Kite criterium sample and full-series boundaries, follow [Red Kite setup](../../SETUP.md#red-kite-historical-criterium-sample).

For the historical road Grand Prix demo, follow [San Francisco setup](../../SETUP.md#san-francisco-grand-prix-historical-demo).

For the historical Burlingame demo and its source/assumption boundaries, follow [Burlingame setup](../../SETUP.md#burlingame-historical-demo).

For the combined Berkeley Omnium demo, follow [Set up the Berkeley demo](../../SETUP.md). It seeds a separate database and publishes one event containing both races for rider testing.

## What you need

- Node.js 22 or later, from [nodejs.org](https://nodejs.org/) (or `brew install node@22`, or `nvm install 22`). Check with `node -v`. Node.js 20 is past end of support, and `@fastify/static` 10 depends on a package that requires Node.js 22.
- npm (comes with Node.js).
- Git.
- PostgreSQL 17 on your computer. The simplest way is [Docker Desktop](https://www.docker.com/products/docker-desktop/) and this container (local-only test credentials, listening on `127.0.0.1` only):

  ```bash
  docker run -d --name cyclereg-postgres -e POSTGRES_USER=cyclereg -e POSTGRES_PASSWORD=cyclereg -e POSTGRES_DB=cyclereg -p 127.0.0.1:5432:5432 postgres:17
  ```

  Expected result: Docker prints a container ID. Check it with `docker exec cyclereg-postgres pg_isready -U cyclereg`, which prints `accepting connections`. After a restart, run `docker start cyclereg-postgres`. A PostgreSQL you installed another way works too; set `DATABASE_URL` (below) to match it.
- Optional, for the browser test: about 300 MB of disk space for the Playwright Chromium download.
- Optional: a Clerk development instance for real emailed sign-in (free plan). The project owner creates it; see [Sign-in keys](#sign-in-keys). Local development and the tests work without it.

Nothing connects to USA Cycling or a payment provider. The app creates and migrates its tables on start ([DATA_MODEL.md](../../DATA_MODEL.md#storage-and-migrations)).

## Steps

1. Clone the repository and open its folder.
2. Install dependencies:

   ```bash
   npm ci
   ```

   Expected result: npm finishes without errors.

3. Optional: add the Clerk development keys to `.env` in the repository folder, as in [Sign-in keys](#sign-in-keys). Without them the API logs `Clerk keys are not set` and uses the local test sign-in.

4. Optional: load the Berkeley Omnium into your local database, owned by the email you will sign in with (with the local test sign-in, an address ending in `.test`):

   ```bash
   npm run seed:omnium -- --owner you@example.com
   ```

   Expected result: lines starting `Owner: you@example.com.` and `Demonstration events created in database cyclereg`. You can also load it from the home page once signed in. `npm run seed:demo -- --owner you@example.com` loads the fictional example weekend instead.

5. Start the development servers:

   ```bash
   npm run dev
   ```

   Expected result: the API logs `Server listening at http://127.0.0.1:3001` and Vite prints `Local: http://127.0.0.1:5273/`.

6. Open `http://127.0.0.1:5273/` in a browser and select **Sign in with email**. Without Clerk keys, type a fictional address such as `organizer@example.test`; with them, Clerk emails you a code or link. Then create an organization (you become its owner), or select **Load Berkeley Omnium**. Use **Team and roles** under an organization to give other people a role by email.

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

For routine changes, run typechecking and the affected test files as the [test plan](../testing/test-plan.md) requires. Run the full local suites below only at phase completion, before deployment, or when the owner explicitly requests them.

```bash
npm run check
```

This runs the TypeScript check, the unit and API tests (Vitest), and a production build. The API tests fake sign-in (`tests/support/auth.ts`), so they need no Clerk keys. The API tests need the PostgreSQL server above: they create one migrated template database per run, clone a fresh database for each test (so tests never see each other's data), and drop them all at the end. Each clone takes one advisory lock and waits at most twelve seconds for that lock. The copy stops inside that same budget, so a busy template fails the test before the test timeout. Your `cyclereg` database is not touched. Set `TEST_DATABASE_URL` to use another server; its user must be allowed to create databases.

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
| `CLERK_SECRET_KEY` | Clerk secret key (`sk_test_...` for a development instance). The API verifies sign-in with it. Without it, the API uses the local test sign-in on `127.0.0.1` outside production, and refuses to start anywhere else | none | **Yes.** Only in `.env` or the platform's secret store; never commit, log, or paste it |
| `VITE_CLERK_PUBLISHABLE_KEY` | Clerk publishable key (`pk_test_...`), built into the web app | none | No (public by design), but keep it in `.env` with the secret key |
| `CLERK_AUTHORIZED_PARTIES` | Comma-separated origins allowed to send session tokens, for example `http://127.0.0.1:5273` locally or the site's own origin when hosted | unset (any origin) | No |
| `SEED_OWNER_EMAIL` | Same as `--owner` for the seed scripts | unset | No |
| `NODE_ENV=production` | Makes the API also serve the built web app from `dist/web` | unset | No |
| `SERVE_WEB=1` | Serves the built web app without production mode (used by the end-to-end test) | unset | No |
| `AUTH_MODE=test`, `VITE_AUTH_MODE=test` | Forces the local-only test sign-in even when Clerk keys are set (the end-to-end test uses it). Refused in production and on network addresses | unset | No |
| `HOLD_MINUTES` | How long rider checkout holds places before payment | `10` | No |
| `STRIPE_SECRET_KEY` | Stripe test-mode secret key (`sk_test_...` or `rk_test_...`). Set it to use Stripe hosted Checkout instead of the simulated payment. Live keys are refused | unset (simulated payment) | **Yes.** Only in `.env` or the platform's secret store |
| `STRIPE_WEBHOOK_SECRET` | Webhook signing secret (`whsec_...`). Required when `STRIPE_SECRET_KEY` is set | none | **Yes** |
| `PUBLIC_APP_URL` | Origin Stripe sends riders back to after paying, and the sign-in link in invitation emails. Required in production when Stripe is on | `http://127.0.0.1:5273` outside production | No |
| `PROFILE_CLAIM_MINIMUM_AGE` | Explicit `18` enables the age gate for support-approved claims; unset keeps claims disabled, any other value refuses startup | unset | No |
| `PROFILE_CLAIM_SUPPORT_ACCOUNT_IDS` | Comma-separated application account IDs authorized to approve claims; no organizer role or email inference. Remove an ID and restart to revoke future approval/replay authority | unset (no support operators) | Account identifiers are personal data; use fictional accounts in local rehearsals |
| `EMAIL_MODE` | `resend` enables test email. `local` records emails in the database only | local | No |
| `EMAIL_FROM` | Sender address for Resend, such as an address on the project's verified domain | unset | No |
| `RESEND_API_KEY` | Server-side Resend sending key, required in Resend mode | unset | Yes |
| `EMAIL_TEST_RECIPIENTS` | Comma-separated list of test addresses allowed to receive invitation emails, required in Resend mode | unset | No |

## Support claim rehearsal (fictional data only)

Claims default off. For a local rehearsal, first sign in the fictional support operator and rider; obtain their application account IDs from each account’s authenticated `/api/me` response. Configure the support ID in `PROFILE_CLAIM_SUPPORT_ACCOUNT_IDS` and explicitly set `PROFILE_CLAIM_MINIMUM_AGE=18`, then restart. These settings do not grant organizer roles or general order access. There is no claim screen.

The authenticated support-only `POST /api/support/juniors/:id/claim` accepts `clientRequestId`, existing `riderAccountId`, reviewed `birthDate` (YYYY-MM-DD), rider-confirmed named `timeZone`, `reviewReference` and `acknowledge: true`. A different support account must approve the rider; an active guardian cannot be the claimant. The date is evaluated in the recorded zone, with March 1 for February 29 birthdays in non-leap years. Use an opaque support case reference, not an identity/document number. Do not attach identity documents: extra input fields are refused. Keep the original request ID and details after an interrupted response; identical retry returns the same approval, changed details conflict. No support restoration or correction of an approved claim is implemented.

Run the targeted claim scenarios in the [test plan](../testing/test-plan.md#support-approved-profile-claims) instead of using real DOBs or documents. A successful claim ends family guardian/viewer access and makes the claimed account the linked orders’ rider authority while retaining original payment/waiver/placer evidence. Existing organizer permissions remain separate. Configuration and local fixtures do not approve real identity, minor consent, retention/deletion or hosted operation; those gates remain in [product.md](../../product.md#sign-in-and-account-security).

`GET /api/events/:id/cancellation-confirmations/:confirmationId/financial-preflight` requires current event owner/finance authority. It returns a transient `financially_eligible_for_simulation` or `blocked` status, per-entry nominal cash amounts and blocker codes. `simulatedCashCents` is null when blocked, `executionAvailable` is always false, and no state or provider action changes. Missing/cross-event evidence returns 404. This standalone financial API is not an execution endpoint; organizer controls use the protected execution check.

## Sign-in keys

Real emailed sign-in uses a Clerk development instance on the free plan; without it, local development uses the test sign-in. Set both keys or neither: the dev server picks its sign-in from the publishable key and the API from the secret key. The project owner creates the Clerk account and instance; agents and scripts never create accounts.

1. In the Clerk Dashboard, create an application. Under sign-in options, turn on **Email address** with **Email verification code** and/or **Email verification link**. Turn off **Password**, **Phone number**, and social sign-in. Clerk applies its own sign-in attempt rate limits and lockout.
2. Copy the two keys from **API keys** into a file named `.env` in the repository folder (the main checkout, or each worktree you run from). `.env` is gitignored:

   ```bash
   CLERK_SECRET_KEY=sk_test_replace_me
   VITE_CLERK_PUBLISHABLE_KEY=pk_test_replace_me
   ```

3. Restart `npm run dev`. The API and Vite read `.env` when they start. Real environment variables win over `.env`.

Never commit `.env`, and never paste the secret key into an issue, chat, log, or screenshot. If it leaks, roll it in the Clerk Dashboard.

## Stripe test mode (optional)

Keep `HOLD_MINUTES` at its default `10` unless deliberately testing another short hold. Stripe requires session expiry within 24 hours; the stable provider deadline is the order hold deadline plus 31 minutes, so values above `1409` are not supported in Stripe mode. Startup does not validate this upper bound. The provider page may remain open after capacity expires; it does not reserve a place, and late payments still use the existing capacity recheck/exception path. See [session storage and retries](../../DATA_MODEL.md#payment_sessions).

Without Stripe keys, checkout uses the simulated payment. To try Stripe hosted Checkout in test mode, the project owner uses their own Stripe account's sandbox; agents never create accounts or use live keys.

1. In the Stripe Dashboard, switch to test mode (sandbox) and copy the secret key (`sk_test_...`) into `.env` as `STRIPE_SECRET_KEY`.
2. Forward webhooks to the local API with the Stripe CLI and copy the `whsec_...` secret it prints into `.env` as `STRIPE_WEBHOOK_SECRET`:

   ```bash
   stripe listen --forward-to 127.0.0.1:3001/api/payments/stripe/webhook --events checkout.session.completed,checkout.session.async_payment_succeeded,checkout.session.async_payment_failed,checkout.session.expired,refund.created,refund.updated,refund.failed
   ```

3. Restart `npm run dev`. The review step now shows **Pay on Stripe (test mode)**. Pay with a Stripe test card such as `4242 4242 4242 4242`; the order confirms when the webhook arrives.

Each person signs in with their own email (one account per email). Organizations created before sign-in existed have no owner; give yourself one by reseeding with `--owner`, or start over below. If you seeded with `--owner` but never signed in with that email, the owner invitation expires after 14 days and signing in then gives no role; reseed with the same `--owner` to renew it.

### Phase 2 Stripe sandbox rehearsal

Status: In progress. See the [Phase 2 roadmap](../../roadmap.md#phase-2--build-the-registration-core) for the partial reconciliation results. Use the owner's existing Stripe sandbox, a new disposable local database, and fictional riders and events. Use the [test-mode setup](#stripe-test-mode-optional) above and verify the app labels checkout as test mode before creating an order. Make sure the signing secret belongs to the running listener and the listener is forwarding to the API port in use. Keep test keys, signing secrets, hosted session URLs, complete CSVs and webhook bodies out of the shared evidence.

Run each case with fresh orders unless it explicitly calls for a retry of the same order. Record the configured hold duration and verify order, entry and payment states separately.

| Case | What to do | Pass evidence |
|---|---|---|
| Checkout and retry | Place a fictional order. Open hosted Checkout more than once for that held order, then complete its sandbox payment. | The same checkout session is reused. Its sandbox amount and currency match the accepted order. A signed payment notification confirms the entries exactly once. Browser return alone does not establish payment. |
| Decline and recovery | Use a sandbox decline scenario, then retry payment for the same held order. | A hosted card decline can leave the local order held without a recorded payment attempt. Verify no entry is confirmed until the later signed success. That success confirms the original order once. |
| Lost or delayed notification | Interrupt webhook forwarding before paying, then restore delivery of the original event for the actual sandbox session. If an enabled payment method supports delayed outcomes, also exercise pending and its final outcome. | No confirmation from browser return or a pending notification. The final notification either confirms the original order once or records the appropriate exception. Confirm delayed failure does not admit an entry. |
| Delivery retry and order | Redeliver the original sandbox notification through a supported sandbox mechanism. When possible, deliver a later failure/expiry observation after a paid outcome. | The provider reference stays linked to one outcome, with no second charge or entry. A later nonpaid observation does not undo confirmation. |
| Cancelled or expired reservation | Use separate orders. Release one hold, or let one expire, before a payment completes on its opened session. For the expired case, include available capacity and capacity already taken by another test rider. | Cancelled checkout stays closed and late money is an exception. Expired holds reacquire the entire eligible selection or enter review, with no partial allocation. |
| Refund and retry | As owner or finance, request a partial sandbox refund for a confirmed entry. Recheck the same request when testing an interrupted response, keeping its original request identity and amount. | One provider refund and one local record reconcile by reference, amount and result. Pending or failed results stay visible without implying that money returned. If a refund still in requested status reaches the 23-hour retry cutoff, reconcile it before any further reimbursement. Entry and readiness changes remain separate. |

Use owner/finance **Registrations** to check the orders and download the ledger and local reconciliation records. Match a sandbox Checkout Session to its order and PaymentIntent by stored reference. Match each refund to its original test payment and its recorded provider refund reference. For a matching charge, compare its amount to the ledger’s `order_total` for the confirmed order. Check charge exceptions separately. Match succeeded refunds to `refund` rows whose descriptions show `(succeeded)`, comparing the absolute amounts. The evidence CSV can repeat a payment across several source kinds, so use it for matching references and states. Sandbox charge and refund matches do not establish payout settlement.

Record the tested commit, date, event/fixture, completed cases, expected and actual order/entry/payment/refund states, before/after counts, and the reconciliation result. Keep exact provider artifacts in restricted rehearsal storage. Mark a case blocked when the sandbox cannot produce the requested delivery or outcome and link the existing local regression. Local signed fixtures and fake provider tests can support diagnosis while the real provider outcome remains pending. Escalate unexplained money, entry or capacity differences before accepting the rehearsal. See the [Phase 2 exit gate](../../roadmap.md#phase-2--build-the-registration-core).

## Email in test mode (optional)

In local mode the app records organizer invitation emails in `email_messages` and sends nothing. To rehearse with Resend:

1. In the project's Resend account, create a sending key and verify a sender domain. For an initial test, Resend's `onboarding@resend.dev` sender can send to the account owner's address.
2. In the server's local `.env`, set `EMAIL_MODE=resend`, `EMAIL_FROM=<sender address>`, `RESEND_API_KEY=<sending key>`, and `EMAIL_TEST_RECIPIENTS=<comma-separated test addresses>`. Restart `npm run dev`.
3. Invite a listed test address from **Team and roles**. The message's sign-in link uses `PUBLIC_APP_URL` (see the configuration table). Check the invitation shows “Email sent” and confirm receipt in the test inbox. “Email sent” means Resend accepted the request. “Email failed to send” is a confirmed refusal by Resend or a block by the local test list: **Resend** extends the invitation and tries again. “Email might have been sent” means the outcome was lost: **Retry send** repeats that same attempt and does not extend the invitation. After 24 hours it refuses: cancel the invitation and invite again. An invitation with an email from before migration 40 has no resend at all: check the test inbox, then cancel and invite again if a new email is needed. Only one send of an attempt runs at a time. A seed that re-adds a canceled invitation does not reuse the earlier attempt. `email_messages.error` stores a short safe outcome, not the raw provider body.

If migrating a local setup, replace `EMAIL_MODE=ses` and remove `SES_REGION`, `SES_AWS_PROFILE`, and `SES_CONFIGURATION_SET`. Use `EMAIL_MODE=local` to keep email recorded only. The server refuses `EMAIL_MODE=resend` with `NODE_ENV=production`.

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

For protected changes, Select all excludes checked-in riders. Select them individually and acknowledge changing issued bibs before previewing. The server enforces this acknowledgement across every day sharing the number.

Shared bibs must fit the overlap of every applicable entry range across their collision scope. A category without a range uses the event/day range. If ranges do not overlap, adjust them, or configure separate bibs per day if the conflict is between days; no partial allocation is saved. Existing issued numbers are retained until a deliberate correction.

To correct an issued bib after refund, withdrawal, or cancellation, search by rider name, bib, or check-in code. Inactive riders appear only if they still hold an active bib in the selected collision scope. Use **Change bib**, enter a reason, acknowledge a checked-in change, preview, and apply. Payment, refund, entry, readiness, and check-in states remain unchanged. These owner decisions resolve the questions in [issues #95 and #97](../../product.md#automatic-and-bulk-bib-assignment).

Unticking a rider or using **Select all** to replace a selection clears the typed replacement number for riders removed from the selection. Numbers for riders still selected remain in place. Select the rider again and enter a new value before previewing. See the [bib reassignment requirements](../../product.md#automatic-and-bulk-bib-assignment).


### Unresolved refund recovery

The finance refund panel distinguishes an ordinary in-flight submission from an unconfirmed response. If interrupted, use **Check refund status** or **Retry original refund**. The exact original request stays in this tab, scoped to signed-in email/order. If browser storage is blocked, keep the page open; refresh recovery is not guaranteed. A refund never withdraws an entry.

Unresolved provider requests stop sending after 23 hours from creation, reserving a one-hour margin before Stripe API v1 may prune its key. Money remains reserved. Finance must inspect the original provider operation/events and reconcile before any alternative reimbursement; do not create a replacement request blindly. Late signed updates still apply. An operator reconciliation/override tool is not implemented; real-provider and support acceptance remain launch gates.

Primary sources checked November 16, 2026: [Stripe idempotent requests](https://docs.stripe.com/api/idempotent_requests) and [low-level error handling](https://docs.stripe.com/error-low-level). API v1 keys are retained at least 24 hours, can then be removed, and reuse after removal can execute a new operation. Tests make no real refunds.


## Reviewed cancellation plans

With fictional data and current event owner/finance authority, POST a strict event/race/day selection to `/api/events/:id/cancellation-confirmation-preview`. Keep the returned fingerprint and review its impact. POST `/api/events/:id/cancellation-confirmations` with `clientRequestId`, the same `selection`, `previewFingerprint`, a 3–300 character `reason` and `acknowledgePlanOnly: true`. Changed impact/financial guard state returns 409 and requires a new preview. GET `/api/events/:id/cancellation-confirmations/:confirmationId` retrieves evidence under current event finance access.

After an interrupted response, resend the identical normalized request with the same identity to recover its original record, actor and time. Changed details under that identity conflict; new identities record separate plans. The result is `plan_confirmed` with `executionAvailable: false`. It changes no entries, places, payments or messages and creates no execution queue. Owner/finance can also record a plan in Registrations after loading its preview and providing a reason and acknowledgement. Organizer simulation controls are implemented; provider/credit cancellation remains Planned. The separate simulation-only executor is described below. Before any execution, obtain fresh reviewed state and reconcile finances; a saved plan is not financial authorization. Retention and real-provider acceptance remain required before real data/money.

The existing owner-only generated case-study reset also removes reviewed plans for those fixture events under event locks. It preserves unrelated event evidence. This scoped fixture cleanup does not define a real-data retention/deletion policy.

The confirmation screen keeps unresolved requests in the same tab under account/event-scoped recovery keys, when browser storage works. Retry the original request to resolve an unknown result; the screen never submits it automatically. A server-proven no-record refusal requires a fresh review and acknowledgement; a conflicting identity or unknown result remains unresolved. After success, refresh reloads saved evidence by reference from the server. If storage is blocked, keep the page open until resolution; unreadable recovery data needs manual review before another plan is recorded. Confirmed evidence is historical and never executes cancellation. A known completed reference that cannot be retrieved may be kept for lookup or cleared locally through an explicit separate review; this never discards an unresolved pending request or replaces server evidence.

A failed new confirmation carries `details.code: cancellation_plan_not_recorded` only after the server found no existing record for that request and refused a changed fingerprint or a definite fresh-review precondition. Removed scopes can retain their original 422 status; unreviewable data may return 409. Existing-record conflicts and authorization/unknown failures do not carry that marker. The UI uses this proof rather than clearing every 4xx refusal.

## Simulated cancellation execution

With simulated payments only, current owner/finance calls `POST /api/events/:id/cancellation-executions` with `{ clientRequestId, confirmationId, acknowledgeSimulatedCancellation: true }`. First record and review a current confirmation plan; the separate execution acknowledgement is required even though no real money moves. Execution repeats preflight; active holds, provider evidence, refund history, unsupported policies and selected test entries block it. Remove fictional test entries first.

An interrupted response must retry the same normalized identity and plan. Changed intent under an existing identity conflicts. An already executed plan rejects another execution identity; after a terminal refusal, a fresh acknowledged attempt needs a new identity. Never replace an unresolved request. `GET /api/events/:id/cancellation-executions/:executionId` reads original evidence under current event finance authority. The result is `simulated_cancellation_executed`. Entry/refund/waitlist/closure writes roll back together; audience/snapshot references send no messages. An overlapping event/day after partial cancellation is refused: review the remaining races separately. Category/race moves into or out of closed scopes are refused at draft save and publish. Cancelled entries cannot check in or receive new manual/automatic bib allocations; existing audit history remains. Registrations has simulation execution controls; no undo, real-provider refund or credit delivery exists. Do not run mixed provider configurations against the same rehearsal database.

Organizer controls first call protected `GET /api/events/:id/cancellation-confirmations/:confirmationId/execution-check`. Its `eligible`/`reason`/`financial` fields reflect the shared read-only preparation and its `execution` field contains original evidence when present. A null execution is not a negative write proof. The writer adds `details.code: cancellation_not_executed` only after a terminal refusal has committed for that identity/payload. Known write refusals first roll back all write-side work; conflicts and unknown database/commit failures retain unresolved intent. Same rejected identity replays the refusal even if conditions clear; use a fresh acknowledged identity only after a known terminal refusal. Keep the original request after an unknown result. No read call executes cancellation.
