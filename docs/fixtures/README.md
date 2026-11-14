# Fixtures

Status: In use. The rider demo loads these fixtures (transcribed in `src/shared/fixtures.ts`), and `tests/pricing.test.ts` checks that file against this folder and reproduces every worked order total below. These files hold fake, illustrative data for prototypes and automated tests. Nothing in this folder is real rider data, a real event, a real price, or a statement of current USA Cycling rules. Never add real names, emails, birth dates, license numbers, or emergency contacts here.

| File | Purpose |
|---|---|
| [demo-purchase-flow.yaml](demo-purchase-flow.yaml) | Events, races, registration categories, prices, fees, discounts, a bundle, demo riders, and validation messages for the [clickable demo purchase flow](../../product.md#2a-clickable-demo-purchase-flow--phase-1) |
| [sample-waiver.md](sample-waiver.md) | Placeholder waiver text for the demo. Not the USA Cycling waiver and not legally valid |

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
