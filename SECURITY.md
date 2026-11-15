# Security policy

CycleReg will handle rider contact details, emergency contacts, license numbers, waivers, and payments, so security problems are taken seriously even at the documentation stage. This file explains what to report, how to report it privately, and which security rules the product is held to.

> **Status: local build only.** The organizer workspace runs on `127.0.0.1` with no sign-in and stores data in a local PostgreSQL database ([setup](docs/runbooks/local-setup.md)). There is no deployed website, no payment processing, and no real rider data. It must not be hosted or shared until sign-in and role-based access exist, and it must not hold real rider data or take live payments until MFA is required for every organizer role (Phase 3, before the live pilot). Riders and guardians use email sign-in only. The server enforces this: it refuses to listen on any address other than `127.0.0.1`, `localhost`, or `::1` (`src/server/listen.ts`), and the [Render deploy files](docs/runbooks/deploy-render.md) are not to be used until sign-in ships. Unless a section says otherwise, the security requirements below are Planned, not Implemented.

## Supported versions

| Version | Supported |
|---|---|
| Documentation and the local build on the `main` branch | Yes |
| Released software | None exists yet |

This table will list released versions once there is code to release.

## What to report

Report privately if you find any of these in the repository, its history, or a pull request:

- A secret, API key, token, password, or `.env` file
- Real rider data, such as names, emails, birth dates, license numbers, emergency contacts, waivers, or payment records (fixtures must be clearly fake; see [CONTRIBUTING.md](CONTRIBUTING.md#how-to-make-a-change))
- A requirement or design in [product.md](product.md) or [docs/architecture.md](docs/architecture.md) that would expose personal data, bypass multi-factor authentication (MFA), or let a role see or change more than it should

Once code exists, report vulnerabilities in it the same way.

General bugs, typos, and feature ideas are not security issues. File those as normal issues following [CONTRIBUTING.md](CONTRIBUTING.md#reporting-a-problem).

## How to report

**Do not open a public issue, pull request, or discussion for a security problem.**

1. Contact the repository owner privately through their GitHub profile ([kchan1028](https://github.com/kchan1028)). GitHub private vulnerability reporting is not enabled for this repository yet.
2. Describe what you found, where it is (file and commit, or URL), and how it could be misused.
3. Leave out real personal data. Describe it ("a rider's license number appears in fixture X") rather than copying it.
4. If you found an exposed secret, do not use it to test access.

## What happens next

This is a volunteer project with no response-time guarantee. The owner aims to:

1. Acknowledge the report and confirm whether it is a security issue.
2. Remove exposed secrets or personal data, rotate any affected secret, and record the incident, as required by [docs/coding-guide.md](docs/coding-guide.md#secrets).
3. Fix the document or code and credit the reporter if they want credit.

Please give the owner a reasonable chance to fix the problem before you discuss it publicly.

## Security requirements the product is held to (Planned)

Each rule has one home. The links below point to it; this list is a summary, not a second source.

| Area | Rule summary | Home |
|---|---|---|
| Sign-in | Phase 2: passwordless email sign-in for every account, fictional data only. Phase 3, before the live pilot: MFA required for every organizer role (riders and guardians stay on email sign-in, with a fresh emailed code before money-moving changes); step-up re-verification for sensitive organizer actions; recovery never bypasses MFA | [product.md](product.md#sign-in-and-account-security) |
| Payments | Hosted provider flow only; card numbers and security codes are never stored | [docs/architecture.md](docs/architecture.md#data-boundaries) |
| Roles | Server-side permission checks per role and event; least access by default | [docs/coding-guide.md](docs/coding-guide.md#roles) |
| Privacy | Collect only required data; restrict emergency contacts; keep personal data out of logs, analytics, and URLs | [docs/coding-guide.md](docs/coding-guide.md#privacy) |
| Secrets | Never committed; test and live keys kept separate; rotate on exposure | [docs/coding-guide.md](docs/coding-guide.md#secrets) |
| Audit | Append-only audit history for money, categories, waivers, capacity, permissions, and exceptions | [docs/coding-guide.md](docs/coding-guide.md#audit-history) |
| Public pages | Private pages are not indexable | [docs/content-guide.md](docs/content-guide.md#keep-private-data-out-of-public-pages) |

Retention and deletion rules are still an open decision and must be defined before the pilot ([product.md](product.md#open-decisions)).
