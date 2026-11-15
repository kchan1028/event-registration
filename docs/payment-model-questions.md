# Payment model questions

Status: Proposed, written November 14, 2026. Stripe is selected by the project owner ([ADR 0002](decisions/0002-stripe-payments.md)); no provider account or integration is configured and no merchant/settlement model is chosen. The app's checkout is simulated and moves no money. Public research on Stripe recorded November 15, 2026 in [Findings](#findings); club answers from interview D01 are filled in where D01 gave them. The owner and status of this question are tracked in the [Phase 0 discovery kit](discovery/external-requirements.md#status).

Before any live payment, the club must decide who collects the money, who the rider's card statement names, who pays fees, and who absorbs refunds and disputes. That is [open decision 5](../product.md#open-decisions) in product.md, and the rules in [Money and reporting](../product.md#6-money-and-reporting) apply whatever the answer. This page lays out the choices and the questions to answer, first inside the club and then against Stripe's supported configurations and terms.

## The decision in one sentence

Choose a payment model where the club (or each organizer) is paid through a provider's hosted checkout, card details never touch this product, and the treasurer can match every entry, refund, and fee to the provider's statements.

## Models to compare

| Model | How it works | Main trade-off |
|---|---|---|
| A. Club account | The club opens its own account with a provider. Checkout runs on the provider's hosted page under the club's name, and money settles to the club's bank | Simplest money trail and the club controls refunds; each new club or organizer needs its own account and setup |
| B. Platform with connected accounts | The product holds a platform account and each organizer connects their own account to it. The provider pays each organizer directly and can take a platform fee | Scales to many organizers; the product takes on onboarding, compliance, and support duties |
| C. Platform collects and pays out | The product collects all money and pays organizers later | Usually means acting as merchant of record or a payment facilitator, with licensing, tax, and liability burdens; out of proportion for a club project. Listed only to rule out |
| D. Club keeps its current processor | The club's existing payment processor runs checkout, if it offers a hosted page, payment notifications, and refunds through an API | No new account or onboarding; depends entirely on what the current processor supports |

The provider is now Stripe. The first pilot needs one organizer, so evaluate a single-organizer Stripe model for Phase 2 without assuming a merchant-of-record answer. Model D is historical context, not the selected integration. Planned multi-organization season passes in [Phase 6](../roadmap.md#phase-6--expand-only-from-observed-demand) require a separate Connect operating-model decision, participating-organizer approvals, revenue allocation, refund/transfer reversals, and dispute/negative-balance ownership before live sale.

## Questions for the club

Answer these with the treasurer and race director before talking to providers.

| # | Question | Answer | Date |
|---|---|---|---|
| 1 | Which legal entity receives entry fees (club, a nonprofit, an individual)? Does it already have a bank account and a payment provider? Which model would the club accept, and who must approve it? | A nonprofit corporation receives the entry fees and has its own bank account. Today's provider is BikeReg. Who must approve a switch was not stated. (Project owner, in chat.) | 2026-11-15 |
| 2 | Is the club tax-exempt? Does anyone need tax forms for the money collected? | A nonprofit corporation. Whether it holds 501(c)(3) or other federal tax-exempt status was not stated. Tax reports are needed (D01). (Project owner, in chat.) | 2026-11-15 |
| 3 | Who may issue refunds, and up to what amount without a second person? | Today on BikeReg: the organizer approves refunds; riders transfer entries themselves. No amount limit or second approver was named ([D01](discovery/interviews/D01.md)). | 2026-11-14 |
| 4 | Who handles a disputed card charge, and how is the race day's evidence (entry, waiver, check-in) gathered? | No disputes or chargebacks so far (D01). The organizer would handle a dispute and gather the evidence (project owner, in chat, 2026-11-15). | 2026-11-15 |
| 5 | Does the club absorb processing fees, pass them to riders, or split them? Is a per-entry platform fee acceptable ([business model hypothesis](../product.md#business-model-hypothesis))? | Today riders pay about 10% on top and the club pays none (D01's figure, not checked against BikeReg's published fees). Platform fee acceptability not asked. | 2026-11-14 |
| 6 | How soon after registration closes does the club need the money? | Today payouts arrive by ACH within a week (D01). The club would accept a different provider or payout schedule; conditions not stated. | 2026-11-14 |
| 7 | What does the treasurer need to reconcile: per-entry lines, discounts, fees, refunds, payout references? In what format? | Reports for USA Cycling, taxes, and marketing analytics; reconciliation also covers refunds and merchandise sales, about 8 hours per event (D01). Format not stated. | 2026-11-15 |
| 8 | Are free or discounted junior entries funded by someone else, and how should that appear in the books? | Sometimes funded by a sponsor, not always. How it should appear in the books was not stated. (Project owner, in chat.) | 2026-11-15 |

## Questions for Stripe and the selected operating model

Answer these questions for the proposed Stripe configuration; provider selection does not answer the operating-model questions. Prefer written answers or links to the provider's published terms.

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

Stripe's public pages, checked November 15, 2026. Most pages show no effective date, so figures can change; confirm in the Dashboard before relying on them. "Read directly" means checked in a browser while recording this; other rows come from a research pass.

| Provider or model | Question | Finding | Date | Source |
|---|---|---|---|---|
| Stripe | 1. Hosted checkout, methods | Checkout runs on a Stripe-hosted page (redirect) or embedded; Payment Links also use it. U.S. methods include cards, Apple Pay, Google Pay, Link, ACH Direct Debit, Cash App Pay, Amazon Pay, Affirm, Afterpay, and Klarna. | 2026-11-15 | [Checkout](https://docs.stripe.com/payments/checkout), [payment method support](https://docs.stripe.com/payments/payment-methods/payment-method-support) |
| Stripe | 2. Merchant of record, statement name | The statement descriptor is the business's name (5 to 22 characters, with an optional prefix plus a per-payment suffix). Under Connect, the organizer is merchant of record with direct charges, or destination charges with `on_behalf_of`; the platform is merchant of record with destination charges or separate charges and transfers without it. For a single club account (model A) the club is the business on the account; Stripe does not state "merchant of record" for that case. | 2026-11-15 | [Statement descriptors](https://docs.stripe.com/get-started/account/statement-descriptors), [Connect merchant of record](https://docs.stripe.com/connect/merchant-of-record) |
| Stripe | 3. Fees | 2.9% + 30¢ per domestic card; +1.5% international card; +1% currency conversion; +0.5% manually entered. ACH Direct Debit 0.8%, capped at $5.00. Dispute received fee $15.00. (Read directly.) Refunds carry no extra fee but the original processing fee is not returned; a second $15 applies if you counter a dispute, refunded if you win. | 2026-11-15 | [Stripe pricing](https://stripe.com/pricing), [responding to disputes](https://docs.stripe.com/disputes/responding) |
| Stripe | 3. Nonprofit pricing | Discounted fees only for registered nonprofits whose Stripe volume is at least 80% tax-deductible donations; registration fees, ticket sales, and membership fees do not count. (Read directly.) A race-entry account would not qualify. | 2026-11-15 | [Fee discount for nonprofit organizations](https://support.stripe.com/questions/fee-discount-for-nonprofit-organizations) |
| Stripe | 4. Payouts | First payout usually 7 to 14 days after the first live payment; after that U.S. funds are available in 2 business days. Schedule can be daily, weekly, monthly, or manual. | 2026-11-15 | [Payouts](https://docs.stripe.com/payouts) |
| Stripe | 5. Partial refunds | Card payments can be refunded in part, several times, up to the original amount. ACH Direct Debit: full refunds only, within 180 days. No card refund time limit found. | 2026-11-15 | [Refunds](https://docs.stripe.com/refunds), [ACH Direct Debit](https://docs.stripe.com/payments/ach-direct-debit) |
| Stripe | 6. Disputes | Notice by email, Dashboard, and the `charge.dispute.created` event. Response window usually 7 to 21 days by card network; one evidence submission. ACH disputes cannot be contested. | 2026-11-15 | [Responding to disputes](https://docs.stripe.com/disputes/responding) |
| Stripe | 7. Notifications | Webhooks are signed per endpoint, retried for up to 3 days in live mode, may arrive out of order, and carry an event ID for deduplication. API requests accept an idempotency key. | 2026-11-15 | [Webhooks](https://docs.stripe.com/webhooks), [idempotent requests](https://docs.stripe.com/api/idempotent_requests) |
| Stripe | 8. Order ID | `metadata` (up to 50 keys) can carry our order ID onto the payment, and the Search API can find payments by metadata (new data can take about a minute to appear). | 2026-11-15 | [Metadata](https://docs.stripe.com/metadata), [Search](https://docs.stripe.com/search) |
| Stripe | 9. Test mode | Sandboxes are isolated test environments with their own keys and test cards; no real money moves. | 2026-11-15 | [Sandboxes](https://docs.stripe.com/sandboxes) |
| Stripe | 10. Reports | Balance and payout reconciliation reports in the Dashboard or as CSV, which can be scheduled; payout reconciliation lists the transactions in each bank payout, including fees, refunds, and disputes. | 2026-11-15 | [Reports](https://docs.stripe.com/reports) |
| Stripe | 11. Account opening | Needs an EIN or SSN; Stripe also asks for SSNs of the people tied to the account. The nonprofit business type is for registered 501(c)(3)s only. Unincorporated groups need extra documents (for example IRS Letter 147C). Typical time not published. | 2026-11-15 | [Tax ID guidelines by business type](https://support.stripe.com/questions/tax-id-verification-guidelines-by-business-type-in-the-us) |
| Stripe | 12. Tax forms | Stripe issues Form 1099-K to the account receiving payments. Federal threshold for 2026: more than $20,000 and 200 transactions; some states are lower. | 2026-11-15 | [2026 tax season](https://support.stripe.com/questions/whats-new-for-the-2026-tax-season) |
| Stripe | 13. Connect | Organizers can connect accounts; Stripe now recommends Accounts v2 with fee and loss responsibility settings (Standard, Express, and Custom are legacy). With direct charges, refunds and disputes come from the organizer's balance; with destination or separate charges they come from the platform's. Application fees work with any charge type. If the platform handles pricing, Connect costs $2 per monthly active account plus 0.25% + 25¢ per payout. | 2026-11-15 | [Connect charges](https://docs.stripe.com/connect/charges), [Connect accounts](https://docs.stripe.com/connect/accounts), [Connect pricing](https://stripe.com/connect/pricing) |

### What this means so far

- Model A (one club account with Stripe Checkout) covers every requirement in the Stripe questions: hosted checkout, signed and retried notifications with event IDs, order IDs on payments, partial refunds, sandboxes, and reconciliation reports.
- Nonprofit pricing will not apply to race entries, so plan on standard card fees. For example, a $50 entry costs $1.75 in card fees (2.9% of $50 plus 30¢; our calculation). D01 reports riders pay about 10% on top today; a direct comparison needs BikeReg's published fees with a date.
- Stripe's first payout takes 7 to 14 days, longer than the club's current payout within a week (D01); later payouts take 2 business days.
- Connect (model B) adds loss responsibility and per-account costs; it matters only for multi-organization season passes.
- The club side now points to model A: a nonprofit corporation with its own bank account opens the Stripe account, and the organizer owns refunds and disputes. Stripe will need the corporation's EIN and the SSNs of the people tied to the account.
- Still open for [ADR 0005](decisions/0005-merchant-and-settlement-model.md): who approves the switch, whether the corporation has 501(c)(3) status (it does not change Stripe pricing for entries, but affects tax paperwork), and how sponsor-funded junior entries are booked.

## What the answers decide

- **Choose the operating model.** Stripe provider selection is accepted in ADR 0002. Record the merchant/settlement choice as an [ADR](decisions/README.md), with the reasons and the alternatives considered. A payment provider is a significant technical choice under [CONTRIBUTING.md](../CONTRIBUTING.md).
- **Update product.md.** Replace "establish who collects funds" with the confirmed merchant of record, payout, refund, and dispute owners, with source and date.
- **Update the roadmap.** Phase 2 ("Build the registration core") depends on a settled payment model; mark that dependency resolved in [roadmap.md](../roadmap.md#delivery-status) only when the operating-model ADR is accepted, not merely because Stripe was selected.

Until then, nothing in this repository creates a provider account, stores keys, or takes a live payment.
