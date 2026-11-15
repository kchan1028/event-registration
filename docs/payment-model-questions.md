# Payment model questions

Status: Proposed, written November 14, 2026. No provider has been contacted and no model is chosen. The prototype's checkout is simulated and moves no money. The owner and status of this question are tracked in the [Phase 0 discovery kit](discovery/external-requirements.md#status).

Before any live payment, the club must decide who collects the money, who the rider's card statement names, who pays fees, and who absorbs refunds and disputes. That is [open decision 5](../product.md#open-decisions) in product.md, and the rules in [Money and reporting](../product.md#6-money-and-reporting) apply whatever the answer. This page lays out the choices and the questions to answer, first inside the club and then with payment providers.

## The decision in one sentence

Choose a payment model where the club (or each organizer) is paid through a provider's hosted checkout, card details never touch this product, and the treasurer can match every entry, refund, and fee to the provider's statements.

## Models to compare

| Model | How it works | Main trade-off |
|---|---|---|
| A. Club account | The club opens its own account with a provider. Checkout runs on the provider's hosted page under the club's name, and money settles to the club's bank | Simplest money trail and the club controls refunds; each new club or organizer needs its own account and setup |
| B. Platform with connected accounts | The product holds a platform account and each organizer connects their own account to it. The provider pays each organizer directly and can take a platform fee | Scales to many organizers; the product takes on onboarding, compliance, and support duties |
| C. Platform collects and pays out | The product collects all money and pays organizers later | Usually means acting as merchant of record or a payment facilitator, with licensing, tax, and liability burdens; out of proportion for a club project. Listed only to rule out |
| D. Club keeps its current processor | The club's existing payment processor runs checkout, if it offers a hosted page, payment notifications, and refunds through an API | No new account or onboarding; depends entirely on what the current processor supports |

The first pilot needs only one club, so model A, or model D if the club's current processor qualifies, is the likely starting point. The goal is to choose an operating model to test in Phase 2, not to sign up with a provider yet. Model B matters only if other clubs adopt the product, which the roadmap defers until demand is observed ([Phase 6](../roadmap.md#phase-6--expand-only-from-observed-demand)).

## Questions for the club

Answer these with the treasurer and race director before talking to providers.

| # | Question | Answer | Date |
|---|---|---|---|
| 1 | Which legal entity receives entry fees (club, a nonprofit, an individual)? Does it already have a bank account and a payment provider? Which model would the club accept, and who must approve it? | | |
| 2 | Is the club tax-exempt? Does anyone need tax forms for the money collected? | | |
| 3 | Who may issue refunds, and up to what amount without a second person? | | |
| 4 | Who handles a disputed card charge, and how is the race day's evidence (entry, waiver, check-in) gathered? | | |
| 5 | Does the club absorb processing fees, pass them to riders, or split them? Is a per-entry platform fee acceptable ([business model hypothesis](../product.md#business-model-hypothesis))? | | |
| 6 | How soon after registration closes does the club need the money? | | |
| 7 | What does the treasurer need to reconcile: per-entry lines, discounts, fees, refunds, payout references? In what format? | | |
| 8 | Are free or discounted junior entries funded by someone else, and how should that appear in the books? | | |

## Questions for each payment provider

Ask the same questions of every provider considered, and compare the answers side by side. Prefer written answers or links to the provider's published terms.

| # | Question | Why it matters |
|---|---|---|
| 1 | Do you offer a hosted checkout page so we never handle card numbers? Which payment methods (cards, wallets, bank transfers)? | Card data must never touch this product ([coding guide](coding-guide.md#payments-retries-duplicate-events-and-reconciliation)) |
| 2 | Under model A, who is the merchant of record, and what name appears on the rider's statement? | Riders should recognize the charge; fewer disputes |
| 3 | What are the fees per transaction, per refund, and per dispute? Are fees returned on a refund? Any nonprofit pricing? | Sets the rider-facing fee and the club's costs |
| 4 | How long do payouts take, and can they be held or scheduled? | Cash timing for the club |
| 5 | Can we refund part of an order (one entry of two)? Is there a time limit? | Required by product.md for entry-level refunds |
| 6 | How are disputes handled, what evidence do you accept, and what are the deadlines? | Assigns dispute work and cost |
| 7 | Do you send a signed server notification for every payment event, retry it if missed, and give each event an ID so repeats can be ignored? | The product must process each payment once ([payment retry](../product.md#core-flows-and-acceptance-criteria)) |
| 8 | Can a payment carry our order ID, and can we look up a payment by it? | Links each charge to the right entries |
| 9 | Is there a test mode with test cards, separate from live keys? | Development and rehearsal without real money |
| 10 | What reports or exports can a treasurer download (per payment, refund, fee, payout)? | Reconciliation |
| 11 | What does account opening require (identity checks, documents, business type), and how long does it take? | Lead time before a pilot |
| 12 | What tax forms do you issue, and to whom? | Club bookkeeping |
| 13 | For model B: can organizers connect their own accounts, and can the platform take a fee? Who handles organizer identity checks and support? | Only if other clubs adopt the product |

Record each provider's answers in the findings table below, with the source link and the date of every figure.

## Findings

| Provider or model | Question | Finding | Date | Source |
|---|---|---|---|---|
| | | | | |

## What the answers decide

- **Choose the model and provider.** Record the choice as an [ADR](decisions/README.md), with the reasons and the alternatives considered. A payment provider is a significant technical choice under [CONTRIBUTING.md](../CONTRIBUTING.md).
- **Update product.md.** Replace "establish who collects funds" with the confirmed merchant of record, payout, refund, and dispute owners, with source and date.
- **Update the roadmap.** Phase 2 ("Build the registration core") depends on a settled payment model; mark that dependency resolved in [roadmap.md](../roadmap.md#delivery-status) only when the ADR is accepted.

Until then, nothing in this repository creates a provider account, stores keys, or takes a live payment.
