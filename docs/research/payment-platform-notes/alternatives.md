# Alternative U.S. registration processors

Research checked November 15, 2026 (client date). Scope: U.S. USD online race-entry collection; no live setup, vendor switch, or ADR change. Costs below exclude international cards, currency conversion, refunds/returns, platform fees, and optional services unless stated. No provider’s underwriting approval for CycleReg or its club has been obtained.

## Which alternatives actually offer lower online collection costs?

### Takeaway
Square’s integrated API rate is competitive with standard flat-rate cards, but its basic Payment Links rate is higher. Braintree’s standard card advantage is tiny at typical race order sizes. Helcim and Adyen warrant a quote when volume/card mix justify interchange-plus, but a headline markup is not a total processing price.

### Cited Findings
- Square distinguishes ordinary online cards (Free 3.3% + $0.30; paid tiers 2.9% + $0.30) from Online API cards (2.9% + $0.30 across its three tiers). API ACH is 1%, minimum $1, capped $5. Free has no monthly subscription; paid tiers add subscriptions. [Square fees](https://squareup.com/us/en/payments/our-fees).
- Square’s developer pricing independently confirms U.S. eCommerce 2.9% + $0.30 and API ACH 1%/$1 minimum/$5 maximum; the ACH line states no chargeback or additional fees. [API pricing](https://developer.squareup.com/docs/payments-pricing).
- Square’s retail-created Payment Links page quotes 3.3% + $0.30 and no monthly fee. Do not assume every Square-hosted product gets the developer API rate; ask for the exact Checkout API contract classification. [Payment Links](https://squareup.com/us/en/payment-links). Square separately offers a hosted Checkout API and advertises online APIs at 2.9% + $0.30. [Developer product](https://developer.squareup.com/us/en/online-payment-apis).
- Braintree U.S. standard: cards/third-party wallets 2.89% + $0.29; Venmo 3.49% + $0.49; standard-network ACH 0.75%, capped $5; same-day-network ACH 1.5% + $0.10. Card chargeback $15; ACH return/unauthorized charges $5. Original fees are retained on refunds. Charity cards are 2.19% + $0.29 only for verified 501(c)(3) organizations, with eligibility/application/preapproval. Custom pricing is available. Published page updated May 7, 2026. [Braintree fees](https://www.paypal.com/us/enterprise/paypal-braintree-fees).
- PayPal’s Nov. 4, 2026 merchant table distinguishes PayPal/Guest Checkout/Venmo (3.49% + USD $0.49), standard card products (2.99% + $0.49), and Advanced cards (2.89% + $0.29). Pay Later is 4.99% + $0.49. Do not collapse these into one “PayPal rate.” [Merchant fees](https://www.paypal.com/us/business/paypal-business-fees).
- PayPal describes Checkout as provider-hosted and Expanded Checkout as embedded; the latter includes Apple Pay/Google Pay and advertises the lower card rate. These are different integrations, not interchangeable advertised prices. [Checkout comparison](https://www.paypal.com/us/business/accept-payments/checkout).
- Helcim’s online/keyed markup below $50K monthly card volume is interchange plus 0.50% + $0.25, with lower markups in higher tiers. ACH is 0.5% + $0.25, capped $6 (extra 0.05% over $25,000). No account monthly fee/minimum/software/statement fee. [Helcim pricing](https://www.helcim.com/pricing/).
- Adyen Visa/Mastercard list price is $0.13 plus interchange/scheme costs plus 0.60%, rather than a flat total rate. [Visa](https://www.adyen.com/payment-methods/visa), [Mastercard](https://www.adyen.com/payment-methods/mastercard). ACH lists $0.13 + $0.27 per transaction. [ACH method](https://www.adyen.com/payment-methods/ach-direct-debit). Adyen says no setup/monthly fee but a minimum invoice can apply by industry/business model, and other products are separately priced. [Pricing FAQ](https://www.adyen.com/pricing).

### Inferences
The following are calculations, not vendor quotes. Each transaction rounds half up to cents; the 500-order column multiplies the rounded $90 fee. For rates ending in fractions of cents, aggregate rounding could differ under the final contract.

| Product/rate | $40 | $90 | $130 | 500 × $90 |
|---|---:|---:|---:|---:|
| Square API cards 2.9% + $0.30 | $1.46 | $2.91 | $4.07 | $1,455 |
| Square Free Payment Links 3.3% + $0.30 | $1.62 | $3.27 | $4.59 | $1,635 |
| Braintree standard / PayPal Expanded cards 2.89% + $0.29 | $1.45 | $2.89 | $4.05 | $1,445 |
| PayPal standard card product 2.99% + $0.49 | $1.69 | $3.18 | $4.38 | $1,590 |
| PayPal / Venmo / Guest Checkout 3.49% + $0.49 | $1.89 | $3.63 | $5.03 | $1,815 |
| Conditional Braintree charity cards 2.19% + $0.29 | $1.17 | $2.26 | $3.14 | $1,130 |
| Square API ACH 1%, $1 min | $1.00 | $1.00 | $1.30 | $500 |
| Braintree standard ACH 0.75% | $0.30 | $0.68 | $0.98 | $340 |
| Helcim ACH 0.5% + $0.25 | $0.45 | $0.70 | $0.90 | $350 |
| Adyen ACH $0.40 before minimum invoice/add-ons | $0.40 | $0.40 | $0.40 | $200 |

Fee inputs: linked provider pricing pages above. The conditional charity row is an eligibility scenario, not CycleReg’s available rate. At 500 $90 card orders, Braintree’s standard fee saves only about $10 against a 2.9% + $0.30 flat rate, far below plausible processor-switching work. Adyen’s $200 ACH illustration is not an all-in quote because the invoice floor is unknown. Interchange-plus card examples cannot be given honest fixed totals without card mix and actual interchange/scheme costs.

### Gaps
- Braintree’s current fee page does not establish a universal monthly/minimum commitment; confirm its merchant contract, approval and account-specific add-ons.
- No confirmed Square nonprofit discount was found in the official pages examined. Do not state that a club discount exists or cannot exist without a quote.
- The club’s 501(c)(3) status is unknown; whether Braintree/PayPal would approve ordinary race-entry receipts at charity rates requires a written answer. Nonprofit incorporation alone is insufficient proof for the published Braintree charity tier.
- Confirm Square Checkout API-generated hosted link classification separately from dashboard Payment Links pricing.

## What do ACH, refunds and disputes change for race operations?

### Takeaway
A lower collection fee does not make ACH an immediately final payment. Race confirmation, capacity holds, refunds and payout timing need to match the exact method’s lifecycle.

### Cited Findings
- Braintree ACH needs an eligible U.S. Braintree Direct merchant and a custom client-side integration; it is not in Drop-in. Bank accounts must be verified. Its standard timeline treats a transaction as pending initially, waits three business days for returns, then disburses with two further bank days, approximately five business days total. Returns can occur after settlement, with recovery from a later disbursement. [Braintree ACH guide](https://developer.paypal.com/braintree/articles/guides/payment-methods/ach/).
- Adyen lists ACH settlement delay of 2–3 days and requires the merchant to obtain bank-debit authorization; this is not a guarantee that later ACH returns are impossible. [Adyen ACH](https://www.adyen.com/payment-methods/ach-direct-debit).
- Square keeps original processing fees when refunding; balances or the linked account fund the refund. [Square refunds](https://squareup.com/help/us/en/article/6116-process-refunds). Its dispute-management service charges no additional chargeback handling fee for disputes challenged together; a lost dispute still costs the disputed amount and original processing charge. [Square disputes](https://api.squareup.com/help/us/en/article/3882-payment-disputes-walkthrough).
- PayPal original commercial/invoice processing charges are not returned on either full or partial refunds. It lists $15 standard and $30 high-volume dispute fees, and a separate $20 chargeback fee; applicability depends on payment product and protection/waiver rules, so do not stack them automatically. [PayPal merchant fee schedule](https://www.paypal.com/us/business/paypal-business-fees).
- Helcim states no added refund fee, but original processing fees remain payable. It lists $15 for a lost chargeback, $0 for a favorable case, and $5 ACH NSF/reject/return. [Helcim pricing](https://www.helcim.com/pricing/).

### Inferences
- ACH is a better candidate for registration comfortably before the race than for a last-minute start-line purchase. This is an operating recommendation based on delayed settlement and returns, not a provider restriction.
- For cancellation-heavy events, retained original transaction charges can erase small headline-rate savings. Compare a realistic refund/dispute mix, not only successful collections.
- An organizer receiving an ACH payout from a processor is a different transaction from a rider paying by ACH. A card sale can still be paid out to the organizer over bank rails; it does not gain the ACH collection rate.

### Gaps
- Exact ACH bank-verification, refund, dispute, reserve and payout terms for a particular approved club account need contract confirmation. No race-underwriting or reserve quote was requested.
- This research did not measure processor uptime or authorization success. It cannot support a claim that one alternative is objectively more reliable.

## Which alternatives fit a single club and a future multi-organizer CycleReg?

### Takeaway
Square and PayPal have documented seller-platform capabilities; Adyen has a comprehensive embedded-payments product but a commercial minimum/approval question. At current ticket sizes, changing processors solely for Braintree’s tiny standard-card saving is difficult to justify; Helcim deserves a statement-based quote if cost is the main concern.

### Cited Findings
- Square can accept payments for sellers who authorize the app, and collect an application fee; these capabilities do not mean automatic approval for any club/platform business model. [Square application fees](https://developer.squareup.com/docs/payments-api/take-payments-and-collect-fees), [seller authorization](https://developer.squareup.com/docs/oauth-api/overview).
- PayPal’s platform product supports seller onboarding, partner fees, payouts and disputes; live credentials require platform/marketplace approval. [PayPal platforms](https://developer.paypal.com/platforms/overview). Seller onboarding performs risk/compliance checks; Expanded Checkout sellers require business accounts. [Seller onboarding](https://developer.paypal.com/platforms/seller-onboarding).
- Adyen’s embedded payments product covers onboarding, user verification, split/controlled payments and payouts, reports, and platform risk tools. [Adyen embedded payments](https://www.adyen.com/platform-payments). Pricing still requires the account-specific commercial terms described above.
- Helcim exposes hosted online checkout, payment links, integration tools and developer documentation; its advertised interchange-plus terms are merchant pricing, not proof of a Stripe Connect-equivalent platform settlement arrangement. [Helcim pricing and product navigation](https://www.helcim.com/pricing/).

### Inferences
- Keep the existing Stripe decision while comparing an approved Helcim quote and any genuinely applicable Braintree charity quote. Existing implementation and reconciliation work are part of switching cost.
- Treat Venmo/PayPal as possible rider-convenience additions, not automatically cheaper collection rails. Their integrated commercial rates can exceed ordinary cards.
- Adyen is a future platform/volume quote candidate, not a demonstrated cheapest small-club option from this research.

### Gaps
- No provider’s written acceptance of the club’s event-registration business, legal merchant identity, advance-sale period, reserves, support commitments or multi-club money flow was obtained.
- No processor switch, new payment method, live keys or account creation has been approved. Research does not supersede ADR 0002 or the outstanding merchant/settlement decision.
