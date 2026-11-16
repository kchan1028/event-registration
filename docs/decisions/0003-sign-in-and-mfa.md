# 0003. Sign-in with required multi-factor authentication

Status: Accepted, amended twice on 2026-11-15 (see [Amendment](#amendment-2026-11-15-email-sign-in-first-mfa-before-the-live-pilot) and [Amendment 2](#amendment-2-2026-11-15-mfa-for-organizer-roles-only))
Date: 2026-11-14
Deciders: Project owner (accepted 2026-11-14)
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

## Decision

Recommend **Option B, a managed identity service**, because it can enforce the product.md MFA rules with the least security-critical code for a volunteer team. Whichever provider is selected must meet all of these:

1. Passwordless first factor (emailed link or code); second factor required at enrollment before any page loads.
2. Passkeys or security keys and authenticator apps offered to everyone; SMS allowed only for rider and guardian accounts and disabled for organizer roles.
3. Step-up re-verification on demand for the sensitive organizer actions in product.md.
4. Single-use recovery codes at enrollment; any other recovery performed by an authorized owner or support and written to CycleReg's audit log.
5. Rate limits on sign-in and factor attempts; notifications when a factor is added, removed, or used for recovery.
6. Export of user records so the club is not locked in.

If no provider meets all six at an acceptable cost for a small club, fall back to Option A with an external security review before launch.

### Recommended provider (from the comparison below)

**Clerk on the Pro plan (about $25 a month at 5,000 monthly active users), with SMS turned off for everyone.** It meets requirements 1, 3, 4, and 6 out of the box, and its "require MFA" setting blocks every page until a second factor is enrolled. Requirement 2 is met by not offering SMS at all (product.md allows SMS for riders but does not require it), which removes the need for per-role factor rules. Requirement 5 is partly met: lockout after repeated failures is built in, but factor-change notices must be sent by CycleReg from Clerk's events.

**Fallback: Better Auth** (an open-source TypeScript library) if a managed provider is ruled out. No licence cost and users stay in our own database, but CycleReg must build the "MFA before any page" gate, step-up, and notices itself, and get an outside security review.

## Provider comparison (sources retrieved 2026-11-14)

Ratings come only from the official pages listed. "NC" means not confirmed. Prices change often; recheck before signing up.

| Provider | 1 Passwordless + MFA before any page | 2 Passkey/TOTP for all, no SMS for organizers | 3 Step-up | 4 Recovery codes | 5 Rate limits + notices | 6 Export | Approx. cost at 5k MAU |
|---|---|---|---|---|---|---|---|
| Clerk | Yes | Partial (one app-wide MFA switch; met by turning SMS off) | Yes | Yes | Partial (lockout yes; notices NC) | Yes | $25/mo Pro (free plan has no MFA) |
| Auth0 | Yes | Yes (per-role factors through Actions) | Yes | Partial | Partial | Partial (export omits MFA enrollments) | $350/mo B2C Essentials |
| Stytch | Yes (enforced in our code) | Yes (enforced in our code) | Yes | Yes | NC | NC | $0 up to 10k MAU; prebuilt UI lacks MFA screens |
| WorkOS AuthKit | Partial | Partial (TOTP only; no SMS) | NC | NC | NC | NC | $0 up to 1M MAU |
| Supabase Auth | Yes | Partial (WebAuthn second factor experimental) | Partial | Partial (experimental) | Partial (factor added/removed emails built in) | Yes (own Postgres) | $0 Free / $25 Pro |
| Firebase / Identity Platform | Partial | No (no passkeys) | Partial | No | NC | NC | $0 up to 50k MAU, SMS extra |
| Better Auth (library) | Partial (needs a hook) | Yes | Partial | Yes | Partial | Yes (own database) | $0 plus hosting and email sender |
| Keycloak (self-hosted) | Partial (no built-in magic link found) | Yes | Yes | Yes | Partial | Partial | $0 plus a server to run |

Key caveats:
- Only Auth0 documents choosing factors by role, and only on a $350/mo plan. Offering no SMS is the simplest way to meet requirement 2 elsewhere.
- An emailed link or code proves email ownership only; the second factor must be a passkey or authenticator app, never another email code.
- Built-in factor-change notices were confirmed only on Supabase (added/removed). Elsewhere CycleReg sends them from provider events.
- Supabase passkeys and recovery codes are marked experimental; Clerk's lockout default changed in July 2026.

Sources: clerk.com/pricing; clerk.com/docs/guides/secure/reverification; clerk.com/changelog/2026-02-20-require-mfa; clerk.com/changelog/2026-10-29-passkey-second-factor; clerk.com/docs/guides/secure/user-lockout; clerk.com/docs/guides/dashboard/logs/application-logs; auth0.com/pricing; auth0.com/docs/secure/multi-factor-authentication/step-up-authentication; auth0.com/docs/secure/multi-factor-authentication/configure-recovery-codes-for-mfa; auth0.com/docs/api/management/v2/jobs/post-users-exports; stytch.com/pricing; stytch.com/docs/guides/mfa/overview; workos.com/pricing; workos.com/docs/authkit/mfa; supabase.com/pricing; supabase.com/docs/guides/auth/auth-mfa; supabase.com/docs/guides/auth/passkeys; firebase.google.com/docs/auth/web/multi-factor; firebase.google.com/pricing; better-auth.com/docs/plugins/2fa; keycloak.org/docs/latest/server_admin. The Identity Platform pricing page did not load, so its price above the free tier is not confirmed.

Accepted by the project owner on 2026-11-14: Clerk Pro with SMS off. Follow-up before production use: a short spike on a test account confirms that "require MFA" blocks all pages for a magic-link sign-up and that SMS can be fully disabled. If it fails, revisit this ADR (Better Auth fallback).

## Amendment (2026-11-15): email sign-in first, MFA before the live pilot

Decided by the project owner on 2026-11-15.

- **First release (Phase 2):** passwordless email sign-in (an emailed link or code) on **Clerk's free plan**. It is one factor: it proves the person controls the email inbox. A second emailed code is not used as a second factor, because it goes to the same inbox.
- **MFA (Phase 3):** move to Clerk Pro (about $25 a month at 5,000 monthly active users) and require a passkey or authenticator app for every account, with SMS off, step-up re-verification, recovery codes, and factor-change notices, as decided above. MFA is a gate for the Phase 4 live pilot.
- **Until MFA ships:** no real rider data and no live payments. Hosted use is limited to staging and rehearsals with fictional data. Every person still has their own account, and organizer roles still limit access.
- The test-account spike moves with MFA: before Phase 3, confirm that Clerk Pro's "require MFA" blocks all pages for an email sign-up and that SMS can be fully disabled.

Why: no monthly cost while there is no real rider data or money, and sign-in can be built and tested now. Risk accepted: in Phase 2, anyone who controls an account's email inbox can sign in as that account. That is acceptable only because the app then holds fictional data and takes no payments.

Product impact (product.md): [Sign-in and account security](../../product.md#sign-in-and-account-security) is phased; the acceptance criteria split into email sign-in (Phase 2) and MFA (Phase 3).
Roadmap impact (roadmap.md): Phase 2 builds email sign-in; Phase 3 builds MFA; the Phase 3 exit gate requires MFA before the Phase 4 pilot.

## Amendment 2 (2026-11-15): MFA for organizer roles only

Decided by the project owner on 2026-11-15, after D01 answered that an authenticator app "will be a turn down for consumer" ([D01](../discovery/interviews/D01.md#racer-follow-ups-2026-11-15)).

- **Riders and guardians:** passwordless email sign-in only, permanently, including during and after the live pilot. A rider change that moves money or hands an entry to someone else asks for a fresh emailed code.
- **Organizer roles:** MFA on Clerk Pro (passkey or authenticator app, SMS off) is required before the live pilot, with step-up re-verification and recovery as decided above.
- **Enforcement by role:** Clerk's "require MFA" setting applies to the whole application, so it stays off. The CycleReg server checks that an organizer's session completed a second factor before any organizer route. The Phase 3 spike must confirm Clerk Pro lets riders skip MFA while the server can verify an organizer's second factor.
- **Risk accepted:** someone who controls a rider's or guardian's inbox can sign in as them and see that account's registrations, including juniors' and emergency-contact details. This replaces requirement 1's "second factor required at enrollment" for riders and guardians only.

Product impact (product.md): Sign-in and account security; acceptance criteria; the checkout success measure no longer excludes MFA enrollment; open question 7 is answered.
Roadmap impact (roadmap.md): Phase 3 builds organizer MFA only; the Phase 3 exit gate and the P0 definition say organizer MFA.

## Delivery scheduling note (2026-11-15): organizer security last before launch

The project owner deferred organizer MFA and sensitive-action re-verification to the final pre-launch implementation and verification step, after other build work and fictional-data rehearsals. This updates the Phase 3 delivery timing recorded above; the accepted provider, organizer-only MFA, recovery, and enforcement decisions remain unchanged. The [roadmap gate](../../roadmap.md#final-pre-launch-security-gate-planned) is required before the Phase 4 pilot opens, any real rider data, or live payments. The provider spike and organizer security rehearsals move with this work. Riders and guardians keep email sign-in only.

## Consequences

- Unblocks hosting and the role-based features (check-in volunteer, timer/export, finance roles, emergency-contact access).
- Rider checkout gains an enrollment step; usability sessions must test first-time MFA on a phone, including a parent registering a junior.
- Shared check-in devices still need each volunteer to sign in with their own account (product.md).
- A new processor of personal data must be listed in the privacy notice and retention plan.
- Next: provider comparison, an accepted version of this ADR, then an implementation plan with session, step-up, and recovery tests.

Product impact (product.md): None until accepted. If accepted with SMS off, riders and guardians use a passkey or authenticator app; product.md allows but does not require SMS.
Roadmap impact (roadmap.md): Phase 2 sign-in work waits on acceptance of this ADR.
