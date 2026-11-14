# Coding guide

This guide sets the rules code must follow once implementation starts. Most of them protect three things volunteers cannot easily fix by hand on race morning: correct fields, correct money, and private rider data. No technology stack has been chosen, so the rules are written in language-neutral terms; the stack ADR will add language-specific conventions here.

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

## Naming conventions

- Use the domain terms from the [glossary](documentation-guide.md#glossary) in code: `RegistrationCategory`, `StartGroup`, `Classification`, `CapacityPool`, `DisplayGroup`, `Bundle`. Do not invent synonyms such as `Division` or `Wave` for the same concept.
- Name states exactly as `product.md` lists them (see [states](#keep-entry-payment-and-readiness-states-independent)).
- Money fields say what they hold and in what unit: `price_minor_units` with a currency code, not `price`.
- Times carry a time zone. Store instants in UTC and the event's IANA time zone (for example `America/Los_Angeles`) alongside them for display.
- Language-specific casing and file layout will be set by the stack ADR.

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
5. Enforce limits with a mechanism that is correct under concurrent checkouts, such as a database transaction with appropriate locking or an atomic conditional update. Counting rows and then inserting in two separate steps is not acceptable. The exact mechanism is an open decision (see [decisions backlog](decisions/README.md#decision-backlog)).
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

Illustrative shape for the Masters 35+ Cat 3/4 fixture (not a schema; the format will be decided during implementation):

```yaml
category: masters-35-plus-cat-3-4   # illustrative ID
eligibility:
  all_of:
    - racing_age: { min: 35 }
    - license_category: { any_of: [3, 4] }
  rule_set: { source: "<governing body document>", season: 2027, version: 1 }
```

### Pricing

- Prices are integers in minor units (cents) with a currency code. Never use floating-point numbers for money.
- Price rules cover base price, free entry, scheduled price changes, day-of surcharge, additional-race discount, and bundle price.
- Define discount precedence explicitly and prevent unintended stacking. A multi-race discount applies exactly once per qualifying purchase.
- At checkout, show an itemized total. On purchase, **snapshot** the accepted price and the rule versions on the order line. Later configuration changes never reprice a paid entry.

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

Payments use a provider's hosted payment flow. The application never sees or stores card details. The provider has not been chosen; see the [decisions backlog](decisions/README.md#decision-backlog).

### Confirm only on authoritative confirmation

- An entry becomes confirmed only after the provider's verified server-to-server notification (a webhook) or a server-side status check says the payment succeeded. A browser redirect to a "success" page is not proof of payment.
- Verify the signature on every provider notification before acting on it.

### Make every payment operation idempotent

Idempotent means doing the same thing twice has the same effect as doing it once. Riders refresh pages, networks retry, and providers resend notifications, so duplicates are normal.

- Send an idempotency key with every request that creates a charge, refund, or checkout session, so a retried request cannot charge twice.
- Store each provider event ID when it is processed. If the same event arrives again, acknowledge it and do nothing else.
- Process notifications in any order. A "refunded" event can arrive before the "paid" event it refers to; handle it by looking up current state rather than assuming order.
- Wrap "record payment" and "confirm entries" in one transaction, or make each step safe to repeat.

### Handle the awkward cases explicitly

| Case | Expected behavior |
|---|---|
| Payment fails or the rider abandons checkout | Reservation expires and the place is released; rider sees a clear message |
| Payment succeeds after the reservation expired | Do not silently confirm or silently drop. Confirm if capacity still allows; otherwise route to the exception queue for an organizer to refund or resolve |
| Duplicate notification | Recognized by event ID; no second order, charge, or entry |
| Rider refreshes or double-clicks "pay" | Same checkout session reused; one charge at most |
| Partial refund of one bundle entry | Refund recorded against that entry; capacity released for that race only; bundle price effect shown before confirming |
| Dispute (chargeback) | Payment state becomes disputed; entry state unchanged until an organizer acts |

### Reconciliation

- Keep a ledger of order totals, line items, discounts, processing and platform fees, refunds, and the provider's settlement or payout references.
- Provide a reconciliation report a treasurer can match line by line to the provider's statements.
- Run a reconciliation check that flags any order whose ledger, entry state, and provider record disagree. Unexplained differences are critical defects.

## Roles, privacy, secrets, and audit history

### Roles

The first release has these roles (from [product.md](../product.md#4-organizer-workspace)): owner, registration manager, check-in volunteer, timer/export, and finance. Riders and guardians see only their own data.

- Check permissions on the server for every request, by role and by event.
- Give each role the least access it needs. A check-in volunteer sees readiness and bib, not payment details or emergency contacts by default.
- Owners can transfer ownership to a successor without sharing credentials.

### Privacy

- Collect only the profile, contact, emergency contact, team, and license data the product requires.
- Emergency contacts are access-restricted and kept separate from general rider data.
- Check-in codes identify an entry and contain no personal details.
- Public participant lists show no sensitive data by default.
- Keep personal data out of logs, error reports, analytics, and URLs.
- Retention and deletion rules must be defined before the pilot (an open decision).

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
| Exports | Timer export round trip with the actual timer's format |
| Accessibility | Automated checks plus manual keyboard and screen-reader passes on checkout and check-in |
| Time | Events near midnight and daylight-saving changes in the event's time zone |

Use fake data in all tests. Concurrency and idempotency tests must actually run requests in parallel or replay events; a single-threaded test does not prove them.

### Review

- Every change is reviewed by someone other than the author when possible (see [CONTRIBUTING.md](../CONTRIBUTING.md#review-expectations)).
- Changes to money, capacity, eligibility, waivers, permissions, or personal data need a reviewer familiar with that area and a test for the failure case, not only the success case.
- Reviewers confirm the change summary states product and roadmap impact.

## Architecture decision records

Write an ADR before making a choice that is expensive to reverse: the stack, data store, capacity-locking approach, payment provider, hosting, authentication, or an integration pattern. Process and template: [decisions/README.md](decisions/README.md).

## Setup and troubleshooting docs

When code first becomes runnable, the same change adds a setup runbook and starts a troubleshooting page using the templates in [documentation-guide.md](documentation-guide.md#documenting-setup-and-troubleshooting-once-code-exists). Do not merge runnable code without them.
