# Fixtures

Status: In use. The generated case-study collection and combined Berkeley Omnium fixture supply local testing data. Shared fictional riders and the sample waiver live in `src/shared/fixtures.ts`; generated pricing sources live in `src/shared/caseStudySources.ts`. The two legacy purchase-flow events and their YAML fixture/loader were removed by owner decision on November 15, 2026. Browsing rider events never seeds data. These fixtures do not verify federation rules. Never add real rider or contact data here.

| File | Purpose |
|---|---|
| [BBC TTT research example](../case-studies/organizer-templates/berkeley-bicycle-club-team-time-trial.md) | Read-only published historical identity; team/TT model unsupported; `seed:bbc-ttt` |
| [Pinole TTT research example](../case-studies/organizer-templates/pinole-team-time-trial.md) | Read-only published predecessor study with explicitly non-event date placeholder; `seed:pinole-ttt` |
| [Wente](../case-studies/organizer-templates/wente-vineyards-classic.md) | Historical identity and synthetic road setup sample; `seed:wente` |
| [Mount Hamilton](../case-studies/organizer-templates/mount-hamilton-classic.md) | Historical full-course schedule, separate shared-start classifications; `seed:mount-hamilton` |
| [Chico](../case-studies/organizer-templates/chico-stage-race.md) | Explicit selected road/crit component sample; `seed:chico` |
| [Sunset](../case-studies/organizer-templates/sunset-criterium.md) | Historical San Rafael geared-race slot sample; `seed:sunset` |
| [Red Kite series case study](../case-studies/organizer-templates/red-kite-series.md) | Explicit three-round historical criterium sample; seed with `npm run seed:red-kite -- --owner organizer@example.test` |
| [San Francisco Grand Prix case study](../case-studies/organizer-templates/san-francisco-grand-prix.md) | Historical 2005 road race and professional admission boundary; seed with `npm run seed:sf-grand-prix -- --owner organizer@example.test` |
| [Burlingame case study](../case-studies/organizer-templates/burlingame-criterium.md) | Historical 2017 program and explicit demo assumptions; seed with `npm run seed:burlingame -- --owner organizer@example.test` |
| [events.md](events.md) | Combined Berkeley Omnium structure and prices |
| [sample-waiver.md](sample-waiver.md) | Placeholder sample waiver, not an official federation waiver |
| [sample-start-list.csv](sample-start-list.csv) | Illustrative start-list rows using generated-case labels; static example IDs, not a timer-approved format |

The worked totals below are checked against the generated criterium and omnium configurations by `tests/pricing.test.ts`. Browser registration journeys use isolated copies so concurrent tests cannot consume each other's places. Money is integer cents; all payments are simulated.

## Fee rules (demo values)

- Demo platform fee: $3.00 once per order.
- Demo processing fee: 3% of the entries subtotal after discounts, rounded half up to the cent.
- Second race discount (generated Harbor criterium): $10.00 off once per order with two or more entries on the same day.

## Worked demo orders

Each walk-through uses the generated configurations. All payments are simulated.

| Order | Rider | Selection | Entries | Discount | Platform fee | Processing fee | Total | Readiness after confirmation |
|---|---|---|---|---|---|---|---|---|
| Two races, one day | Alex Demo | Men Cat 4/5 ($35.00) + Open Cat 4/5 Evening ($30.00) at Demo Harbor Criterium: pricing and eligibility lab | $65.00 | −$10.00 | $3.00 | $1.65 | **$59.65** | Ready for check-in (simulated license valid, sample waiver signed) |
| Weekend bundle | Blake Demo | Masters 35+ Cat 3/4 Road Race (Sat) + Masters 35+ Cat 3/4 Criterium (Sun) | $75.00 (bundle) | $0.00 | $3.00 | $2.25 | **$80.25** | Ready for check-in |
| Junior with guardian | Casey Demo (guardian Jordan Demo signs) | Juniors 10-14 at Demo Harbor Criterium: pricing and eligibility lab | $15.00 | $0.00 | $3.00 | $0.45 | **$18.45** | Ready for check-in; guardian signature recorded |
| Uncertain license | Sam Demo | Women Cat 3/4/5 at Demo Harbor Criterium: pricing and eligibility lab | $35.00 | $0.00 | $3.00 | $1.05 | **$39.05** | Paid (simulated) but **needs license review**; not cleared to race |

## Error and edge cases to show

- **Full category.** Masters 35+ Cat 3/4 at Demo Harbor Criterium: pricing and eligibility lab is at its cap (60 of 60). It shows as "Full" with the availability message and cannot be selected.
- **Ineligible category.** Alex Demo (racing age 29) sees Masters 35+ categories marked as not matching, with the reason.
- **Missing required fields.** Continuing with blank required fields shows the matching message from `validation_messages` next to each field and in a summary at the top of the step.
- **Minor without guardian.** Casey Demo cannot continue past racer details until a guardian is entered.
- **Bundle needs both days.** Choosing the weekend bundle requires one eligible race on each day; a half-selected bundle cannot reach order review.

## Berkeley Omnium package

The [executable Berkeley fixture](../../src/shared/berkeleyOmnium.ts) supplies the combined Omnium with its $130 package and podium nomination. The standard `seed:berkeley` loader publishes only that combined event, without prefilled entries. The separate `seed:omnium` command creates an organizer draft with simulated capacity entries. See [events.md](events.md) and [SETUP.md](../../SETUP.md).

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
| `omnium` | Rider compares individual entries with a two-day package, recovers from a decline, and reaches confirmation; organizer resolves a license review | Saturday road race, Sunday criterium, one same-event package, and the orders in [Reusable rehearsal coverage](#reusable-rehearsal-coverage) | Both package races are required; the package total and fees remain itemized; duplicate attempt IDs do not duplicate entries; expired holds release capacity; paid entries can remain blocked by license review; Taylor Example is two riders with different teams and ages | Package pricing, all-or-none holds, payment recovery, separate payment/readiness states, check-in, organizer CSV exports | Clickable demo and automated tests |
| `empty-event` | Organizer starts with no categories and needs a clear first action | Valid draft shell with one day and race, no categories, starts, or entries | The event stays draft-only and never appears as rider-ready; organizer can add the first category | Empty states and first-run setup | Clickable organizer demo and browser test |
| `large-event` | Organizer reviews layout and response time under substantial but valid data | 120 categories, 1,000 deterministic simulated entries, long labels, accented characters, and valid maximum-shaped records | Schedule renders all categories without losing actions or relationships; IDs and counts remain stable | Dense tables, long text, bulk data, performance smoke coverage | Clickable demo and browser test |

The collection supplements, rather than replaces, the focused rule tests. Existing tests still cover simultaneous last-place requests, all-or-none package reservation, duplicate client requests, repeated payment notifications, late payment after expiry, transfers, withdrawals, waitlist offers, check-in transitions, and CSV output.

### Reusable rehearsal coverage

Reviewed November 23, 2026. A rerun of `npm run seed:cases` keeps a case study that is already loaded. Reset the case-study collection before expecting the rows added in this review. Reset drops the case-study organization's finance membership with the organization and leaves the fictional finance account in place. The next omnium load finds that account and grants finance again.

Morgan Example's three omnium orders share one name, email, team, and racing age, so a name search does not separate the ready order from the blocked one. None of these orders has a configured bib range, a recorded check-in, or a start-list lock. Payments are simulated. No seeded order has a provider checkout session. One paid Saturday order has a simulated partial refund of $10, and that entry stays confirmed.

| Request id | Event and category | Rider | What it is for |
|---|---|---|---|
| `case-study-successful` | Omnium, Saturday Masters road race | Morgan Example, Fictional Wheel Club, racing age 40 | Paid twice with the same simulated attempt id, then the license is reviewed. Ready for check-in once a bib range exists. Emergency contact Riley Example. |
| `case-study-declined-retried` | Omnium, Saturday Masters road race | Morgan Example, same details | Simulated decline, then a successful retry. Paid, license not reviewed. |
| `case-study-expired` | Omnium, Saturday Masters road race | Morgan Example, same details | Hold timestamp is year 2000. The stored status stays held and reads as expired, so the place is not reserved. |
| `case-study-taylor-ready` | Omnium, Saturday Masters road race | Taylor Example, Blue Demo Team, racing age 41 | Paid and license reviewed. Same name as the next row, different team, age, email, and phone. |
| `case-study-taylor-blocked` | Omnium, Saturday Masters road race | Taylor Example, Gold Demo Team, racing age 52 | Paid, license not reviewed. Use with the ready Taylor when a rehearsal has to tell two matching names apart. |
| `case-study-active-hold` | Omnium, Saturday Masters road race | Quinn Example, Fictional Hold Club, racing age 44 | Unpaid hold with no payment attempt, no checkout session, and no checkout-started timestamp. The hold stays open through 2027-05-14 18:00 UTC, before the Saturday road race. Staff release can use this hold. |
| `case-study-sunday` | Omnium, Sunday Masters criterium | Robin Example, Fictional Sunday Club, racing age 43 | Paid and license reviewed. Entered only on Sunday, so a Saturday lookup is the other-day case. |
| `case-study-checkout-started` | Omnium, Saturday Masters road race | Cameron Example, Fictional Checkout Club, racing age 46 | Unpaid hold with a checkout-started timestamp and no payment session. The hold stays open through the same time as Quinn's. Staff release must refuse it. After 2027-05-14 18:00 UTC a fresh seed no longer has either open hold. |
| `case-study-weekend` | Omnium, Saturday Masters road race and Sunday Masters criterium | Parker Example, Fictional Weekend Club, racing age 47 | Paid weekend package. Both entries are license reviewed. The weekend browser spec still builds its own package order. |
| `case-study-withdrawn` | Omnium, Saturday Masters road race | Drew Example, Fictional Withdrawal Club, racing age 48 | Paid, then the entry is withdrawn. The order stays confirmed. There is no refund row. |
| `case-study-refunded` | Omnium, Saturday Masters road race | Reese Example, Fictional Refund Club, racing age 49 | Paid, then a simulated partial refund of $10. The order and the entry stay confirmed. The license is not reviewed. The requester is a fictional finance account on this organization only (`finance-seed@example.test`). That account is not a sign-in identity. |
| `case-study-junior` | Harbor criterium, Juniors 10-14 | River Example, Fictional Junior Club, racing age 12 | Paid and license reviewed. Guardian Jordan Example signs. The usability task that registers Casey Demo is a separate demo rider, not this row. |

These development and rehearsal cases are not in the reusable seed. Automated tests build their own rows where a test is named.

| Missing case | Why it is not seeded |
|---|---|
| Missing waiver or missing guardian acceptance | Checkout requires a signed waiver before it creates an order. There is no approved way to store a missing acceptance. |
| Waitlist offer | Joining requires a full category with the waitlist turned on, and an offer then needs a free place. Harbor Masters is the full field and has no waitlist. Turning one on would change that fixture. An offer on an open omnium category would block later registration there. |
| Checked-in rider with a bib, a bib range, or a locked start list | The weekend browser spec assigns bib 100 and locks the omnium start lists during its run. The omnium rehearsal still records those steps. |

### Future-requirement cases

These workflows are not clickable as completed product behavior:

| Case | Expected future behavior | Why it is not clickable now |
|---|---|---|
| Series package spanning separate events or organizations | Reserve every component atomically, preserve each accepted version, obtain organizer approvals, and reconcile revenue and refunds per organization | Current packages and orders belong to one event; multi-organization Stripe and authorization decisions are unresolved |
| Automated waitlist fulfillment | Notify the next rider, protect offer priority, expire safely, and retry delivery without duplicate offers or charges | Organizer-managed waitlists and offer links exist, but automated delivery and charging do not |
| Real refund | Update provider, ledger, receipt, entry, capacity, and package allocation exactly once | Local test-mode organizer refunds exist. The reusable seed records one simulated partial refund on Reese Example. Live settlement and provider reconciliation remain Planned |
| Rider-to-rider transfer | Obtain recipient consent, recheck eligibility and capacity, collect a new waiver, and preserve audit history | Current transfer means an organizer moving an entry between categories, not changing the participant |
| Cancelled event | Stop new sales, preserve paid records, communicate next steps, and reconcile refunds or credits | Simulation-only atomic cancellation API and organizer controls close scopes and preserve audit evidence; provider/credit fulfillment and message delivery remain Planned (see [product rules](../../product.md#event-and-race-cancellation)) |
| Outstanding post-order waiver resolution | Block check-in until an approved electronic or paper acceptance records version, signer, source, and time | Checkout requires the sample waiver before an order is created; no approved external waiver workflow exists |
