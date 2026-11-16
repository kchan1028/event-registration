# Choose payment methods for race registration

**Keep Stripe as the baseline for the planned CycleReg checkout, with cards and eligible Apple Pay/Google Pay first.** That is a project-fit recommendation, not proof that Stripe has the best uptime or lowest possible negotiated price. Square’s API card price matches Stripe; Braintree’s standard rate saves only about $10 across 500 orders of $90. Bank payments offer larger potential savings, but raw ACH needs delayed-payment and refund handling before it suits race registration. Consider eligible Link Instant Bank Payments before adding raw ACH near race day; defer Affirm unless larger orders and rider demand justify its fees. This research does not authorize moving the club off BikeReg, changing [ADR 0002](../decisions/0002-stripe-payments.md), opening accounts, or enabling live payments.

Research checked **November 15, 2026**. U.S. online merchant collection, USD, public standard prices. Provider approval and account-specific terms remain unconfirmed. CycleReg contains simulated and Stripe test-mode payment code; the methods researched here are provider capabilities, not verified CycleReg integrations.

## Standard card rates do not justify a switch alone

These examples calculate processor fees on the stated order total, rounded to cents per transaction. They exclude tax, international cards, currency conversion, refunds, disputes, optional services, subscriptions and platform/Connect charges. A provider’s API, hosted link and wallet products can carry different prices.

| Online product | Public card rate | Fee on $90 | Interpretation |
|---|---|---:|---|
| [Stripe domestic cards](https://stripe.com/pricing) | 2.9% + $0.30 | $2.91 | Practical baseline; existing test-mode implementation |
| [Square Online API](https://developer.squareup.com/docs/payments-pricing) | 2.9% + $0.30 | $2.91 | Same headline card cost; confirm the exact hosted Checkout API contract |
| [Square Free Payment Links](https://squareup.com/us/en/payment-links) | 3.3% + $0.30 | $3.27 | Different product from API processing |
| [Braintree standard cards](https://www.paypal.com/us/enterprise/paypal-braintree-fees) | 2.89% + $0.29 | $2.89 | About two cents less per $90 order |
| [PayPal/Guest Checkout/Venmo](https://www.paypal.com/us/business/paypal-business-fees) | 3.49% + $0.49 | $3.63 | Rider convenience, not a low-fee card substitute |
| [PayPal Advanced cards](https://www.paypal.com/us/business/paypal-business-fees) | 2.89% + $0.29 | $2.89 | Separate card product; do not apply this rate to every PayPal button |
| [Helcim online, below $50,000 monthly card volume](https://www.helcim.com/pricing/) | Interchange + 0.50% + $0.25 | Needs card mix | Quote candidate; interchange is an additional underlying card cost |
| [Adyen Visa/Mastercard](https://www.adyen.com/payment-methods/visa) | $0.13 + interchange/scheme costs + 0.60% | Needs card mix/terms | Minimum invoice can apply; obtain a complete quote |

At **500 × $90**, Stripe/Square API card processing calculates to **$1,455**, versus approximately **$1,445** for Braintree standard cards. Actual billing rounding can differ. The switching, support and reconciliation work would need a reason beyond that $10 illustration. Helcim deserves a statement-based quote if cost is the priority; Adyen’s public markup is not an all-in small-club offer. ([Adyen pricing conditions](https://www.adyen.com/pricing/))

Nonprofit incorporation does not establish discount eligibility. Stripe’s donation discount requires qualifying donation volume and explicitly excludes registration, ticket and membership fees. Braintree publishes a **2.19% + $0.29** charity card tier for approved, verified 501(c)(3) organizations; whether ordinary race entries qualify is unconfirmed, and the club’s federal status is still unknown. ([Stripe nonprofit policy](https://support.stripe.com/questions/fee-discount-for-nonprofit-organizations), [Braintree fees](https://www.paypal.com/us/enterprise/paypal-braintree-fees))

## Bank payments save money only when timing and verification fit

Stripe standard ACH Direct Debit costs **0.8%, capped at $5**. Optional instant bank verification adds **$1.50** when that verification service is used; it is not an unavoidable charge on every ACH transaction. Link Instant Bank Payments is a distinct product at **2.6% + $0.30**, with verification included, immediate confirmation and conditional availability. ([Stripe method pricing](https://stripe.com/us/pricing/local-payment-methods), [bank product comparison](https://stripe.com/payments/us-bank-payments))

| Order value | Cards/card wallets | ACH processing only | ACH + one $1.50 verification | Link Instant Bank Payments | Affirm Standard |
|---|---:|---:|---:|---:|---:|
| $40 | $1.46 | $0.32 | $1.82 | $1.34 | $2.70 |
| $90 | $2.91 | $0.72 | $2.22 | $2.64 | $5.70 |
| $130 | $4.07 | $1.04 | $2.54 | $3.68 | $8.10 |
| 500 × $90 | $1,455 | $360 | $1,110 | $1,320 | $2,850 |

These are arithmetic scenarios using Stripe’s published formulas, not quotes or the club’s forecast. The verification column assumes one charge per order; bank-account reuse and the selected verification flow change it. Affirm uses its standard **6% + $0.30** price; Enhanced and other financing products differ. ([Stripe method pricing](https://stripe.com/us/pricing/local-payment-methods))

For an illustrative **$40 entry**, ACH with that first verification costs $0.36 more than cards. At **$50**, cards cost $1.75 versus $1.90 for verified ACH. The calculated break-even is about **$57.14** under these assumptions. Raw ACH is therefore not automatically the cheapest experience for every rider.

Other published ACH collection rates are Braintree **0.75%, capped $5**; Square API **1%, $1 minimum/$5 cap**; and Helcim **0.5% + $0.25, capped $6**. Adyen lists **$0.40**, but its unknown invoice floor prevents treating that as an all-in quote. Verification, returns and account terms still need comparison. ([Braintree](https://www.paypal.com/us/enterprise/paypal-braintree-fees), [Square](https://developer.squareup.com/docs/payments-pricing), [Helcim](https://www.helcim.com/pricing/), [Adyen ACH](https://www.adyen.com/payment-methods/ach-direct-debit))

**Rider ACH collection is different from an ACH payout to the organizer.** Standard Stripe ACH confirmation can take four business days, and returns remain possible later. A registration closing three calendar days before the race cannot assume standard ACH confirmation before race day. Proposed operating guidance is to allow raw ACH only comfortably earlier, with an approved cutoff, pending-capacity policy, late-success recovery and return owner. Link Instant Bank Payments confirms immediately and covers bank-initiated returns, but customer disputes still affect the merchant; it is not universally available. ([ACH lifecycle](https://docs.stripe.com/payments/ach-direct-debit), [Instant Bank Payments](https://docs.stripe.com/payments/link/instant-bank-payments))

A material unresolved point is **partial ACH refunds**: Stripe’s method capabilities page says unsupported, while its dedicated support article describes PaymentIntents partial refunds as supported. CycleReg needs entry-level partial refunds. Obtain confirmation for the intended configuration and test it before enabling ACH. ([Capabilities](https://docs.stripe.com/payments/ach-direct-debit), [partial-refund support](https://support.stripe.com/questions/partial-refunds-for-ach-direct-debit-payments))

## Wallets improve convenience; financing raises merchant cost

| Method | Proposed role | Important limitation |
|---|---|---|
| Credit/debit cards | Initial checkout baseline | Immediate provider response is not immunity from later disputes |
| Apple Pay/Google Pay | Prioritize eligible card wallets | Stripe’s standard card price applies; account/device availability still matters |
| Link Instant Bank Payments | Evaluate an eligible bank-funded option | Smaller savings than raw ACH; availability and protection scope are conditional |
| Cash App Pay through Stripe | Optional convenience after approval | Standard card-level fee; merchant-category restrictions and 90-day refund window |
| Integrated PayPal/Venmo | Add only for demonstrated rider demand | Commercial checkout rates differ from direct personal/business-profile transfers |
| Zelle/direct transfers | Consider only a controlled manual process | Bank-specific business eligibility, fees and limits; no general automatic checkout flow established here |
| Affirm/BNPL | Defer for ordinary $40–$130 entries | Higher merchant fees, borrower and merchant eligibility, refund-window constraints |
| Cash at a desk | Possible future staffed fallback | Requires receipt, order reference, drawer reconciliation and capacity handling; not a working feature claimed here |

The card-wallet rates come from [Stripe’s method schedule](https://stripe.com/us/pricing/local-payment-methods). Cash App Pay is not Cash App Afterpay. Its Stripe channel restricts/prohibits several club/nonprofit-related merchant categories; actual race-entry classification must be approved. Its refund window is 90 days, while Affirm’s is 120 days, which matters for advance registrations and cancellations. Affirm also restricts merchant categories, and a $40 purchase is documented as Pay in 30 rather than four installments. Borrower eligibility must not be inferred from a junior rider’s registration eligibility. ([Cash App Pay](https://docs.stripe.com/payments/cash-app-pay), [Affirm](https://docs.stripe.com/payments/affirm))

Venmo’s advertised **1.9% + $0.10** direct business-profile rate is not the integrated checkout price, and its standard business-profile FAQ excludes nonprofits. That does not prove integrated Venmo through PayPal/Braintree is unavailable; those routes need separate approval. Zelle requires support for the actual business account, with bank-set fees and limits. A screenshot or personal-transfer message should never automatically confirm a race entry. ([Venmo profiles](https://venmo.com/business/profiles), [integrated Venmo](https://developer.paypal.com/venmo/), [Zelle business](https://www.zelle.com/faq/im-small-business-using-zelle))

## Stability depends on payment outcomes and recovery

**This research established no defensible head-to-head uptime winner.** Official [Stripe](https://status.stripe.com/), [PayPal](https://www.paypal-status.com/product/production) and [Square](https://www.issquareup.com/) status pages did not yield comparable historical measurements in the research reader. Availability, authorization success, settlement, payout holds and reconciliation are separate dimensions. A provider can remain online while a bank debit fails later.

For CycleReg, the practical reliability test is whether authoritative payment events, retries, duplicate/out-of-order notifications, refunds and bank payouts reconcile with orders and capacity. A browser return or initiated bank payment is insufficient. Retaining the existing Stripe test-mode path reduces the number of integrations to rehearse; that is an implementation-risk inference, not a vendor uptime ranking. Provider support commitments, reserves and event-cancellation treatment still require written terms. ([Payment outcomes](https://docs.stripe.com/payments/payment-methods))

## Next decisions should use a club-specific quote

Obtain actual annual volume, average order/card mix, refund history and fee-allocation expectations, then compare an approved direct-club quote before adding platform/Connect economics. Connect has separate account/payout pricing choices and responsibilities; do not add every public pricing line indiscriminately to a single-club card comparison. ([Connect pricing](https://stripe.com/us/connect/pricing))

The useful decision is the lowest sustainable cost per completed, reconciled registration. Confirm merchant classification, refund windows and payment timing first; then decide whether bank savings or a genuinely available charity tier justify added operations. The unresolved decisions are maintained in the existing [payment-model guide](../payment-model-questions.md#unresolved-operating-decisions), not treated as approved requirements here.
