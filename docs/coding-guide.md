# Coding guide

This guide sets the rules code must follow. Most of them protect three things volunteers cannot easily fix by hand on race morning: correct fields, correct money, and private rider data. The local build uses TypeScript, Node.js, React ([ADR 0001](decisions/0001-stack-for-category-builder-milestone.md)), and PostgreSQL ([ADR 0004](decisions/0004-hosted-stack-and-database.md)). Sections about payments, roles, and sign-in describe planned work; nothing for them is built yet.

## Repository structure and commands

| Folder | What goes there |
|---|---|
| `src/shared/` | Domain rules that must give the same answer in the browser and on the server: schema, eligibility, capacity, validation, templates, demo data. No browser or Node-only APIs. |
| `src/server/` | HTTP routes (`app.ts`), storage and transactions (`repo.ts`, `db.ts`), entry point and seed script |
| `src/web/` | React components and `styles.css` (design tokens are documented in [DESIGN.md](../DESIGN.md)) |
| `tests/` | Vitest unit tests for `src/shared` and API tests using `app.inject` |
| `e2e/` | Playwright browser tests |

Commands (details in [runbooks/local-setup.md](runbooks/local-setup.md)): `npm run dev` to work locally, `npm run check` for typecheck plus unit and API tests plus build, `npm run test:e2e` for the browser tests. CI ([.github/workflows](../.github/workflows/ci.yml)) runs the same checks on every push to `main` and every pull request. For a documentation-only change (Markdown files and `docs/`, other than `docs/fixtures/`, which tests read) the test jobs report as skipped. The `main` ruleset requires a pull request, both test jobs to pass (skipped counts as passed), resolved review threads, and squash merges; no approval is needed. Locally, run only the tests for what you change; see the [test plan](testing/test-plan.md).

Every rule traces to a requirement in [product.md](../product.md). When a rule here and `product.md` disagree, `product.md` wins and this guide must be corrected.

## Document maintenance rule (mandatory)

Every change must review both [product.md](../product.md) and [roadmap.md](../roadmap.md) for impact.

- Update `product.md` when requirements, scope, user flows, business rules, acceptance criteria, or product decisions change.
- Update `roadmap.md` when priorities, dependencies, milestones, blockers, or delivery status change.
- When a change affects neither document, state that explicitly in the change summary instead of making cosmetic edits.
- Keep `README.md` and affected guides consistent with the implementation.
- Mark roadmap work complete only after its acceptance criteria are verified.
- Distinguish planned, implemented, and verified behavior.
- Do not maintain a competing product roadmap elsewhere.

## General principles

- **Server decides.** Capacity, eligibility, pricing, authorization, and payment state are enforced on the server. The browser may preview them but is never trusted.
- **History is kept, not overwritten.** Money, signatures, category configuration, capacity, and permissions are append-only or versioned. Correct mistakes with a new record that references the old one.
- **Uncertain means review.** When the system cannot confirm something (a license, a payment, a federation rule), it produces a review status, never a silent pass.
- **Small, boring, readable.** Prefer plain code a successor can follow over clever abstractions. Complexity must earn its place by satisfying a requirement.
- **Stable IDs everywhere.** Every entity that appears in an export, receipt, audit record, or external system has a stable, opaque ID that never changes or gets reused. Display names and timing codes can change; IDs cannot.

## Keep the code simple

These rules come from the November 15, 2026 code review, which found the same rule written in up to seven places, about twenty unused exports, and wording that still described the first prototype.

**One rule, one place**

- Before writing a rule, calculation, query, formatter, or validation, search for one that already exists (`src/shared/` first, then the module you are in). Use it. If it almost fits, extend it instead of writing a second version.
- A rule the browser and the server both need lives in `src/shared/` and both sides call it. Never re-implement it in `src/web/` or `src/server/` to explain it early or to change the wording.
- A SQL condition used by more than one query is defined once and reused (see `liveEntrySql` and `reservedOrderSql` in `src/server/repo.ts`).
- Loading something every module needs (the published configuration, bib settings, an order) goes through one function in `repo` or `orders`, not a private copy per module.
- Types sent over the API are imported from `src/shared/`, not retyped in `src/web/api.ts`.
- Numbers and labels with one meaning are constants (`OFFER_HOURS`, `licenseLabel`), never typed again as text such as "24 hours".

**No complexity without a second caller**

- Do not add a helper, hook, component, option, parameter, or default value until two real callers need it. Write the plain code first.
- Do not add a fallback, optional field, or branch for a case that cannot happen. If a caller always supplies a value, the field is required.
- Do not add configuration, feature flags, or a new dependency for something one line of code does.
- Prefer deleting code to adding code.
- Do not load every row and filter in code when a `WHERE` clause can do it, and do not run a query per row inside a loop.

**Leave nothing stale**

- When a change makes code unused, delete it in the same change: exports, types, CSS selectors, props, defaults, and tests of removed behavior.
- When a change makes a comment, name, label, error message, or document untrue, fix it in the same change. A name says what the thing is now (`CapacityEntry`, not `TestEntry`).
- Do not write "until X exists", "for now", or "older callers" in a comment without checking that it is still true. If X exists, remove the workaround.
- User-facing text follows the data (payment mode, the event's demo flag, the signed-in role), never an assumption about how the build is configured.
- Name a function for what it does. Do not reuse one short name (`norm`, `money`) for helpers that behave differently. A copied block that needs a different result in one place means the shared version needs a parameter, not a second copy.

A duplicate, dead code, or stale assumption found outside your task is not fixed silently: list it under "Open questions" in the change summary.

## Naming conventions

- Use the domain terms from the [glossary](documentation-guide.md#glossary) in code: `RegistrationCategory`, `StartGroup`, `Classification`, `CapacityPool`, `DisplayGroup`, `Bundle`. Do not invent synonyms such as `Division` or `Wave` for the same concept.
- Name states exactly as `product.md` lists them (see [states](#keep-entry-payment-and-readiness-states-independent)).
- Money fields say what they hold and in what unit: `price_minor_units` with a currency code, not `price`.
- Times carry a time zone. Store instants in UTC and the event's IANA time zone (for example `America/Los_Angeles`) alongside them for display.
- TypeScript: `camelCase` for variables and functions, `PascalCase` for types and React components, one component family per file in `src/web/` named after its main export (`CategoryEditor.tsx`). Shared modules are lowercase nouns (`capacity.ts`).
- IDs are opaque strings with a type prefix (`cat_…`, `sg_…`, `pool_…`) created by `newId()`. Never derive an ID from a name.

## Category and shared-capacity modeling

The category builder is a P0 requirement. Get the model right first; screens come second. See [product.md](../product.md#1a-road-race-and-criterium-category-builder--p0).

### Keep the six concepts separate

| Concept | Owns | Never does |
|---|---|---|
| Display group | Heading and ordering on the schedule | Create or imply a capacity limit, start, or price |
| Registration category | Eligibility rules, price rules, questions, waivers, category cap | Hold riders from another category |
| Start group | Which categories start together, start time, shared field limit | Merge classifications or change prices |
| Classification | Timer code for scoring and awards | Affect capacity or price |
| Capacity pool | An explicit limit across named categories or start groups | Exist implicitly |
| Bundle | Which races a combined purchase covers and its price | Assume the same category, eligibility, or availability on each day |

### Capacity rules

1. A place is consumed when a **reservation** is created, not when payment completes. Reservations are short-lived and expire automatically.
2. A reservation consumes every applicable limit at once: the category cap, the start-group limit, and each capacity pool the category belongs to. If any limit is full, nothing is reserved.
3. A rider counts **once** toward a start group or pool, even with several classification tags. Dual scoring is allowed only when explicitly configured.
4. A bundle reserves all component entries in one atomic operation (all succeed or none do). Never sell half a bundle.
5. Enforce limits with a mechanism that is correct under concurrent checkouts, such as a database transaction with appropriate locking or an atomic conditional update. Counting rows and then inserting in two separate steps is not acceptable. The app runs `canAdmit()` and the insert inside one PostgreSQL transaction that first takes the event's lock (`db.lock(eventLock(id))`, an advisory transaction lock; see `repo.addTestEntries`), and saves that change limits, orders, and payments take the same lock. Any new write that can change capacity must do the same ([DATA_MODEL.md](../DATA_MODEL.md#capacity-and-concurrency)).
6. An organizer cannot lower a cap below confirmed entries plus active reservations.
7. Archive a category that has entries; never delete it.

Worked example from the acceptance criteria: categories A and B each have a cap of 40 and share a pool of 60. With 35 confirmed entries in A, B can take at most 25 more, because 35 + 25 = 60. Two buyers racing for the last place must not both succeed.

### Eligibility rules

- Store eligibility as structured data, not free text and not code branches per category.
- Combine independent constraints with AND, allowed alternatives with OR, and support explicit exceptions.
- License category, professional status, racing age, competition gender or class, license type and status, and collegiate eligibility are separate fields. Masters age and license category are independent: a Masters 35+ Cat 3/4 rider must satisfy both.
- Never infer eligibility from a label such as "P/1/2" or "Novice". Labels map to rules through explicit, approved mappings.
- Evaluate eligibility for the **race date**, using the governing body's racing-age rule for that discipline and season.
- Unknown or stale license data returns `needs_review`, not `eligible`.

As implemented (`src/shared/schema.ts`), a category holds a list of eligibility paths. A rider qualifies when every condition in at least one path holds. The Masters 35+ Cat 3/4 fixture is one path:

```json
{
  "paths": [{ "licenseCategories": ["3", "4"], "minAge": 35, "maxAge": null, "genderClass": "any",
              "licenseTypes": ["annual", "one_day"], "collegiateRequired": false, "collegiateDivisions": [] }],
  "organizerReview": false,
  "guardianRequired": false
}
```

The event records the rule source and season in `ruleSet`; validation warns when the season does not match the event year. Racing age is entered directly in the preview because the federation's racing-age rule is not implemented.

### Pricing

- Prices are integers in minor units (cents) with a currency code. Never use floating-point numbers for money.
- Price rules cover base price, free entry, scheduled price changes, day-of surcharge, additional-race discount, and bundle price.
- Define discount precedence explicitly and prevent unintended stacking. A multi-race discount applies exactly once per qualifying purchase.
- Coupons apply last, only to eligible entries no bundle or multi-race discount touched, and are counted against their cap under the event lock in the same transaction that holds the places (`src/shared/pricing.ts`, `src/server/coupons.ts`).
- At checkout, show an itemized total, including every fee. On purchase, **snapshot** the accepted price and the rule versions on the order line. Later configuration changes never reprice a paid entry.
- Fees are configured per event (`registration.platformFeeCents`, `registration.processingFeeBasisPoints`) and added once per order after discounts; the processing fee rounds half up to the cent (`src/shared/pricing.ts`).
- Registration windows are stored as local date-times in the event's time zone. Compare them with `localNow(timeZone, clock)` from `src/shared/checkout.ts`, never with the server's own clock or UTC strings. Check windows when places are held; `enforcesWindows()` decides whether a demo event may skip them.

### Configuration versioning

- Organizers edit a **draft**. Publishing creates an immutable, numbered configuration version.
- Each eligibility rule set records its source and season, so last year's rules are not silently reused.
- Duplicating a category or copying a day creates new IDs and flags inherited times, prices, rules, and capacity links for review.
- Changing a published configuration requires an impact preview listing affected riders, reservations, orders, and exports. Affected paid entries go to an explicit resolution workflow.
- Splitting or combining fields produces a new start-list version.
- CSV import validates into a draft, reports errors per row, and never publishes on its own.

## Keep entry, payment, and readiness states independent

From [product.md](../product.md#data-model):

- Entry: reserved, pending, confirmed, waitlisted, withdrawn, cancelled
- Payment: pending, paid, failed, partially refunded, refunded, disputed
- Readiness: needs information, needs waiver, needs license review, cleared, checked in

Document the permitted transitions for each state machine (as a table or diagram in this guide or an ADR) before implementing it. Code rejects any transition not on the list and records every transition with who, when, and why.

## Payments, retries, duplicate events, and reconciliation

Payments use a provider's hosted payment flow. The application never sees or stores card details. Stripe hosted Checkout is selected in [ADR 0002](decisions/0002-stripe-payments.md). The local build supports simulated and Stripe test-mode payment; live payments are not enabled.

### Confirm only on authoritative confirmation

- An entry becomes confirmed only after the provider's verified server-to-server notification (a webhook) or a server-side status check says the payment succeeded. A browser redirect to a "success" page is not proof of payment.
- Verify the signature on every provider notification before acting on it.

### Make every payment operation idempotent

The installed Stripe SDK retries transient HTTP 409 conflicts with the configured two-retry budget ([SDK documentation](https://github.com/stripe/stripe-node/blob/v23.1.0/README.md#network-retries), [retry implementation](https://github.com/stripe/stripe-node/blob/v23.1.0/src/RequestSender.ts), reviewed November 16, 2026). Do not add another unbounded retry loop. An exhausted session conflict returns a retryable response on the same order; a provider error never proves payment. The [session data model](../DATA_MODEL.md#payment_sessions) describes stable request expiry. [Stripe's session API](https://docs.stripe.com/api/checkout/sessions/create#expires_at) requires an expiry between 30 minutes and 24 hours (reviewed November 16, 2026); the supported hold configuration is documented in [local setup](runbooks/local-setup.md#stripe-test-mode-optional).

Idempotent means doing the same thing twice has the same effect as doing it once. Riders refresh pages, networks retry, and providers resend notifications, so duplicates are normal.

- Send an idempotency key with every request that creates a charge, refund, or checkout session, so a retried request cannot charge twice. Preserve its request parameters too, including expiry; do not recompute them from the current time while reusing the key.
- Store each provider event ID when it is processed. If the same event arrives again, acknowledge it and do nothing else.
- Process notifications in any order. A "refunded" event can arrive before the "paid" event it refers to; handle it by looking up current state rather than assuming order.
- Wrap "record payment" and "confirm entries" in one transaction, or make each step safe to repeat.

### Handle the awkward cases explicitly

These are required outcomes, not proof that the corresponding real-provider checks have passed. See [AUD-001](../AUDIT.md#observed-defects) and the [recovery evidence matrix](research/prelaunch-readiness.md#payment-and-failure-recovery-matrix).

| Case | Expected behavior |
|---|---|
| Payment fails or the rider abandons checkout | Reservation expires and the place is released; rider sees a clear message |
| Payment succeeds after the reservation expired | Do not silently confirm or silently drop. Confirm if capacity still allows; otherwise route to the exception queue for an organizer to refund or resolve |
| Duplicate notification | Recognized by event ID; no second order, charge, or entry |
| Rider refreshes or double-clicks "pay" | Same checkout session reused; one charge at most |
| Partial refund of one bundle entry | Record against that entry's paid amount and preserve its accepted price snapshot. A refund does not withdraw the entry or release capacity; withdrawal is separate. Show the bundle price effect before confirming |
| Dispute (chargeback) | Payment state becomes disputed; entry state unchanged until an organizer acts. Provider dispute ingestion is not implemented |

### What the app implements

The checkout (`src/server/orders.ts`) follows these rules with a simulated provider: order creation carries a client request ID so a retried request returns the same order; each payment notification carries an attempt ID stored in `payment_attempts` and is processed once; a success after the hold expired re-checks every place in one transaction and either confirms or moves the order to `needs_attention`; a success after the rider cancelled always goes to `needs_attention`; a decline keeps the hold. The [Stripe test-mode integration](../src/server/payments.ts) also implements signature verification, repeated-event handling, exact session totals and duplicate-charge recording; [refunds](../src/server/refunds.ts) include retry/status handling. These are source-inspected implementation facts, not a provider operational pass. Real-provider credentials, settlement, dispute handling, bank reconciliation and operating rehearsals remain unverified; live payments are not enabled. See the [readiness assessment](research/prelaunch-readiness.md#payment-and-failure-recovery-matrix) and [test plan](testing/test-plan.md).

### Reconciliation

- Keep a ledger of order totals, line items, discounts, processing and platform fees, refunds, and the provider's settlement or payout references.
- Provide a reconciliation report a treasurer can match line by line to the provider's statements.
- Run a reconciliation check that flags any order whose ledger, entry state, and provider record disagree. Unexplained differences are critical defects.

## Roles, privacy, secrets, and audit history

### Roles

The first release has these roles (from [product.md](../product.md#4-organizer-workspace)): owner, registration manager, check-in volunteer, timer/export, and finance. Riders and guardians see only their own data.

- Check permissions on the server for every request, by role and by event.
- Give each role the least access it needs. A check-in volunteer sees readiness and bib, not payment details. Any organizer role may look up one registration's emergency contact. That lookup is a separate action, and lists and exports still omit the contact.
- Owners can transfer ownership to a successor without sharing credentials.

### Privacy

- Collect only the profile, contact, emergency contact, team, and license data the product requires.
- Emergency contacts stay off lists, rosters, exports, and organizer order responses. Any organizer role may look up one registration's contact. Each lookup is recorded with the account, event, order, and time, and the record does not store the contact. A rider or guardian still receives their own registration.
- Check-in codes identify an entry and contain no personal details.
- Public participant lists show no sensitive data by default.
- Keep personal data out of logs, error reports, analytics, and URLs.
- Retention and deletion rules must be defined before the pilot. Only the emergency-contact lookup record has an approved period (365 days, not yet enforced); the rest is an open decision.

### Secrets

- Never commit secrets, API keys, tokens, or `.env` files. Add a template such as `.env.example` with placeholder values once configuration exists.
- Keep provider test keys and live keys separate. Live keys are out of scope until the roadmap reaches a live pilot.
- Rotate any secret that is exposed, then record the incident.

### Audit history

Record an audit entry for every change to money, categories, waivers, capacity, permissions, and manual exceptions. Each entry stores: who, when, what changed (before and after), and why. Manual exceptions need an authorized role and a reason, and cannot override hard capacity or mandatory federation requirements. Audit records are never edited or deleted by application code.

## Accessibility and mobile usability

Riders register on phones and volunteers check riders in on tablets outdoors. Accessibility is a requirement, not a polish step.

- Proposed target: WCAG 2.2 level AA (the W3C Web Content Accessibility Guidelines). Confirm in an ADR when the front-end approach is chosen.
- Every action works with a keyboard alone, with a visible focus indicator.
- Every input has a visible label. Errors say what went wrong and how to fix it, next to the field, and are announced to screen readers.
- Never use color alone to show status. The check-in ready/blocked result uses text and an icon as well as color, and must be readable in bright sunlight.
- Design for a 360-pixel-wide screen first. Touch targets are large enough to hit with a gloved or cold hand. No horizontal scrolling.
- Checkout must work at 200% browser zoom.
- Support light and dark themes from shared color tokens. Default to the system preference, remember the user's choice, and check contrast in both themes. See [product.md](../product.md#display-themes).
- Test with at least one screen reader and on a real phone before calling a flow Verified.

## Testing and review

Tests prove the acceptance criteria in [product.md](../product.md#core-flows-and-acceptance-criteria). A roadmap item is Verified only when the tests or rehearsals for its criteria pass and the evidence is linked from `roadmap.md`.

### What must be tested

| Area | Required tests |
|---|---|
| Category fixtures | Every fixture in [product.md](../product.md#required-category-configuration-examples) as an automated test |
| Capacity | Concurrent checkout for the last place; shared-pool example (40/40/60); bundle all-or-nothing; reservation expiry |
| Eligibility | Independent evaluation of age, license, class, and collegiate rules; unknown verification returns review |
| Payments | Failure, timeout, duplicate notification, out-of-order events, refund retry, late success after expiry |
| State machines | Every permitted transition succeeds; every other transition is rejected |
| Permissions | Each role can do what it should and nothing else; private fields hidden from roles without access |
| Configuration changes | Impact preview lists affected entries; paid prices and rules unchanged |
| Exports | Correct sample CSV, reproducible locked exports, and current revisions |
| Accessibility | Automated checks plus manual keyboard and screen-reader passes on checkout and check-in |
| Time | Events near midnight and daylight-saving changes in the event's time zone |

Use fake data in all tests. Concurrency and idempotency tests must actually run requests in parallel or replay events; a single-threaded test does not prove them.

Current coverage (all passing November 14, 2026): category fixtures, eligibility, and the 40/40/60 shared cap in `tests/`; last-place race across two database connections, stale-save rejection, entry-protecting saves, and publish rules in `tests/api.test.ts`; the organizer workflow, the demonstration publish flow, and the phone-width editor drawer (focus in, backdrop close, focus returned) in `e2e/organizer.spec.ts`. Checkout pricing, discount precedence, schedule conflicts, holds, expiry, idempotent payments, and license review are covered in `tests/pricing.test.ts` and `tests/orders.test.ts`, and the rider journeys in `e2e/checkout.spec.ts`. Automated WCAG 2.2 A and AA checks (axe-core) cover the main organizer, check-in, and rider screens in both themes in `e2e/accessibility.spec.ts`. The change impact preview has unit and API tests in `tests/impact.test.ts` (added after the date above; run in CI). Real payments have no tests yet because they are not built. Role permissions are covered in `tests/auth.test.ts`, the resolution workflow for affected entries in `tests/resolutions.test.ts`, and event time-zone checks, including daylight saving, in `tests/pricing.test.ts`.

### How much to test, and who verifies

The [test plan](testing/test-plan.md) says what a pull request tests, the risk areas that widen it, independent verification by the other agent, phase-completion/full-run timing, the predeployment gate, manual checks, release blockers, and the evidence template.

### Review

- Every change is reviewed by someone other than the author when possible (see [CONTRIBUTING.md](../CONTRIBUTING.md#review-expectations)).
- Changes to money, capacity, eligibility, waivers, permissions, or personal data need a reviewer familiar with that area and a test for the failure case, not only the success case.
- Reviewers confirm the change summary states product and roadmap impact.

### Labels and milestones on issues

Every new GitHub issue gets:

- One type: `bug`, `documentation`, `accessibility`, `ci`, `enhancement`, or `usability` (an observation, not a bug; the owner decides before anyone codes).
- One severity on a bug: `sev:high` (wrong money, capacity, eligibility, or data with no workaround), `sev:medium` (wrong behavior with a workaround, or limited reach), or `sev:low` (minor or cosmetic).
- `release-blocker` when the bug touches money, capacity, eligibility, waivers, permissions, or personal data. It blocks a release until fixed.
- The `area:` labels it touches: `area:payments`, `area:checkin`, `area:auth`, `area:categories`, `area:registration`.
- The milestone for the [roadmap](../roadmap.md) phase that must fix it (for example "Phase 2 — Build the registration core").

Milestones only group issues. Scope, priority, and status stay in `roadmap.md`, and there is no GitHub Project board, so there is no second roadmap. Security weaknesses never become public issues; see [SECURITY.md](../SECURITY.md).

### Branches after a pull request

- GitHub deletes a pull request's branch when it merges (the repository setting "Automatically delete head branches") or closes without merging ([delete-closed-branch.yml](../.github/workflows/delete-closed-branch.yml)). Branches from forks are left alone.
- Locally, the author removes its worktree and branch as soon as the pull request merges or closes: `git worktree remove <path>`, only when the worktree has no uncommitted work, then `git branch -D <branch>`.
- To clear every local branch whose remote branch is gone, run the command below. A branch still checked out in a worktree is skipped until that worktree is removed. Set `git config fetch.prune true` once per clone so fetches drop deleted remote branches.

  ```bash
  git fetch --prune && git for-each-ref --format='%(refname:short) %(upstream:track)' refs/heads | while read -r b t; do [ "$t" = "[gone]" ] && git branch -D "$b"; done
  ```

## Architecture decision records

Write an ADR before making a choice that is expensive to reverse: the stack, data store, capacity-locking approach, payment provider, hosting, authentication, or an integration pattern. Process and template: [decisions/README.md](decisions/README.md).

## Setup and troubleshooting docs

When code first becomes runnable, the same change adds a setup runbook and starts a troubleshooting page using the templates in [documentation-guide.md](documentation-guide.md#documenting-setup-and-troubleshooting-once-code-exists). Do not merge runnable code without them.
