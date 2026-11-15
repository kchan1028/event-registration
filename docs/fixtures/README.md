# Fixtures

Status: In use. The rider demo loads these fixtures (transcribed in `src/shared/fixtures.ts`), and `tests/pricing.test.ts` checks that file against this folder and reproduces every worked order total below. These files hold fake, illustrative data for the local build and automated tests. No real rider data belongs in this folder. The fictional purchase-flow events use illustrative prices. Berkeley Omnium is a promoter-approved real event used in the demo with organizer-supplied pricing; see [events.md](events.md). These fixtures do not verify current USA Cycling rules. Never add real names, emails, birth dates, license numbers, or emergency contacts here.

| File | Purpose |
|---|---|
| [events.md](events.md) | Readable event structure, pricing, packages, and expected totals, Standalone Berkeley Hills Road Race and Berkeley Streets Criterium data |
| [demo-purchase-flow.yaml](demo-purchase-flow.yaml) | Events, races, registration categories, prices, fees, discounts, a bundle, demo riders, and validation messages for the [clickable demo purchase flow](../../product.md#2a-clickable-demo-purchase-flow--phase-1) |
| [sample-waiver.md](sample-waiver.md) | Placeholder waiver text for the demo. Not the USA Cycling waiver and not legally valid |
| [sample-start-list.csv](sample-start-list.csv) | Start list exported by the app for the fictional riders, for the [timer export review](../timer-export-review.md). IDs are examples |

The YAML format is illustrative, not a schema. The real format is decided with the technology stack [ADR](../decisions/README.md). Money is integer cents, as the [pricing rules](../coding-guide.md#pricing) require.

## Fee rules (demo values)

- Demo platform fee: $3.00 once per order.
- Demo processing fee: 3% of the entries subtotal after discounts, rounded half up to the cent.
- Second race discount (Demo Valley Criterium only): $10.00 off once per order with two or more entries on the same day.

## Worked demo orders

Each walk-through uses the fixtures above. A demo built from these files should produce exactly these totals. All payments are simulated.

| Order | Rider | Selection | Entries | Discount | Platform fee | Processing fee | Total | Readiness after confirmation |
|---|---|---|---|---|---|---|---|---|
| Two races, one day | Alex Demo | Men Cat 4/5 ($35.00) + Open Cat 4/5 Evening ($30.00) at Demo Valley Criterium | $65.00 | −$10.00 | $3.00 | $1.65 | **$59.65** | Ready for check-in (simulated license valid, sample waiver signed) |
| Weekend bundle | Blake Demo | Masters 35+ Cat 3/4 Road Race (Sat) + Masters 35+ Cat 3/4 Criterium (Sun) | $75.00 (bundle) | $0.00 | $3.00 | $2.25 | **$80.25** | Ready for check-in |
| Junior with guardian | Casey Demo (guardian Jordan Demo signs) | Juniors 10-14 at Demo Valley Criterium | $15.00 | $0.00 | $3.00 | $0.45 | **$18.45** | Ready for check-in; guardian signature recorded |
| Uncertain license | Sam Demo | Women Cat 3/4/5 at Demo Valley Criterium | $35.00 | $0.00 | $3.00 | $1.05 | **$39.05** | Paid (simulated) but **needs license review**; not cleared to race |

## Error and edge cases to show

- **Full category.** Masters 35+ Cat 3/4 at Demo Valley Criterium is at its cap (60 of 60). It shows as "Full" with the availability message and cannot be selected.
- **Ineligible category.** Alex Demo (racing age 29) sees Masters 35+ categories marked as not matching, with the reason.
- **Missing required fields.** Continuing with blank required fields shows the matching message from `validation_messages` next to each field and in a summary at the top of the step.
- **Minor without guardian.** Casey Demo cannot continue past racer details until a guardian is entered.
- **Bundle needs both days.** Choosing the weekend bundle requires one eligible race on each day; a half-selected bundle cannot reach order review.

## Berkeley Omnium package

The existing [executable Berkeley fixture](../../src/shared/berkeleyOmnium.ts) still loads the combined Omnium with its $130 package and podium nomination. The separate [events.md reference](events.md) now describes only the requested standalone road race and criterium; the [standalone fixture](../../src/shared/berkeleyEvents.ts) implements it through the dedicated seed described in [SETUP.md](../../SETUP.md).

## Generated race case studies

Status: Implemented and verified with automated unit, API, and representative browser tests. The reference clock is `2027-03-15T18:00:00.000Z`. Event, category, and simulated entry identifiers are stable across runs. All people, clubs, places, contacts, and transactions are fictional. `example.test` addresses and numbers in the reserved `202-555-01xx` range prevent accidental contact. Simulated payment attempts never contact a provider or move money.

Load the complete collection into the configured local PostgreSQL database:

```bash
npm run seed:cases -- --owner you@example.com
```

`--owner` (or `SEED_OWNER_EMAIL`) gives the email you sign in with the owner role on the case-study organization. List or load one scenario, or remove only this collection:

```bash
npm run seed:cases -- --list
npm run seed:cases -- --scenario criterium
npm run seed:cases -- --reset
```

Set `DATABASE_URL` on every command to use a dedicated database. A rerun preserves the existing generated events and their IDs. Reset deletes only the organization with the reserved ID `org_demo_case_studies_v1` and its related records. It does not delete organizer-created organizations or events.

| Scenario | User problem and task | Initial data and rules | Expected outcomes | Features exercised | Availability |
|---|---|---|---|---|---|
| `criterium` | Rider finds an eligible field, adds a second race, or registers a junior; organizer explains unavailable fields | One day, several fields, a same-day $10 discount, one full field, one field with one place left, one explicitly closed field, junior guardian rules, and several eligibility paths | Full and closed entries cannot be held; the nearly full field takes one more rider; the discount applies once; a junior needs a matching guardian signature | Eligibility, capacity, discount precedence, schedule conflicts, guardian validation, accented and long-text browser input | Clickable demo and automated tests |
| `road-shared-field` | Organizer checks whether separate categories sharing a start or capacity pool can accept another rider | Saturday road race categories, shared starts, classification codes, category caps, capacity pools, scheduled price change, and day-of surcharge | A rider counts once in each applicable shared limit; final-place reservations are atomic; early, standard, late, and race-day prices are deterministic | Shared capacity, classifications, pricing boundaries, unknown-license review | Clickable demo and automated tests |
| `omnium` | Rider compares individual entries with a two-day package, recovers from a decline, and reaches confirmation; organizer resolves a license review | Saturday road race, Sunday criterium, one same-event package, seeded successful, duplicate, declined/retried, and expired simulated payment examples; one ready rider and one paid rider awaiting fictional license review | Both package races are required; the package total and fees remain itemized; duplicate attempt IDs do not duplicate entries; expired holds release capacity; paid entries can remain blocked by license review; the ready control can be used for check-in rehearsal | Package pricing, all-or-none holds, payment recovery, separate payment/readiness states, check-in, organizer CSV exports | Clickable demo and automated tests |
| `empty-event` | Organizer starts with no categories and needs a clear first action | Valid draft shell with one day and race, no categories, starts, or entries | The event stays draft-only and never appears as rider-ready; organizer can add the first category | Empty states and first-run setup | Clickable organizer demo and browser test |
| `large-event` | Organizer reviews layout and response time under substantial but valid data | 120 categories, 1,000 deterministic simulated entries, long labels, accented characters, and valid maximum-shaped records | Schedule renders all categories without losing actions or relationships; IDs and counts remain stable | Dense tables, long text, bulk data, performance smoke coverage | Clickable demo and browser test |

The collection supplements, rather than replaces, the focused rule tests. Existing tests still cover simultaneous last-place requests, all-or-none package reservation, duplicate client requests, repeated payment notifications, late payment after expiry, transfers, withdrawals, waitlist offers, check-in transitions, and CSV output.

### Future-requirement cases

These workflows are not represented as working fixtures:

| Case | Expected future behavior | Why it is not clickable now |
|---|---|---|
| Series package spanning separate events or organizations | Reserve every component atomically, preserve each accepted version, obtain organizer approvals, and reconcile revenue and refunds per organization | Current packages and orders belong to one event; multi-organization Stripe and authorization decisions are unresolved |
| Automated waitlist fulfillment | Notify the next rider, protect offer priority, expire safely, and retry delivery without duplicate offers or charges | Organizer-managed waitlists and offer links exist, but automated delivery and charging do not |
| Real refund | Update provider, ledger, receipt, entry, capacity, and package allocation exactly once | Payments are simulated and Stripe refunds are not connected |
| Rider-to-rider transfer | Obtain recipient consent, recheck eligibility and capacity, collect a new waiver, and preserve audit history | Current transfer means an organizer moving an entry between categories, not changing the participant |
| Cancelled event | Stop new sales, preserve paid records, communicate next steps, and reconcile refunds or credits | The event model has category open/closed states but no event cancellation lifecycle |
| Outstanding post-order waiver resolution | Block check-in until an approved electronic or paper acceptance records version, signer, source, and time | Checkout requires the sample waiver before an order is created; no approved external waiver workflow exists |
