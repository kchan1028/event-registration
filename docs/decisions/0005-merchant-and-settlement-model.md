# 0005. Merchant and settlement model for Stripe payments

Status: Proposed
Date: 2026-11-14
Deciders: Project owner; club treasurer (accountable for payment decisions)
Related: [ADR 0002](0002-stripe-payments.md), [Money and reporting](../../product.md#6-money-and-reporting), [external requirements](../discovery/external-requirements.md#payment-provider-operating-models), [Phase 2](../../roadmap.md#phase-2--build-the-registration-core)

## Context

ADR 0002 selected Stripe hosted Checkout but deliberately left open who the merchant is and who carries payouts, refunds, disputes, tax, and negative balances. Phase 2 can build and test against the Stripe sandbox without settling this, but live sales cannot start until it is accepted and the club agrees. The choice also shapes the data model: which account a charge belongs to, how refunds and fees are recorded in the ledger, and how a future cross-organization season pass (Phase 6) would split money.

The first live use is one club (the pilot organizer), so the model should be simple for a volunteer treasurer while not blocking more clubs later.

## Options considered

### Option A: Each club is the merchant through its own connected Stripe account

CycleReg acts as a platform; each club has its own connected account and is the merchant for its events. Charges belong to the club; CycleReg never holds the money.

- Pros: the club owns its customer relationship, payouts, and disputes; CycleReg holds no funds; fits a per-paid-entry platform fee taken at charge time if one is ever set (product.md business model hypothesis).
- Cons: each club's treasurer completes Stripe onboarding; dispute and refund handling sits with the club; the exact Connect configuration and which party bears fees and chargebacks depend on the charge type and must be verified against current Stripe documentation before acceptance.

### Option B: CycleReg is the merchant and pays clubs out

CycleReg collects all payments in its own account and transfers proceeds to clubs.

- Pros: one integration and one dashboard; clubs need little onboarding.
- Cons: CycleReg's operator becomes responsible for disputes, refunds, tax reporting, and holding other clubs' money; a volunteer project should not carry that liability; ADR 0002's sources note that for separate charges and transfers the platform balance bears fees, refunds, and chargebacks.

### Option C: A single club uses its own Stripe account directly (no platform)

For the pilot only, the pilot club's own Stripe account receives payments; no Connect setup.

- Pros: simplest possible first live event; no platform obligations.
- Cons: does not extend to more clubs without rework; still needs the club's treasurer to own disputes and refunds.

## Decision (proposed)

Recommend **Option A, each club is the merchant through its own connected account**, so CycleReg never holds club money and each treasurer keeps control of payouts, refunds, and disputes. For the Phase 2 sandbox, model charges as belonging to an organization's connected account and record fees, refunds, and disputes per organization in the ledger.

Before acceptance:

1. Verify against current Stripe documentation which Connect charge type gives the club merchant status and dispute responsibility, and record the dated source here (ADR 0002 requires this verification).
2. The pilot club's treasurer reviews onboarding steps, payout timing, dispute handling, and any tax reporting, and agrees in writing.
3. Decide whether CycleReg charges any platform fee (product.md business model hypothesis); default is none for the pilot.

Option C remains a fallback for a one-club pilot if Connect onboarding proves too heavy, at the cost of rework before a second club.

## Consequences

- Sandbox work can proceed: the ledger records which organization each charge, fee, refund, and dispute belongs to.
- No live keys, live charges, or account creation are authorized by this ADR.
- Cross-organization season passes (Phase 6) will need a further decision about splitting one rider payment across clubs.
- Next: Stripe documentation check, treasurer review, then an accepted version of this ADR before any live payment.

Product impact (product.md): None until accepted.
Roadmap impact (roadmap.md): The Phase 2 live-use gate on the merchant model points to this ADR.
