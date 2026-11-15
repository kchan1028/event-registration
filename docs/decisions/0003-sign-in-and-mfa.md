# 0003. Sign-in with required multi-factor authentication

Status: Proposed
Date: 2026-11-14
Deciders: Project owner; technical lead
Related: [Sign-in and account security](../../product.md#sign-in-and-account-security), [Phase 2](../../roadmap.md#phase-2--build-the-registration-core), [decision backlog](README.md#decision-backlog)

## Context

product.md requires multi-factor authentication (MFA) at every sign-in for every account type: riders, guardians, and all organizer roles. An account cannot reach rider, guardian, or organizer pages until a second factor is enrolled. Organizers must re-verify before sensitive actions (refunds, payouts, role changes, ownership transfer, exports with contact or emergency details, manual exceptions). Recovery must not bypass MFA. At least one phishing-resistant option (a passkey or security key) is required; SMS is a fallback for riders and guardians only, never organizers.

The prototype has no sign-in, so it must not be hosted or shared. Every Phase 2 feature that shows personal data, money, or organizer controls depends on this decision. The tension is usability: occasional riders and parents registering at night or on race morning must be able to finish MFA enrollment without help.

## Options considered

### Option A: Build sign-in on a maintained open-source authentication library

Run sign-in inside the CycleReg server using a widely used library for sessions, passkeys (WebAuthn), and authenticator-app codes (TOTP). First factor: an emailed one-time link or code.

- Pros: data stays in our database; no per-user fees; full control over enrollment and step-up rules.
- Cons: the team owns security-critical code (session handling, recovery, rate limits, factor storage) and must review and patch it as a small volunteer team.
- Risk: a mistake in recovery or session code is a serious incident.

### Option B: Use a managed identity service

A hosted identity provider handles sign-in, MFA enrollment, passkeys, step-up, and recovery; CycleReg receives a verified identity.

- Pros: security-critical flows maintained by a specialist; faster to a safe first release; audit events usually provided.
- Cons: recurring cost that grows with riders; vendor lock-in; "MFA required for every account, before any page" and "no SMS for organizers" must be confirmed against the specific product; personal data held by another processor (add to the privacy notice and retention rules).
- Risk: pricing or policy changes; an outage blocks sign-in (mitigation: checkout can hold a place and ask the rider to finish later).

### Option C: Keep the current approach (no sign-in) and stay local only

- Pros: no work.
- Cons: blocks hosting, real registrations, and every Phase 2 feature. Not a real option beyond Phase 1.

## Decision (proposed)

Recommend **Option B, a managed identity service**, because it can enforce the product.md MFA rules with the least security-critical code for a volunteer team. Whichever provider is selected must meet all of these:

1. Passwordless first factor (emailed link or code); second factor required at enrollment before any page loads.
2. Passkeys or security keys and authenticator apps offered to everyone; SMS allowed only for rider and guardian accounts and disabled for organizer roles.
3. Step-up re-verification on demand for the sensitive organizer actions in product.md.
4. Single-use recovery codes at enrollment; any other recovery performed by an authorized owner or support and written to CycleReg's audit log.
5. Rate limits on sign-in and factor attempts; notifications when a factor is added, removed, or used for recovery.
6. Export of user records so the club is not locked in.

If no provider meets all six at an acceptable cost for a small club, fall back to Option A with an external security review before launch.

No specific provider is chosen here. Before acceptance, compare at least two providers against the six requirements and record dated evidence (documentation links and prices) in this ADR.

## Consequences

- Unblocks hosting and the role-based features (check-in volunteer, timer/export, finance roles, emergency-contact access).
- Rider checkout gains an enrollment step; usability sessions must test first-time MFA on a phone, including a parent registering a junior.
- Shared check-in devices still need each volunteer to sign in with their own account (product.md).
- A new processor of personal data must be listed in the privacy notice and retention plan.
- Next: provider comparison, an accepted version of this ADR, then an implementation plan with session, step-up, and recovery tests.

Product impact (product.md): None until accepted; the MFA requirements already in product.md are unchanged.
Roadmap impact (roadmap.md): Phase 2 sign-in work waits on acceptance of this ADR.
