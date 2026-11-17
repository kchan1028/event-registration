# Security policy

CycleReg will handle rider contact details, emergency contacts, license numbers, waivers, and payments, so security problems are taken seriously while the build is local and holds fictional data. This file explains what to report, how to report it privately, and which security rules the product is held to.

> **Status: local build with email sign-in, fictional data only.** Every API route except the health check, the public event list, rider event pages, and the Stripe webhook (trusted only by its verified signature) requires passwordless email sign-in (Clerk, [ADR 0003](docs/decisions/0003-sign-in-and-mfa.md) Phase 2), and organizer routes check the caller's role in the event's organization on the server (`src/server/auth.ts`, `src/shared/roles.ts`). Data is stored in a local PostgreSQL database ([setup](docs/runbooks/local-setup.md)). There is no deployed website, no payments with real money, and no real rider data. Payments are simulated or use Stripe test mode; live keys are refused. Email sign-in is one factor: anyone who controls an account's inbox can sign in as it. So the app must not hold real rider data or take live payments until MFA and sensitive-action re-verification are enforced for every organizer role at the final pre-launch security gate; riders and guardians stay on email sign-in by owner decision; until then hosted use is limited to staging and rehearsals with fictional data, and the [Render deploy](docs/runbooks/deploy-render.md) still waits on its other gates. Unless a section says otherwise, the security requirements below are Planned, not Implemented.

## Expired invitation guidance (Implemented locally)

The signed-in recipient reads only their own latest expiry notices through `/api/rider/expired-invitations`. Authenticated account email scopes organization/role history, without revealing the team or granting access. A later grant of the same role supersedes its notice. Real identity-provider acceptance remains open.

## Refund request recovery (Implemented locally)

New refund POSTs require a client request ID. The existing per-order refund lock and a database uniqueness index preserve one accepted normalized request; identical replay reuses the saved row before cap checks, while changed details are refused. Existing owner/finance authorization applies before replay, and the original requester is preserved. Different deliberate request IDs remain subject to payment/entry caps; this is not cross-device duplicate-intent detection.

Unresolved requests are retained in session storage scoped to signed-in email/order; no card data is stored. Storage includes the organizer reason and financial references, so real-data retention remains a gate. Blocked storage gives in-memory recovery only. New refunds are unavailable while this tab's result is unresolved; loss of refund permission keeps read-only guidance. Provider-unknown refunds stop being sent 23 hours after creation, leaving a margin before Stripe API v1 may prune its key; the amount stays reserved and late signed updates can still resolve it. Finance must reconcile before another reimbursement. No automatic replacement refund, support override or real payment is added.

## Waiver acceptance evidence (Implemented locally)

New orders record the authenticated accepting account ID, validated declared racing age and server acceptance timestamp beside the original waiver. Client-supplied evidence is ignored; checkout replay and rider corrections preserve the original snapshot. Historical records remain null rather than being reconstructed. Existing private order-access rules govern this evidence, including read-only junior viewing; no public field, access override or federation approval is added. Demo/case-study fixture orders, including organizer demo actions, have no inferred accepting account. Preservation is enforced by application writes, not a database immutability trigger. Retention, real identity and legal/minor acceptance remain launch gates.

## Explicit guardian authority (Implemented locally)

Migration 30 promotes active `junior_guardians` records on unmerged profiles to the authority for linked junior orders. The placing account stays provenance; it alone cannot authorize a linked order. Shared SQL controls private order reads, payment/cancellation and registration lists, and checkout nonce replay rechecks current authority. Adult orders without a junior profile retain placing-account authorization. A junior viewer stays read-only. Organization permissions remain separate and never grant family invitation authority.

Private invitation creation/cancellation is available on My registrations through the existing authenticated APIs. My registrations renders recipient lookup and acknowledged acceptance using the existing authenticated APIs; no grant is made by viewing an invitation. Signing in grants nothing; acceptance rechecks invited email, current inviter, expiry/cancellation, guardian count, viewer address and same-name household collision. All family writes share one advisory lock; order writers take the event lock first. Acceptance records actor/time and inserts the grant in one transaction; retries do not add or reactivate grants. No email is sent.

Profile creator identity is nullable provenance. Name merges require identical active guardian sets and compatible viewer emails, preserve source profiles/grants and accepted evidence, and move orders/history to the canonical profile. Linked orders restrict profile deletion. These are application protections, not a database immutability guarantee or proof of legal guardianship. Original payments/waivers remain unchanged. Explicit removal APIs require a current guardian, other relationship ID, reason and acknowledgement; family locking prevents opposing removals from removing both guardians. Identical replay preserves evidence and never targets a later grant. Private relationship history is available only to current guardians. Guardian management screens use the same authenticated APIs and shared removal validation. Claims and support restoration remain Planned; approved disputed restoration requires product-owner/support review only. Retention/account deletion and real identity/minor-consent approval remain launch gates.

## Reservation recovery (Implemented locally)

The existing per-tab registration draft also retains the exact pending reservation payload and displayed waiver text until its outcome is known. Unknown network/server, authentication and rate-limit failures retain that request ID; pending entries and consent cannot be edited. Recovery uses the existing account-protected order endpoint and server idempotency checks. A definitive rejection refreshes published terms and clears agreement if the waiver changed. This adds no route, role, database field, logging or card storage. Browser storage remains best effort; blocked storage or closing the tab cannot guarantee refresh recovery. Use fictional data only.

## Checkout-session retries (Implemented locally)

Concurrent requests use the existing order-scoped provider key and fixed request parameters. The Stripe SDK handles bounded conflict retries; an exhausted `idempotency_key_in_use` conflict returns a retryable 503 without creating a payment or changing entry/readiness state. The same authenticated order can be retried. Session expiry is described in [the data model](DATA_MODEL.md#payment_sessions); it does not extend capacity reservations. Tests use the real SDK with a fake HTTP transport and fictional data, not a real provider account. Live keys remain refused; permissions and webhook verification are unchanged.

## Walk-up phone handoff (Implemented locally)

Check-in staff can display only the public event registration address and QR. It contains no rider details, offer tokens or staff-page query parameters. Registration stays under the participant/guardian account; the staff session is not handed to the rider. No new API route, role, account access, payment method or waiver bypass is added. The published-event guard suppresses handoff for an unpublished event; server registration validation remains authoritative. Shared kiosks and staff-entered orders remain outside this increment. Local loopback addresses cannot serve another device; real-phone use requires reachable staging with the existing security gates.

## Supported versions

| Version | Supported |
|---|---|
| Documentation and the local build on the `main` branch | Yes |
| Released software | None exists yet |

This table will list released versions once there is a release.

## What to report

Report privately if you find any of these in the repository, its history, or a pull request:

- A secret, API key, token, password, or `.env` file
- Real rider data, such as names, emails, birth dates, license numbers, emergency contacts, waivers, or payment records (fixtures must be clearly fake; see [CONTRIBUTING.md](CONTRIBUTING.md#how-to-make-a-change))
- A requirement or design in [product.md](product.md) or [docs/architecture.md](docs/architecture.md) that would expose personal data, bypass multi-factor authentication (MFA), or let a role see or change more than it should

Once code exists, report vulnerabilities in it the same way.

General bugs, typos, and feature ideas are not security issues. File those as normal issues following [CONTRIBUTING.md](CONTRIBUTING.md#reporting-a-problem).

## How to report

**Do not open a public issue, pull request, or discussion for a security problem.**

1. Use GitHub's private vulnerability reporting: on the repository's **Security** tab, choose **Report a vulnerability** ([direct link](https://github.com/kchan1028/event-registration/security/advisories/new)). Only the owner sees the report. If you cannot use it, contact the repository owner privately through their GitHub profile ([kchan1028](https://github.com/kchan1028)).
2. Describe what you found, where it is (file and commit, or URL), and how it could be misused.
3. Leave out real personal data. Describe it ("a rider's license number appears in fixture X") rather than copying it.
4. If you found an exposed secret, do not use it to test access.

## What happens next

This is a volunteer project with no response-time guarantee. The owner aims to:

1. Acknowledge the report and confirm whether it is a security issue.
2. Remove exposed secrets or personal data, rotate any affected secret, and record the incident, as required by [docs/coding-guide.md](docs/coding-guide.md#secrets).
3. Fix the document or code and credit the reporter if they want credit.

Please give the owner a reasonable chance to fix the problem before you discuss it publicly.

Named demo loaders use reserved organization/event IDs for fixture identity and refuse sharing workspaces with additional events or non-demo draft/published configurations. User-chosen organization names are display labels only.

The BBC and Pinole TTT research loaders require sign-in and use the existing demo-owner policy. They publish empty, explicitly read-only demo records, with no historical roster, rider/license, result, consent, or payment records. Public event views expose the research notice without entry forms; server order creation and shared selection checks reject registration. Validation only permits the research-only publication exception for empty demo configurations. Organizer editing/publication permissions remain unchanged. TT/team consent and registration are not implemented.

The Wente, Mount Hamilton, Chico, and Sunset historical loaders use the same authenticated demo-owner policy. They seed event structure and declared test assumptions only, with no historical rider, license, result, or signature records. Simulated checkout does not approve licensing, professional admission, stage progression, or equipment-specific entry.

The Red Kite historical sample uses the existing authenticated demo-owner loader. It seeds only selected event structure and explicit test assumptions, never historical participant, license, standings, or result records. Payments remain simulated; organizer/license review is independent of payment.

The San Francisco Grand Prix historical loader uses the same authenticated demo-owner policy. Its individual simulated checkout does not perform professional team selection or admission. Only event structure is seeded; no historical roster, result, or rider records are imported.

The Burlingame historical demo loader requires sign-in and grants its caller demo-organization ownership using the existing demo access policy. It imports event structure only, with no historical rider or result records. Its sample waiver, prices, and payments are fictional testing data.

The retired purchase-flow fixture loader is removed. The home-page rider action only browses existing events; generated case studies and Berkeley demos still require their explicit loaders. No role or private-data access is added by fixture removal.

## Protected bib reassignment (Implemented locally)

Bulk bib changes require `checkin.settings` (owner or registration manager). Individual corrections retain the existing `checkin` permission for check-in staff. Both paths require a reason and a fresh server-verified before/after preview. Changes to checked-in riders also require an explicit acknowledgement bound to that preview; the former direct individual-change endpoint refuses requests without a preview fingerprint. Linked orders resolve to the canonical rider key. Individual corrections may retain an issued bib after refund, withdrawal, or cancellation; authorized lookup includes inactive riders only while they retain an active bib in the selected collision scope. Bulk changes still require confirmed entrants. No financial or entry state is restored.

The server rechecks numbers, ranges, identities, published configuration, and check-in state under the event lock. Conflicts or stale previews apply no changes. Swaps release and replace selected numbers atomically, preserve old assignment rows, record the authenticated actor and reason, and create linked revisions for all affected start lists in the collision scope. Snapshot failure rolls back the entire change. Entry, payment, waiver, license, and check-in states are unchanged. No new public route or contact data is exposed.

## Security requirements the product is held to (Planned)

Each rule has one home. The links below point to it; this list is a summary, not a second source.

| Area | Rule summary | Home |
|---|---|---|
| Sign-in | Phase 2 (Implemented in the local build, November 15, 2026): passwordless email sign-in for every account, one account per person, organizer roles enforced on the server, fictional data only; sign-in attempt rate limits and lockout are Clerk's. Without Clerk keys, local development uses a test sign-in that accepts any fictional `.test` address with no proof of identity; the server allows it only outside production while listening on this computer (`127.0.0.1`, `localhost`, or `::1`), and refuses to start without Clerk anywhere else (November 15, 2026, `authProviderFromEnv` in `src/server/auth.ts`). Final pre-launch security gate (Planned, deferred until after other build work and fictional-data rehearsals): MFA and sensitive-action re-verification required for every organizer role (riders and guardians stay on email sign-in, with a fresh emailed code before money-moving changes); step-up re-verification for sensitive organizer actions; recovery never bypasses MFA | [product.md](product.md#sign-in-and-account-security) |
| Payments | Hosted provider flow only; card numbers and security codes are never stored | [docs/architecture.md](docs/architecture.md#data-boundaries) |
| Roles | Server-side permission checks per role and event; least access by default | [docs/coding-guide.md](docs/coding-guide.md#roles) |
| Privacy | Collect only required data; restrict emergency contacts; keep personal data out of logs, analytics, and URLs | [docs/coding-guide.md](docs/coding-guide.md#privacy) |
| Secrets | Never committed; test and live keys kept separate; rotate on exposure | [docs/coding-guide.md](docs/coding-guide.md#secrets) |
| Audit | Append-only audit history for money, categories, waivers, capacity, permissions, and exceptions | [docs/coding-guide.md](docs/coding-guide.md#audit-history) |
| Public pages | Private pages are not indexable | [docs/content-guide.md](docs/content-guide.md#keep-private-data-out-of-public-pages) |

Retention and deletion rules are still an open decision and must be defined before the pilot ([product.md](product.md#open-decisions)).

Berkeley rider-rate pricing is recalculated on the server from the accepted configuration and parsed rider facts; client totals are not trusted. Declared age, collegiate division and competition class do not constitute federation verification. Existing paid order quotes are preserved when revised prices are published. No live payment configuration or new access route is introduced.
