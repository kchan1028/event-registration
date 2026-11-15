# 0002. Stripe for planned payments

Status: Accepted
Date: 2026-11-14
Decider: Project owner, by explicit instruction to use Stripe integration
Related: [Money and reporting](../../product.md#6-money-and-reporting), [season passes](../../product.md#cross-organization-bundles-and-season-passes), [Phase 2](../../roadmap.md#phase-2--build-the-registration-core)

## Context

The product owner selected Stripe while expanding Planned communication, rider self-service, promotion, reporting, race-day, competition setup, and season-pass requirements. The current checkout is simulated and contains no Stripe integration. Provider choice and the merchant/settlement operating model are separate decisions.

## Options considered

- Keep the provider undecided: preserves optionality but conflicts with the owner's selected direction.
- Select Stripe and resolve the operating model before live use: follows the decision while keeping financial responsibilities explicit.
- Retain an organizer's existing processor: not selected for the planned CycleReg integration.

## Decision

Select Stripe as the payment provider and plan a Stripe-hosted Checkout flow. Do not collect or store card details in CycleReg. Implement and verify sandbox payment, refund, retry, and reconciliation workflows before any live-payment decision. Confirm fulfillment only from verified authoritative payment state, including delayed-payment outcomes; a browser return is not proof of payment.

Evaluate Stripe Connect for multiple participating organizations. This ADR does not select a Connect charge type, establish merchant-of-record status, or assign payout, tax, refund, dispute, or negative-balance liability. Those responsibilities require a further accepted operating-model decision and organizer agreement before live sales, especially cross-organization season passes. Nothing here authorizes account creation, keys, cloud resources, or live payments.

## Consequences

- Provider selection is settled; integration remains Planned.
- The initial integration needs hosted checkout, verified webhook processing, idempotency, refund allocation, and ledger-to-provider reconciliation.
- Season-pass design must account for separate payments, transfers, and payouts rather than treating a successful rider payment as a completed organizer settlement.
- The current same-event `bundles` data does not support cross-event purchase, revenue allocations, or organization approvals. These need a separate schema and implementation change.

Product impact (product.md): Stripe selected and Planned payment, package, and multi-organization purchase requirements recorded.
Roadmap impact (roadmap.md): Phase 2 uses Stripe; operating-model and live-use gates remain unresolved. Cross-organization passes are Phase 6.

## Documentation reviewed

Retrieved through Context7 on November 14, 2026 from Stripe's documentation. These are provider capabilities, not implemented CycleReg behavior:

- [Checkout](https://docs.stripe.com/payments/checkout) and [fulfillment](https://docs.stripe.com/checkout/fulfillment): hosted collection and server-side confirmation workflow.
- [Connect charge types](https://docs.stripe.com/connect/charges): separate charges/transfers can distribute funds to multiple connected accounts; the platform balance bears fees, refunds, and chargebacks for that flow.
- [Refunds](https://docs.stripe.com/refunds): refund and transfer-reversal behavior depends on the Connect charge type. A customer refund does not by itself settle every participating organization's balance.

Implementation must verify current APIs and supported account/geographic configurations when the operating model is chosen.
