# 0006. Amazon SES for transactional email

Status: Superseded by [ADR 0007](0007-transactional-email-resend.md) on November 19, 2026. This record describes the original decision.
Date: 2026-11-15
Deciders: Project owner
Related: [Communications](../../product.md#communications), [Sign-in and account security](../../product.md#sign-in-and-account-security), [Phase 2](../../roadmap.md#phase-2--build-the-registration-core), [email provider case study](../research/email-providers.md)

## Context

Phase 2 needs a transactional email provider for organizer invitations and their resend, order confirmations, waitlist offers, and later refund and cancellation notices. [product.md](../../product.md#communications) requires delivery and bounce status, safe retries, and suppression handling, and keeps marketing mail separate from operational mail. Volume is low: thousands of emails a month at peak. Sign-in codes are sent by Clerk ([ADR 0003](0003-sign-in-and-mfa.md)), not by this provider.

## Options considered

### Option A: Amazon SES
Pay per email (about $0.10 per 1,000 on the à la carte plan, AWS pricing page accessed 2026-11-15). Configuration sets separate event streams; bounce, complaint, and delivery events arrive through SNS or EventBridge; an account-level suppression list is built in. It can also carry marketing mail later through its subscription management (see the case study). Costs: a developer has to set up domain authentication and request production access, and there is no campaign editor.

### Option B: A transactional-first service (Postmark, Resend, Mailgun, SendGrid)
Easier dashboards and message streams, but at a monthly minimum (about $15 to $20 at 10,000 emails a month) for a volume SES serves for about $1. See the case study for each.

### Option C: Do nothing yet
Keep showing copyable links (waitlist offers) and telling owners to tell invitees to sign in. This does not meet the communications requirements for the pilot.

## Decision

Use **Amazon SES** for transactional email, chosen by the project owner on November 15, 2026 ("use SES for now"). Marketing email is out of scope for this decision; the case study recommends adding it on SES later with a separate subdomain and configuration set, or adding a marketing-first provider only if organizers need a campaign editor.

## Consequences

- The app sends through one email interface, so a second provider can be added later without touching business rules. Tests use a fake sender; no test sends real mail.
- Setup before any real sending, done by the owner in the project's own AWS account (never an employer account): verify the sending domain with Easy DKIM, a custom MAIL FROM domain, and a DMARC record; request SES production access; create a configuration set with bounce and complaint event publishing. No AWS resources are created by this decision record, and nothing is sent until those steps are done.
- Transactional sends never use SES list management, so a rider cannot unsubscribe from order or waitlist notices; marketing, if added, uses its own configuration set and subdomain.
- Delivery, bounce, and complaint events must be stored and shown in the organizer queue before email is relied on (product.md acceptance).

Product impact (product.md): Communications records the provider decision; invitation resend becomes buildable.
Roadmap impact (roadmap.md): The email-provider dependency for communications and invitation resend is resolved; sending is still Planned.
