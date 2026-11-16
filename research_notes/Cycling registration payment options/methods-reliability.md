# Payment methods and operational reliability

Research retrieved November 15, 2026 (client date). U.S. merchants/USD race-entry collection. This is research and Proposed operating guidance, not merchant approval or a live integration. Only official sources were used. Fees below are the standard published Stripe channel prices, not negotiated direct-provider quotes.

## Which methods fit registration deadlines and reliable confirmation?

### Takeaway

Prefer cards and eligible card wallets for the initial registration checkout. Raw ACH Direct Debit is cheaper but is a delayed, reversible collection method; a bank payout to the organizer is a different transaction. Link Instant Bank Payments is a distinct bank-funded alternative with faster confirmation and a narrower settlement guarantee, subject to availability. These are operating recommendations inferred from the method properties below, not uptime rankings. [Stripe payment status](https://docs.stripe.com/payments/payment-methods), [ACH](https://docs.stripe.com/payments/ach-direct-debit), [Instant Bank Payments](https://docs.stripe.com/payments/link/instant-bank-payments).

### Cited findings

- Cards give an immediate success/failure response. A successful payment can still later be refunded, disputed, returned or reversed. Delayed methods stay processing; Stripe recommends keeping the order pending until success and tracking status through verified webhooks. A screenshot, bank-connection success or submitted payment is not the provider's final success status. [Payment methods](https://docs.stripe.com/payments/payment-methods).
- ACH Direct Debit acknowledgement can take four business days. Standard settlement is T+4 into the Stripe balance; eligible faster settlement is T+2. Bank payout follows its own schedule. Bank verification/authorization is required. Personal-account disputes generally remain possible for 60 calendar days and business-account disputes for two business days; rare late returns can occur. Ordinary ACH disputes are final, and a refund plus independent bank dispute can double-credit a customer. [ACH documentation](https://docs.stripe.com/payments/ach-direct-debit).
- Faster ACH availability does not shorten ACH return rules. [ACH payment terms](https://stripe.com/legal/ACH).
- Link Instant Bank Payments confirms immediately and settles on the card-payment timeline. Stripe guarantees bank-initiated returns, but customer-initiated disputes still debit the merchant balance. It supports full/partial refunds and Connect. Merchant/transaction eligibility is dynamic; U.S. business history is a criterion and transactions default below $7,500. Explicit raw ACH and Instant Bank Payments cannot be offered in the same transaction: ACH takes precedence. [Instant Bank Payments](https://docs.stripe.com/payments/link/instant-bank-payments).
- Standard U.S. Stripe channel pricing: cards/Apple Pay/Google Pay/Cash App Pay 2.9% + $0.30; Link Instant Bank Payments 2.6% + $0.30. ACH standard 0.8%, capped $5; T+2 1.2%; instant bank validation $1.50; failed ACH $4; ACH dispute $15. Affirm Standard 6% + $0.30, Enhanced 7.99% + $0.30; Cash App Afterpay 6% + $0.30; Klarna 5.99% + $0.30. Promotional BNPL pricing can expire. [U.S. local-method pricing](https://stripe.com/us/pricing/local-payment-methods).

### Inferences

- Proposed first-launch mix: credit/debit cards plus eligible Apple Pay/Google Pay. These wallets are convenience options at the processor's card price, not an ACH-level cost reduction.
- Proposed raw-ACH cutoff: at least five business days before the first race, with additional holiday/operating buffer, pending-payment capacity rules, and a payment recovery owner. This is a conservative provisional design suggestion, not a provider requirement and not protection against later disputes. A registration close only three calendar days before a race is too late to assume standard ACH success by race day.
- A short card-style hold timer should not simply be reused for multi-day ACH. Future ACH work needs explicit pending-reservation expiry, late-success handling, failed-payment recovery and confirmation notifications.
- Consider eligible Link Instant Bank Payments before raw ACH near event dates, but its savings are much smaller than raw ACH: $2.64 versus $2.91 on a $90 order. Keep cards as fallback because availability is not guaranteed.
- Proposed cash desk fallback: staff must actually receive/count cash, issue a receipt linked to the order, record the payment and reconcile the drawer. A completed payment still does not establish waiver/license/readiness clearance. Cash support is an operating proposal here, not a claim about a working CycleReg cash feature.

### Gaps

- CycleReg's actual live merchant eligibility, initial payout delay, reserve policy and bank-payment availability require underwriting/account confirmation.
- No acceptable ACH pending-capacity/late-return operating policy has been approved by the owner. The proposed cutoff must be reviewed against actual event dates and the bank calendar.
- No end-to-end live provider or payout rehearsal was performed.

## How do Cash App, Venmo, Zelle and BNPL differ?

### Takeaway

Integrated merchant checkout is not the same as collecting personal transfers. Cash App Pay, PayPal/Venmo merchant checkout and BNPL can provide provider transaction records, but each has eligibility and refund constraints; nonprofit status does not automatically grant access or low fees. [Cash App Pay](https://docs.stripe.com/payments/cash-app-pay), [PayPal Venmo](https://developer.paypal.com/venmo/), [Zelle business](https://www.zelle.com/faq/im-small-business-using-zelle).

### Cited findings

- Cash App Pay through Stripe has immediate confirmation and T+2 settlement, a $0.50 transaction minimum, and dynamic customer limits; Stripe suggests lower-value orders such as below $2,000 to reduce declines. It supports full/partial refunds, but the Stripe submission window is only 90 days and processing can take ten business days. Disputes can arrive for 120 days. Critically, its MCC list prohibits 8398 fundraising and 8641 civic/social/fraternal associations, while 8699 membership organizations is restricted. The actual club classification must be checked, not guessed. [Cash App Pay](https://docs.stripe.com/payments/cash-app-pay).
- Do not copy direct Cash App refund rules into the Stripe channel: Cash App partner documentation mentions seven years, whereas Stripe's channel limits refunds to 90 days. The integration contract matters. [Direct partner refund FAQ](https://developers.cash.app/cash-app-pay-partner-api/guides/resources/frequently-asked-questions/returns-and-refunds), [Stripe Cash App Pay](https://docs.stripe.com/payments/cash-app-pay).
- Direct Cash App Business terms disclose fees during setup/use, require merchant reconciliation, prohibit using the business service to transmit third-party funds, and list membership clubs/dues among prohibited uses. They also distinguish nonprofit donations in California from general commercial goods/services; this is not proof that race-entry collection is approved or prohibited. [Cash App Business terms](https://cash.app/us/en/legal/cash-payment-terms).
- A September 10, 2026 Cash App announcement describes a fee-free goods/services pilot for eligible sole proprietors through personal accounts. It is not a general offer for nonprofit corporations or an integrated race-registration product. [Cash App pilot announcement](https://cash.app/press/introducing-simpler-way-sell-goods-services-cash-app).
- Venmo direct business/QR payments advertise 1.9% + $0.10. However, the business-profile FAQ excludes nonprofits from standard business profiles and directs registered nonprofits to charity profiles. A charity donation fee cannot be assumed to cover race-entry purchases. These are separate from integrated Venmo through PayPal/Braintree. [Venmo business profiles](https://venmo.com/business/profiles), [Charity donation FAQ](https://help.venmo.com/cs/articles/receiving-donations-faq-vhel180).
- Integrated Venmo through PayPal uses a PayPal business account and supports U.S. merchants/customers in USD, with session-level method eligibility. This is not the direct-profile product. Multi-organizer platform capabilities/approval require the platform product, rather than assuming an ordinary first-party button is sufficient. [PayPal Venmo guide](https://developer.paypal.com/venmo/), [PayPal platforms](https://developer.paypal.com/platforms/overview/).
- Venmo's own pages disagree on Tap-to-Pay pricing: marketing says 2.9% + $0.09; legal fees say 2.29% + $0.09; one support article says 2.29% + $0.10. Do not use an in-person price as an online checkout comparison, and obtain the applicable fee schedule if considering it. [Marketing](https://venmo.com/business/profiles), [Legal fees](https://venmo.com/legal/fees), [Support](https://help.venmo.com/cs/articles/business-profile-transaction-fees-vhel221).
- Zelle business use requires the bank to offer Zelle for that specific business-account type. The bank sets limits and fees, so it cannot be assumed free. Transfers to enrolled recipients usually arrive in minutes and cannot be canceled by the sender. [Zelle business FAQ](https://www.zelle.com/faq/im-small-business-using-zelle).
- Affirm through Stripe offers immediate confirmation/T+2 settlement, full/partial refunds submitted within 120 days, asynchronous refunds up to two days, and disputes up to 120 days. Its U.S. limits are $35–$30,000. Broad options: $35–$50 Pay in 30, $50–$500 Pay in 4, monthly financing from $100; precise offers depend on package/eligibility. Its prohibited MCCs include 8398 fundraising and 8699 membership organizations; pre-orders are also prohibited. Thus actual race-entry/MCC approval must be obtained. [Affirm documentation](https://docs.stripe.com/payments/affirm).
- Affirm pays the merchant upfront minus fees and collects repayments itself; that does not eliminate fulfillment disputes. U.S. account applicants generally must be at least 18, with the stated Nebraska ward exception. A junior rider must not be treated as eligible for a financing account merely because the rider can register. [Affirm account eligibility](https://helpcenter.affirm.com/s/article/create-an-account), [Affirm terms](https://stripe.com/legal/affirm).

### Inferences

- Cash App Pay at the standard Stripe rate is an alternative experience, not cheaper merchant processing than cards. Cash App Pay and Cash App Afterpay are distinct methods and prices.
- Do not advertise Venmo's 1.9% direct/QR rate as CycleReg's integrated merchant fee. Confirm the PayPal/Braintree route and merchant eligibility separately. The standard Venmo business-profile nonprofit restriction does NOT prove all integrated Venmo merchant processing is unavailable to nonprofits.
- Do not use personal $cashtags, personal Venmo or a screenshot as automatic proof that an order is paid. If Zelle or a direct merchant-app transfer is accepted manually, require a bank/provider-side verified transaction, exact order reference and a reconciliation/refund workflow. No public consumer Zelle FAQ established a general CycleReg-ready checkout/webhook integration.
- BNPL should not be a cost-saving launch default for these entry values. At Stripe's standard rates, $40/$90/$130 Affirm transactions cost $2.70/$5.70/$8.10, versus cards $1.46/$2.91/$4.07 (arithmetic from the cited prices, excluding other fees). At $40, Affirm's documented option is Pay in 30 rather than four installments. Consider later for larger bundles only after demand, merchant approval and refund-window fit are established.
- Long-lead registration can outlive Cash App Pay's 90-day or Affirm's 120-day processor refund window. Cancellation policy and an alternative refund mechanism require explicit review before enabling such methods.

### Gaps

- Neither a public rate page nor a payment-method list proves the nonprofit club's race-entry merchant classification will be accepted. Obtain written account-specific eligibility before choosing Cash App Pay/Affirm.
- Current integrated PayPal/Braintree pricing and contract terms are being researched by the processor-comparison researcher; direct-profile rates above are not a substitute.
- Direct Cash App Business pricing is disclosed in-account, not a single universal fee established here. The sole-proprietor pilot does not fit the known nonprofit-corporation entity.

## Which platform is more stable?

### Takeaway

No defensible head-to-head reliability winner can be declared from public marketing and status snapshots alone. Separate availability, authorization success, settlement/returns and reconciliation correctness. A platform can be online while an ACH debit fails days later. [Stripe payment status](https://docs.stripe.com/payments/payment-methods), [ACH](https://docs.stripe.com/payments/ach-direct-debit).

### Cited findings

- Stripe advertises 99.999% historical uptime for its services. The inspected marketing page does not establish a CycleReg-specific contracted SLA, matching observation period, region, product coverage or comparable measurement against competitors. Treat it as the provider's historical claim. [Stripe official site](https://stripe.com/?issue=64).
- Official status pages exist for [Stripe](https://status.stripe.com/), [PayPal production](https://www.paypal-status.com/product/production), and [Square](https://www.issquareup.com/). In this research reader the pages rendered loading/empty shells, so no incident totals, verified historical uptime, or current-state ranking was extracted.
- Payment success and provider availability are not final settlement guarantees; refunds, disputes/returns and bank payout schedules remain distinct. [Payment methods](https://docs.stripe.com/payments/payment-methods), [ACH terms](https://stripe.com/legal/ACH).

### Inferences

- Practical stability criteria should include signed-event verification, duplicate/reordered event handling, provider lookup recovery, idempotent payment creation, ledger matching, refund reconciliation, a reserve for disputes and late returns, and outage procedures. These guard against incorrect confirmations even when the provider's main API is available.
- With an existing test-mode Stripe implementation, staying with that integration for the first pilot reduces implementation/reconciliation paths. This is a project-fit inference, not evidence that Stripe has objectively better uptime than Square or PayPal.
- A second processor is not automatic resilience: it adds a second refund/payout/dispute ledger and does not protect against local connectivity, bank, or shared network failures. Add it only for measured business demand or a rehearsed continuity requirement.

### Gaps

- Comparable, independently measured uptime windows for all candidates were not established; no numerical league table is justified.
- Contracted support response, payout holds/reserves, initial payout timing, processor merchant approval and event cancellation treatment require actual written terms/account review.
