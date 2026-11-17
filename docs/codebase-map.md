# Codebase map

Where to start reading for a change, what tests cover each area, and constraints that are easy to miss. It is for navigation: open the files it names and check the current code before changing anything. System design and tradeoffs are in [architecture.md](architecture.md); domain rules are in the [coding guide](coding-guide.md).

Paths verified against `main` at commit `740d0b9` (November 16, 2026). When a change makes an entry untrue, fix the entry in the same pull request. If this map and the code disagree, the code wins; correct the map.

## How the pieces fit

- **One app, three layers.** `src/web/` (React, built by Vite) calls the Fastify server in `src/server/` over `/api/...`. Both import the same rules from `src/shared/`, so the browser preview and the server's checks agree. The server is the authority; the browser is never trusted.
- **Entry points.** `src/server/index.ts` starts the server (reads `.env`, creates a missing local database, picks the listen address in `listen.ts`). `src/server/app.ts` `buildApp()` creates every module, registers every route, and applies migrations when the server becomes ready. `src/web/main.tsx` mounts `App.tsx`, which does hash routing (`#/register/...`, `#/events/...`, `#/orders/...`).
- **Data.** PostgreSQL through `src/server/db.ts` (`all`, `get`, `run`, `transaction`, `lock`). Schema changes are appended to the `MIGRATIONS` array in `db.ts`; never edit an earlier entry. Tables are described in [DATA_MODEL.md](../DATA_MODEL.md).
- **Event configuration** is one JSON document validated by `eventConfigSchema` in `src/shared/schema.ts`, saved as a draft and frozen into numbered published versions (`src/server/repo.ts`). Orders keep the version they were sold under.

## By task area

| Area | Start here | Shared rules | Tests |
|---|---|---|---|
| Event setup, publishing, validation | `src/server/repo.ts`, `src/web/Builder.tsx`, `EventSettings.tsx`, `CategoryEditor.tsx`, `Publish.tsx` | `schema.ts`, `validation.ts`, `factory.ts`, `bulk.ts`, `impact.ts`, `categoryCsv.ts` | `tests/api.test.ts`, `validation.test.ts`, `bulk.test.ts`, `impact.test.ts`, `csv.test.ts`; `e2e/organizer.spec.ts`, `csv.spec.ts` |
| Capacity and eligibility | (called from `orders.ts` and `repo.ts`) | `capacity.ts` (`canAdmit`), `eligibility.ts` (`evaluateCategory`) | `capacity.test.ts`, `eligibility.test.ts` |
| Rider checkout and orders | `src/server/orders.ts`, `src/web/Register.tsx` | `checkout.ts` (`checkSelection`, readiness), `pricing.ts` (`quote`), `categoryExtras.ts` | `orders.test.ts`, `pricing.test.ts`, `categoryExtras.test.ts`; `e2e/checkout.spec.ts` |
| Payments and refunds | `src/server/payments.ts` (simulated or Stripe test mode, webhook), `refunds.ts`, `src/web/registrations/RefundPanel.tsx` | `refunds.ts`, `refundPolicy.ts` | `payments.test.ts`, `refunds.test.ts`, `refundPolicy.test.ts`; `e2e/refund-recovery.spec.ts` |
| Coupons | `src/server/coupons.ts`, `src/web/Coupons.tsx` | `coupons.ts`, `pricing.ts` | `coupons.test.ts` |
| Organizer registrations queue | `src/web/Registrations.tsx`, `src/web/registrations/` | `lookup.ts`, `reports.ts`, `exports.ts` | `lookup.test.ts`, `exports.test.ts`, `transfers.test.ts`, `resolutions.test.ts` |
| Waitlists | `src/server/waitlist.ts` | `waitlist.ts` | `waitlist.test.ts` |
| Rider identity across orders | `src/server/identity.ts`, `src/web/registrations/SameRider.tsx` | `riderIdentity.ts` | `identity.test.ts` |
| Sign-in, roles, team, guardians | `src/server/auth.ts`, `juniors.ts`, `src/web/auth.tsx`, `Team.tsx`, `MyRegistrations.tsx` | `roles.ts` (`can`, permissions), `juniors.ts` | `auth.test.ts`, `juniors.test.ts`; `e2e/sign-in.spec.ts`, `e2e/handoff.spec.ts`, `e2e/invitation-recovery.spec.ts` |
| Email (test-only SES) | `src/server/email.ts` | | `auth.test.ts` (invitation emails) |
| Check-in, bibs, roster | `src/server/checkin.ts`, `automaticBibs.ts`, `src/web/CheckIn.tsx`, `BibBatchPanel.tsx`, `Roster.tsx` | `checkin.ts`, `roster.ts` | `checkin.test.ts`, `automatic-bibs.test.ts`, `bib-reassignment.test.ts`, `roster.test.ts`; `e2e/checkin.spec.ts`, `checkin-recovery.spec.ts` |
| Start lists and timer export | `src/server/startlists.ts`, `src/web/StartLists.tsx` | `startlist.ts` | `startlists.test.ts` |
| Demo and case-study data | `src/server/seed-cli.ts`, `case-study-cli.ts`, `caseStudies.ts` | `demo.ts`, `fixtures.ts`, `caseStudies.ts`, and the named event files (`berkeleyOmnium.ts`, `burlingame.ts`, and others) | `case-studies.test.ts` and the per-event test files |

`src/web/api.ts` is the browser's API client; types it sends or receives come from `src/shared/`. `src/web/ui.tsx` holds shared controls; `styles.css` holds all styles.

## Constraints that are easy to miss

- **Per-event lock.** Any write that can change capacity, holds, bibs, or the ledger runs in `db.transaction()` and takes `db.lock(eventLock(eventId))` first (`repo.ts`). `db.lock()` only works inside a transaction.
- **Reuse the shared SQL.** "Counts toward capacity" is `liveEntrySql`; "a hold still reserving" is `reservedOrderSql` (both in `repo.ts`). Holds expire by time, not by a background job, so status checks compare against the clock.
- **Access checks.** Organizer routes call `requireOrg`/`requireEvent` in `auth.ts`; order routes call `requireOrderAccess`. Someone with no role gets 404, not 403, so IDs cannot be probed. `tests/auth.test.ts` checks that every `/api` route registered in `app.ts` with `app.get`, `post`, `put`, or `delete` needs sign-in unless marked public; a route registered another way is not scanned.
- **Refund creation recovery.** Normalized request evidence is checked under the order refund lock before caps; provider retries keep the saved refund ID. The finance tab retains its unresolved original payload. Do not rotate identity to resolve an unknown result.
- **Guardian removal.** Private relationship history/removal APIs in `juniors.ts` require another relationship ID, reason and acknowledgement. Migration 31 keeps historical removal evidence unknown. The family lock serializes opposing removals; replay targets only its original grant. Tests: juniors, migrations, orders/auth.
- **Guardian authority.** `junior_guardians` active grants on unmerged profiles authorize junior order access; shared trusted SQL fragments in `juniors.ts` are reused by auth and orders. Invitation acknowledgement/acceptance is atomic; no email/screen is built. All family writes use the global family lock (event lock first for order writes). Same-family soft merges preserve grants/evidence; different guardian sets or conflicting viewer emails block the correction. Original placer remains provenance; nonce replay rechecks authority. Tests: juniors, migrations, orders/auth and `e2e/guardian-access.spec.ts`.
- **Waiver acceptance evidence.** New orders snapshot account ID, declared racing age and server time beside the waiver; replay/corrections never reconstruct it. Historical evidence stays null. Tests: orders, juniors and migrations.
- **Paid orders are frozen.** Price, rules, and refund policy come from the order's published version; never reprice from the latest config.
- **States are independent.** Entry, payment, and readiness are separate; a paid entry is not cleared to race.
- **Injected clock and providers.** `buildApp()` takes `now`, `auth`, `payments`, and `email` options. Tests use them; do not read `Date.now()` or environment settings deep inside a module.

## Tests and commands

- Unit and API tests: Vitest, `tests/*.test.ts`. `tests/support/db.ts` `testApp()` builds an app on a throwaway database; `tests/support/auth.ts` `fakeAuth()` and `as(email)` fake sign-in. They need the local PostgreSQL server from [local setup](runbooks/local-setup.md).
- Browser tests: Playwright, `e2e/*.spec.ts`, with the local-only test sign-in (`AUTH_MODE=test`, configured in `playwright.config.ts`).
- Which tests to run for a change, and when to run everything: the [test plan](testing/test-plan.md). Commands are listed there and in `package.json`.
- CI (`.github/workflows/ci.yml`) skips the test jobs for documentation-only changes; its Documentation links job (`npm run check:docs`, `scripts/check-doc-links.mjs`) runs on every change.
