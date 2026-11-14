# CycleReg: registration and race-day operations for U.S. road races and criteriums

CycleReg (working name; availability not checked) is a proposed registration and race-day platform for volunteer-run U.S. bike races. Its first release targets road races, criteriums, and two-day road race plus criterium weekends. The goal is measurable: less volunteer time spent on setup, registration exceptions, check-in, and handing the event to next year's organizer.

> **Status: local prototype of the organizer category builder and rider checkout.** You can build a road race and criterium weekend, publish it, and register as a rider for one day or both, with bundle pricing, held places, and a **simulated** payment, all on your own computer. Real payments, USA Cycling license and waiver checks, and sign-in with MFA are **not built** and are shown as pending in the app. Do not host or share the prototype. Phase 0 discovery has not started.

## Who it serves and the problem it solves

Small race committees run multi-race weekends with a handful of volunteers. Riders have to pick the right field, understand what they are paying for, finish their paperwork, and collect a bib. Organizers have to keep fields, payments, waivers, and start lists correct across several races and days. When something goes wrong, the fix is manual work for a few people, often on race morning.

CycleReg proposes a guided cycling workflow: categories modeled the way road and criterium fields actually work, one prioritized exception queue, a fast ready-or-blocked check-in screen, and event templates a successor can reuse.

| User | What they need from CycleReg |
|---|---|
| Race director | Correct categories, limits, fees, and exports with little manual reconciliation |
| Registration lead | One prioritized exception queue with the reason and next action |
| Check-in volunteer | Fast lookup and an unmistakable ready or blocked result |
| Rider or parent | Clear fields, total cost, requirements, receipt, and check-in instructions |
| Timer or official | Reliable start lists with stable identifiers in an agreed format |
| Club treasurer | Entries, refunds, fees, and payouts that trace to one ledger |
| Successor organizer | Reusable setup, role access, history, and an operating guide |

Berkeley Omnium (Berkeley Bicycle Club) is the reference scenario and proposed first design partner. It is not an approved migration, and it stays on its current registration system until the launch criteria in [product.md](product.md#launch-criteria) pass.

## What works today

The organizer workspace runs locally and is covered by automated tests. Screens below use the labeled demonstration weekend, which is example data, not an approved race schedule.

![Category schedule for the example Saturday road race, with the start-group field board on the right](docs/screenshots/02-category-schedule.png)

The category schedule lists what riders buy, grouped under display headers that never set limits. The field board on the right shows each start group as a clip of category tags with one tally for the shared field: Masters 50+ has 35 of its 40 places, and the combined 60-rider pool leaves 25 for Masters 60+.

| Organizer task | Status |
|---|---|
| Create an organization and a draft event from a road race, criterium, or two-day weekend template | Implemented |
| Create, duplicate (flagged for review), reorder, archive, and edit categories | Implemented |
| Eligibility by license category, license type, racing age, competition class, and collegiate path, with OR between paths | Implemented and tested |
| Prices with scheduled changes and day-of surcharge; registration windows | Implemented |
| Distance and laps, laps only, or minutes plus laps (for example 45 min + 3 laps) | Implemented and tested |
| Start groups that keep separate classification codes | Implemented and tested |
| Category caps, start group field limits, and shared capacity pools, with a rider counted once | Implemented and tested, including two simultaneous requests for the last place |
| Rider-facing schedule preview with an eligibility checker | Implemented |
| Validation that blocks publishing on errors; warnings need acknowledgement; immutable published versions | Implemented and tested |
| Autosave to a local SQLite database, safe against stale saves | Implemented and tested |
| Rider demo purchase flow (product.md 2a): browse events, demo rider picker, start-ordered schedule with conflict warnings, bundles, second-race discount, demo fees, emergency contact, typed-name waiver signature, error summaries, all-or-nothing 10-minute holds, "Complete simulated payment" with decline and retry | Implemented and tested in light and dark themes; usability test with people still open |
| Confirmation with a check-in code and per-entry readiness; organizer Registrations queue with license review | Implemented and tested |
| Registration open and close times enforced in the event's time zone (demo events can let testers register early, labeled "Demo mode") | Implemented and tested |
| Light and dark themes, following the system setting, with a header toggle | Implemented; contrast checked manually, no automated test yet |
| CSV import, change-impact preview, real payments and refunds, check-in, exports | Planned |

<details>
<summary>More screens: category editor, rider preview, publishing, rider checkout, registrations, phone layouts</summary>

![Category editor with eligibility conditions for Masters 35+ Cat 3/4](docs/screenshots/04-category-editor.png)

![Rider preview checking which races a 52-year-old Cat 3 woman can enter](docs/screenshots/05-rider-preview.png)

![Review and publish page with error and warning counts](docs/screenshots/06-review-and-publish.png)

![Category schedule on a 390-pixel-wide phone screen](docs/screenshots/07-mobile-schedule.png)

![Choose an event: the two fixture demo events](docs/screenshots/09-register-choose-event.png)

![Demo rider Alex picks two races on one day; the second-race discount and demo fees appear in the order total](docs/screenshots/10-register-choose-races.png)

![The same step on a phone, with the total in a bottom bar](docs/screenshots/11-mobile-register.png)

![Racer details with an error summary at the top and a message next to the field](docs/screenshots/12-register-error-summary.png)

![Waiver with version, read confirmation, and a typed-name signature](docs/screenshots/13-register-waiver-signature.png)

![Review step with places held and the simulated payment buttons](docs/screenshots/14-register-review-and-pay.png)

![Confirmation with a demo order number, check-in code, readiness, and a watermarked demo receipt](docs/screenshots/15-registration-confirmed.png)

![Organizer Registrations view](docs/screenshots/16-organizer-registrations.png)

</details>

### Try it locally

You need Node.js 20 or later. Full steps and troubleshooting: [docs/runbooks/local-setup.md](docs/runbooks/local-setup.md).

```bash
npm ci
```

```bash
npm run dev
```

Open `http://127.0.0.1:5273/` and select **Load demonstration event**, or create your own organization. To try the rider demo, select **Open the rider demo** on the home page; it loads the fictional events, riders, and fees from `docs/fixtures`. Any event you publish also appears in the rider event list. Run the checks with `npm run check` (typecheck, unit and API tests, build) and `npm run test:e2e` (browser tests).

## How it is meant to work

The diagrams below describe behavior from [product.md](product.md). The rider journey is implemented as a prototype with **simulated** payment; real payment confirmation and the race-day scan are planned. In the organizer workflow, the "Before registration opens" steps are implemented except CSV import, category questions, and bib ranges; the exception queue is a prototype; race day and after-event stages are planned.

### 1. Rider registration journey

```mermaid
flowchart TD
    A["Open the published race schedule"] --> B["Enter rider details once, or reuse a saved profile"]
    B --> C["Eligible categories are highlighted, with reasons for unavailable ones"]
    C --> D{"Choose entries"}
    D -->|"Single day"| E["Pick a category in that race"]
    D -->|"Weekend bundle"| F["Pick a valid category in each component race"]
    D -->|"Extra criterium"| G["Add a second race that does not conflict"]
    E --> H["Itemized preview: entries, discounts, fees, total, refund policy"]
    F --> H
    G --> H
    H --> I["Short-lived capacity reservation, all bundle entries or none"]
    I --> J["Payment provider's hosted payment page"]
    J --> K{"Authoritative payment confirmation?"}
    K -->|"Confirmed"| L["Entries confirmed and receipt sent"]
    K -->|"Failed or expired"| M["Reservation released and rider told what happened"]
    L --> N{"Ready to race?"}
    N -->|"Waiver missing"| O["Sign the current waiver version"]
    N -->|"License not verified"| P["Held for organizer review"]
    O --> N
    P --> N
    N -->|"All clear"| Q["Cleared, with a check-in code"]
    Q --> R["Race day: scan the code and collect a bib"]
```

A rider can see the whole schedule before signing in. After entering their details once, they see which categories they qualify for and why others are unavailable. They can buy one race, a weekend bundle, or an extra criterium, and they see one itemized total before paying. Places are held briefly during checkout; a bundle holds every entry or none. Entries are confirmed only when the payment provider confirms payment. Paying does not by itself clear a rider to race: a missing waiver or an unverified license keeps them in a review state until it is resolved.

### 2. Organizer setup and race-day workflow

```mermaid
flowchart TD
    subgraph Setup["Before registration opens"]
        S1["Choose a template: road race, criterium, or two-day weekend"] --> S2["Add, duplicate, or import categories from CSV into a draft"]
        S2 --> S3["Set eligibility, pricing, race length, and registration windows"]
        S3 --> S4["Combine categories into start groups and set category caps and shared capacity pools"]
        S4 --> S5["Add questions, waivers, bib ranges, bundles, and discounts"]
        S5 --> S6["Preview the rider schedule and simulate rider profiles"]
        S6 --> S7{"Validation errors?"}
        S7 -->|"Yes"| S3
        S7 -->|"No"| S8["Publish a versioned configuration"]
    end
    subgraph Open["While registration is open"]
        R1["Work the exception queue: license review, missing waivers, failed payments, duplicates"]
        R2["Change a published category"] --> R3["Impact preview: affected riders, orders, and exports"]
        R3 --> R4["Resolve affected entries, keeping the accepted price and rules on record"]
    end
    subgraph RaceDay["Race day"]
        D1["Timestamped start-list snapshot per race"] --> D2["Check-in: search or scan, see ready or blocked"]
        D2 --> D3["Assign a bib from the configured range"]
        D3 --> D4["Record changes and export a revised start list to the timer"]
        D5["Printable roster and exception checklist as a fallback"]
    end
    subgraph After["After the event"]
        A1["Reconcile the ledger with payment provider records"] --> A2["Copy the event as a template without riders, payments, or signatures"]
        A2 --> A3["Transfer ownership to a successor organizer"]
    end
    S8 --> R1
    S8 --> R2
    R1 --> D1
    R4 --> D1
    D1 --> D5
    D4 --> A1
```

Setup happens in a draft. The organizer builds the category schedule, groups categories into start groups with explicit shared limits, previews what riders will see, and publishes only after validation passes. Once registration is open, the exception queue collects the work that needs a person. Any change to a published category shows who it affects before it takes effect, and paid entries keep the price and rules they were sold under. On race day, volunteers check riders in against a start-list snapshot, assign bibs, and send revisions to the timer, with a printed roster in case the connection fails. Afterwards the treasurer reconciles the money, and the event can be copied and handed to a successor.

### 3. How weekends, races, categories, and capacity relate

```mermaid
erDiagram
    ORGANIZATION ||--o{ EVENT_WEEKEND : runs
    EVENT_WEEKEND ||--|{ RACE_DAY : contains
    RACE_DAY ||--|{ RACE : schedules
    RACE ||--|{ REGISTRATION_CATEGORY : offers
    RACE ||--|{ START_GROUP : starts
    START_GROUP ||--|{ REGISTRATION_CATEGORY : "starts together"
    REGISTRATION_CATEGORY }|--|{ CLASSIFICATION : "scored as"
    DISPLAY_GROUP |o--o{ REGISTRATION_CATEGORY : "lists under a header"
    CAPACITY_POOL }o--o{ REGISTRATION_CATEGORY : "shares a limit across"
    CAPACITY_POOL }o--o{ START_GROUP : "shares a limit across"
    EVENT_WEEKEND ||--o{ BUNDLE : offers
    BUNDLE ||--|{ BUNDLE_COMPONENT : includes
    BUNDLE_COMPONENT }o--|| RACE : "one entry in"
```

This is the conceptual model. Everything except bundles is implemented in the prototype's configuration document ([src/shared/schema.ts](src/shared/schema.ts)); bundles are planned. An organization runs event weekends; each weekend has race days, and each day has races. Within a race, six concepts stay separate so that one setting never changes another by accident:

- Registration category: what a rider buys, such as Masters 35+ Cat 3/4, with its own eligibility and price.
- Start group: the categories that start together under one field limit.
- Classification: the code the timer uses for scoring, so two masters age groups can share a start and still be scored separately.
- Display group: a heading on the schedule. It controls layout only and never creates a limit.
- Capacity pool: an explicit limit shared across chosen categories or start groups.
- Bundle: one purchase, such as a road race plus criterium weekend entry, with one entry in each component race. The rider picks a valid category for each day.

Full definitions are in [product.md](product.md#keep-the-concepts-separate).

## First-release scope

Planned for the first release (see [product.md](product.md#scope-of-the-first-release)):

- Event and weekend setup, including the road race and criterium category builder (P0)
- Mobile-friendly rider registration with guardian entry, waivers, and license review status
- Short-lived capacity reservations and atomic enforcement of shared limits
- Organizer workspace with search, exception filters, audited corrections, and roles
- Race-day check-in, bib assignment, start-list snapshots, and timer exports
- Hosted payments, partial refunds, and a reconciliation report

Out of scope at first: timing hardware, results and omnium points scoring, rankings, other cycling disciplines, international federations, event discovery, fundraising, offline check-in sync, and a native mobile app.

## Project status and next milestone

| Item | Status |
|---|---|
| Product brief and roadmap | Drafted; proposed, not approved |
| Repository and contributor documentation | Implemented November 14, 2026 |
| Category builder milestone (local organizer prototype) | Implemented November 14, 2026; shared-cap, eligibility, and fixture criteria verified by automated tests. See [roadmap.md](roadmap.md#category-builder-milestone) |
| Rider checkout prototype (simulated payment) | Implemented November 14, 2026; buy-both-days, payment retry, license uncertainty, multi-race discount, and bundle criteria verified by automated tests. See [roadmap.md](roadmap.md#rider-checkout-prototype) |
| Demo purchase flow fixtures (fake data) | Implemented November 14, 2026; used by the rider demo |
| Stack | Chosen for the prototype only: [ADR 0001](docs/decisions/0001-stack-for-category-builder-milestone.md) |
| Rider checkout, payments, USA Cycling checks, sign-in with MFA, hosting | Not built |

**Next milestone: Phase 0 exit gate, plus the rest of Phase 1.** Phase 0 shows whether a recurring volunteer workload problem exists and whether a custom product has a credible advantage over improving the current setup; if not, the roadmap says to stop the build. The remaining Phase 1 work is a clickable rider checkout and check-in prototype, sample timer exports, and a usability test where the registration lead recreates an anonymized real schedule in the category builder. The first actions are in [roadmap.md](roadmap.md#next-actions).

## Documentation

| Document | What it covers |
|---|---|
| [product.md](product.md) | Source of truth for requirements, scope, flows, business rules, and acceptance criteria |
| [roadmap.md](roadmap.md) | Source of truth for phases, priorities, dependencies, risks, and delivery status |
| [CONTRIBUTING.md](CONTRIBUTING.md) | How to propose, make, and review a change |
| [SECURITY.md](SECURITY.md) | How to report a security problem privately, and a summary of security requirements |
| [ACCESSIBILITY.md](ACCESSIBILITY.md) | Accessibility target, how it will be checked, and how to report a barrier |
| [LICENSE.md](LICENSE.md) | MIT License |
| [docs/architecture.md](docs/architecture.md) | What is built, the proposed target architecture, and open technical questions |
| [docs/runbooks/local-setup.md](docs/runbooks/local-setup.md) | Install, run, and test the prototype; [troubleshooting](docs/runbooks/troubleshooting.md) |
| [DESIGN.md](DESIGN.md) | Visual system of the organizer workspace |
| [docs/coding-guide.md](docs/coding-guide.md) | Category and capacity modeling, eligibility, pricing, payments, privacy, accessibility, testing |
| [docs/documentation-guide.md](docs/documentation-guide.md) | How docs are organized, status vocabulary, glossary, and setup and troubleshooting templates |
| [docs/content-guide.md](docs/content-guide.md) | Rules for future public pages, including SEO, answer engines, and structured data |
| [docs/operations.md](docs/operations.md) | Proposed operating model: support owners, incident severity, freezes, monitoring, backups, and handoff |
| [docs/decisions/README.md](docs/decisions/README.md) | Architecture decision records, including [0001](docs/decisions/0001-stack-for-category-builder-milestone.md), and the backlog of unresolved decisions |
| [docs/fixtures/README.md](docs/fixtures/README.md) | Fake demonstration data and sample waiver text for the planned Phase 1 demo purchase flow |

## Contributing

Read [CONTRIBUTING.md](CONTRIBUTING.md) first. Every change must review both [product.md](product.md) and [roadmap.md](roadmap.md) for impact and say in its summary what changed in each, or why neither needed to change.

## Security and accessibility

Report security problems privately as described in [SECURITY.md](SECURITY.md). The accessibility target and how to report a barrier are in [ACCESSIBILITY.md](ACCESSIBILITY.md).

## License

Released under the [MIT License](LICENSE.md).
