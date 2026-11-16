# Stripe costs and payment economics

Research retrieval date: November 15, 2026 (client date). Scope: public U.S. standard pricing in USD for cycling race registration, not negotiated offers. Research only; no account, integration, ADR or code changes. Sources sometimes geo-redirected to India; only the explicit U.S. pages/results below were used for dollar rates.

## What would Stripe cost for cards, wallets and bank collection?

### Takeaway
Stripe's card/wallet pricing is straightforward. ACH's headline savings shrink materially when a new bank verification costs $1.50, particularly on junior-priced orders. Instant Bank Payments is a different, more expensive product that offers instant confirmation.

### Cited Findings
- Domestic online cards are 2.9% + $0.30. International cards add 1.5%; currency conversion adds 1%; manually entered cards add 0.5%. Standard-schedule payouts are free; Instant Payouts are 1.5%, minimum $0.50 (Connect differs). [U.S. pricing](https://stripe.com/pricing)
- Apple Pay, Google Pay and Cash App Pay list 2.9% + $0.30. Standard ACH Direct Debit is 0.8%, capped at $5; two-day settlement is 1.2%. Instant bank validation is $1.50; ACH failed payments $4, disputed payments $15. These are collection fees, not organizer bank-payout fees. [U.S. method pricing](https://stripe.com/us/pricing/local-payment-methods)
- Financial Connections verification costs $1.50 when used; Instant Bank Payments costs 2.6% + $0.30 and includes bank verification/risk protection. ACH default confirmation/settlement is four business days; eligible businesses can obtain two-day ACH settlement. [Bank product comparison](https://stripe.com/payments/us-bank-payments)
- Instant Bank Payments uses Link and U.S. bank accounts; not every business/transaction qualifies. It offers instant confirmation, two-day settlement, Connect support and full/partial refunds. [Instant Bank Payments](https://docs.stripe.com/payments/link/instant-bank-payments)

### Inferences
Illustrative processor costs, calculated from the published formulas above. No tax, international/conversion fees, refunds, disputes, failed debits, optional fraud tooling, platform markup or Connect charges included. ACH + verification assumes one $1.50 verification for every new order; reusable bank accounts or another verification flow change that assumption.

| Order | Card / Apple Pay / Google Pay / Cash App Pay | ACH processing only | ACH plus one $1.50 verification | Instant Bank Payments |
|---|---:|---:|---:|---:|
| $40 | $1.46 | $0.32 | $1.82 | $1.34 |
| $90 | $2.91 | $0.72 | $2.22 | $2.64 |
| $130 | $4.07 | $1.04 | $2.54 | $3.68 |
| 500 orders × $90 = $45,000 | $1,455 | $360 | $1,110 | $1,320 |

Calculated savings for 500 × $90: ACH processing-only saves $1,095 versus cards; ACH with 500 verifications saves $345; Instant Bank Payments saves $135. At $40, verified ACH costs $0.36 MORE than cards. Card versus one-time-verified ACH break-even is about $57.14 (solve 0.029P + 0.30 = 0.008P + 1.50). These are arithmetic comparisons, not provider quotes or forecasts.

### Gaps
- Actual verification billing depends on the selected bank-linking/reuse flow; do not promise every ACH transaction costs only 0.8%, or that every flow incurs $1.50.
- Account eligibility, negotiated volume pricing and bank/Radar add-ons need a written quote. The bank comparison also advertises Radar starting at $0.05/transaction; it is not in the examples. [Bank product comparison](https://stripe.com/payments/us-bank-payments)

## What settlement, refund and reliability risks matter for races?

### Takeaway
ACH is unsuitable as an unconditional instant confirmation mechanism for a last-minute race entry. Payment confirmation, money becoming available in the Stripe balance, and a payout reaching the club's bank are three separate events.

### Cited Findings
- ACH Direct Debit has delayed success/failure notification up to four business days, requires customer mandate and verified bank account, and is not guaranteed. Full-page Checkout/Checkout Sessions and Connect are supported. Consumer disputes generally have a 60-calendar-day window (business accounts two business days), and final ACH disputes cannot be appealed. ACH refunds can take three business days and may be submitted within 180 days. [ACH documentation](https://docs.stripe.com/payments/ach-direct-debit)
- A bank can report an ACH failure after a payment was marked successful; Stripe then creates a dispute. [Stripe ACH dispute support](https://support.stripe.com/questions/respond-to-or-contest-an-ach-direct-debit-dispute-as-a-merchant)
- Cash App Pay has immediate confirmation and settlement up to two business days, supports U.S. B2C merchants and Connect, and may undergo account-category eligibility review. [Cash App Pay documentation](https://docs.stripe.com/payments/cash-app-pay)
- Cards, Apple Pay, Google Pay and Cash App Pay are supported by Checkout; method availability still depends on customer/country/device/account restrictions. [Payment-method support](https://docs.stripe.com/payments/payment-methods/payment-method-support)
- Original Stripe processing fees are not returned when a successful payment is refunded. Insufficient Stripe balance can leave card refunds pending or other-method refunds failed. [Refund documentation](https://docs.stripe.com/refunds)
- Card dispute received fee is $15; manually countering a dispute is another $15, returned if won; appeal fees and additional network costs may apply. Avoid summarizing this as merely "$15 per chargeback". [U.S. pricing](https://stripe.com/pricing)
- First payouts typically have a 7–14-day waiting period, with risk/country/verification/bank factors affecting actual timing. Weekends/holidays can delay bank receipt. [First payout guidance](https://support.stripe.com/questions/waiting-on-your-first-stripe-payout-what-you-need-to-know)

### Inferences
- For CycleReg, prefer cards/wallets for last-minute registration and capacity confirmation. Consider ACH only for early registration with explicit pending-payment, failure/return, capacity-release and reconciliation rules. This is a product recommendation, not a Stripe prohibition.
- The fact that the club currently receives an ACH payout says nothing about whether riders currently pay by ACH.
- Reconciliation/webhooks, retries, refund funding and first-payout reserves matter more to a race-day operator than a simplistic uptime claim; this research did not measure uptime.

### Gaps
**Conflicting official sources on partial ACH refunds:** the current ACH method page's capabilities table says partial refunds are unsupported, but Stripe's dedicated support article says PaymentIntents ACH partial refunds work in both Dashboard and API (and legacy Charges API permits partial refunds through API). Do not confidently promise either blanket support or blanket non-support. Confirm the intended Checkout/PaymentIntents configuration with Stripe and run a partial-refund sandbox acceptance exercise before enabling ACH, because CycleReg requires entry-level partial refunds. [ACH capabilities table](https://docs.stripe.com/payments/ach-direct-debit); [specific partial-refund support article](https://support.stripe.com/questions/partial-refunds-for-ach-direct-debit-payments)

## Would nonprofit or platform pricing change the recommendation?

### Takeaway
A nonprofit corporation selling race entries should budget standard commercial processing fees unless Stripe specifically approves different terms. A single club's direct merchant account and a multi-organizer platform have different costs and responsibilities.

### Cited Findings
- Stripe nonprofit discounts require eligible nonprofit/tax documentation and at least 80% tax-deductible donation volume. Memberships, tickets and registration fees explicitly do not count. Being a nonprofit corporation alone is insufficient. [Nonprofit fee policy](https://support.stripe.com/questions/fee-discount-for-nonprofit-organizations)
- With "Stripe handles pricing," Stripe says the platform incurs no additional account, payout-volume, tax-reporting or per-payout fees. With "You handle pricing," its headline lists $2 per monthly active connected account and 0.25% + $0.25 per payout, in addition to processing costs. Its comparison also lists funds-routing/platform-management at 0.25% of payout volume. This needs account-specific clarification rather than blindly adding every line. Instant Payouts in Connect are listed separately at 1%. [U.S. Connect pricing](https://stripe.com/us/connect/pricing)
- Affirm through Stripe is listed at standard 6% + $0.30 or enhanced 7.99% + $0.30; Cash App Afterpay 6% + $0.30; Klarna U.S. 5.99% + $0.30. Temporarily reduced offers can expire after at least one month; don't treat them as durable baseline pricing. [U.S. method pricing](https://stripe.com/us/pricing/local-payment-methods)

### Inferences
- Retain Stripe as the practical baseline for this app, since it already has a test-mode integration, and compare alternatives on full switching/operating cost, not only their cheapest advertised rail. This does not amend ADR 0002 or approve live activation.
- For a one-club pilot, obtain pricing for the club's own account first. Obtain a separate written Connect quote before a multi-organizer roll-out; do not force Connect payout fees into the direct-account comparison.
- Buy-now-pay-later is more expensive for these $40–$130 race orders unless a provider confirms special pricing; the other research track must verify event-category eligibility, borrower rules and minimum purchase limits.

### Gaps
- Unanswered: who approves the receiving legal entity/processor switch; actual annual volume; average order/refund/dispute mix; which party absorbs fees; whether a Connect pricing/risk model is needed; permitted methods for this merchant category. These already intersect the repository's payment-model questions and do not authorize a change in provider or live payments.
