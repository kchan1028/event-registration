# AGENTS.md

The entry point for AI coding agents (Claude Code and Codex) working in this repository. It says how to work here and links to the documents that own each rule. Human contributors follow the same rules through [CONTRIBUTING.md](CONTRIBUTING.md). Where this file and a linked guide disagree, the linked guide wins; fix this file in the same change.

## What this repository is

CycleReg is a proposed registration and race-day platform for U.S. road races and criteriums: source documents plus a local build in TypeScript, Node.js, React, and PostgreSQL. Payments with real money, USA Cycling checks, organizer MFA, and hosting are not built. What exists and how well it is checked is in [roadmap.md](roadmap.md#delivery-status) and [feature.md](feature.md). Setup and commands: [docs/runbooks/local-setup.md](docs/runbooks/local-setup.md).

## Read these first

| Topic | Authoritative document |
|---|---|
| Requirements, scope, business rules, acceptance criteria | [product.md](product.md) |
| Phases, priorities, dependencies, delivery status | [roadmap.md](roadmap.md) |
| Technical structure and decisions | [docs/architecture.md](docs/architecture.md), [docs/decisions/](docs/decisions/README.md) |
| Domain rules and code rules | [docs/coding-guide.md](docs/coding-guide.md) |
| Status vocabulary, glossary, writing rules, where each topic lives | [docs/documentation-guide.md](docs/documentation-guide.md) |
| Test scope, independent verification, predeployment gate, release blockers | [docs/testing/test-plan.md](docs/testing/test-plan.md) |
| Audit findings and coverage | [AUDIT.md](AUDIT.md) |
| Database as built | [DATA_MODEL.md](DATA_MODEL.md) |
| Security requirements and private reporting | [SECURITY.md](SECURITY.md) |
| Public pages and copy | [docs/content-guide.md](docs/content-guide.md) (only when a change touches them) |

If two documents disagree, `product.md` wins on requirements and `roadmap.md` wins on priority and status. Fix the other document in the same change and mention the conflict in the summary.

## How to change things

- **Small and focused.** One problem per branch and pull request; separate unrelated fixes. Branch from `origin/main`.
- **Accurate status.** Use the [status vocabulary](docs/documentation-guide.md#status-vocabulary). Never describe a command, integration, screenshot, or feature as working unless it exists here and was checked; a document saying "Implemented" is not evidence.
- **Code rules.** Follow the [coding guide](docs/coding-guide.md), especially [Keep the code simple](docs/coding-guide.md#keep-the-code-simple) and the domain rules agents most often get wrong: [six separate concepts](docs/coding-guide.md#keep-the-six-concepts-separate), [eligibility](docs/coding-guide.md#eligibility-rules), and [independent entry, payment, and readiness states](docs/coding-guide.md#keep-entry-payment-and-readiness-states-independent). Shared rules live in `src/shared/`.
- **Screens.** For a change to screens, layout, styling, interaction, or motion, load the `impeccable`, `awesome-design`, and `emil-design-eng` skills in that order before writing UI code. If one is not installed, say so in the summary. The [accessibility rules](docs/coding-guide.md#accessibility-and-mobile-usability) win any conflict.
- **Writing.** Follow the [documentation guide](docs/documentation-guide.md): plain English, relative links, Planned or Proposed for anything not built.

## Testing and independent verification

The [test plan](docs/testing/test-plan.md) owns this policy. In short:

- For a pull request, test the changed behavior, affected integrations, and relevant regressions locally, and explain the scope ([section 1](docs/testing/test-plan.md#1-pull-request-testing)). Run the full local regression (`npm run check` and `npm run test:e2e`) only at the [predeployment gate](docs/testing/test-plan.md#4-predeployment-testing). A documentation-only change follows the plan's documentation rule.
- Claude Code verifies changes Codex wrote, and Codex verifies changes Claude Code wrote ([section 3](docs/testing/test-plan.md#3-independent-verification)). The author's own checks still apply. If the other agent is unavailable, verification stays **Pending**, never passed.

## Documentation impact in every pull request

Review every change for impact on [product.md](product.md), [roadmap.md](roadmap.md), [feature.md](feature.md), [SECURITY.md](SECURITY.md), [DATA_MODEL.md](DATA_MODEL.md), [docs/testing/test-plan.md](docs/testing/test-plan.md), [AUDIT.md](AUDIT.md), README, and the affected guides. Update what is affected in the same pull request; when a document is not affected, say so in the summary instead of making cosmetic edits.

- **Test plan.** The pull request states **Test plan updated** (what and why) or **No test plan update needed** (why), as [section 8 of the plan](docs/testing/test-plan.md#8-keeping-this-plan-current) requires.
- **Audit findings.** When a change introduces, fixes, or invalidates a finding recorded in [AUDIT.md](AUDIT.md), update that finding in the same pull request. A fix moves a finding to "Fixed, pending verification"; only verification evidence closes it ([closure rule](AUDIT.md#closure-rule)).
- **Change summary.** Use the format in [CONTRIBUTING.md](CONTRIBUTING.md#change-summary).
- **Unanswered questions.** Record any open question that affects requirements, delivery, or validation in the document that owns the topic (`product.md`, `roadmap.md`, or the relevant guide or decision record), with the date, owner or Unassigned, and what it blocks. A question left only in chat or a pull request is lost. Silence is not an answer or an authorization.

## Review and merging

- The author opens the pull request and asks the other agent to verify it. The verifier tests and reviews only: no edits, commits, pushes, or merges. It marks each finding blocking or non-blocking; a missing or untrue `Test plan` line is blocking.
- Fix real correctness, security, and project-rule findings in the same pull request, for at most three rounds. A finding deferred past the merge becomes a GitHub issue ([labels](docs/coding-guide.md#labels-and-milestones-on-issues)).
- The author merges with `gh pr merge --squash` only when the verifier reports no blocking findings and the required checks pass, and only when the owner has not said to hold it. Never force-push or bypass branch protection. If verification is Pending or blocking findings remain after three rounds, do not merge; report the blocker.
- Never push to a branch whose pull request is already merged or closed (`gh pr view <branch> --json state`). Start a new branch from `origin/main`, cherry-pick, and open a new pull request. After a merge, clean up as the [coding guide](docs/coding-guide.md#branches-after-a-pull-request) describes.

## Secrets, personal data, and security findings

This repository is public.

- Never commit secrets, API keys, `.env` files, or real participant data (names, emails, birth dates, license numbers, emergency contacts, waivers, payment records). Use clearly fictional fixtures.
- Report a security weakness or exposed private data privately, as [SECURITY.md](SECURITY.md) describes. Never put exploit details in an issue, pull request, commit, or [AUDIT.md](AUDIT.md); record only a public-safe placeholder there.

## Boundaries

Do none of these unless the owner explicitly asks in the current task and the roadmap phase allows it:

- Merge when the owner said not to, or deploy a website or service.
- Create or configure cloud resources (AWS, Render, or others). Use the project's own named profiles, never a personal or employer default.
- Activate or configure live payments, or store card details anywhere. Payments use the provider's hosted flow, in test mode.
- Connect to USA Cycling or any federation account, or claim a federation integration exists.
- Import, migrate, or copy real rider registrations, waivers, or payment records.
- Choose a technology stack without an accepted [decision record](docs/decisions/README.md).
- Present competitor capabilities, fees, or federation rules as verified without a dated source in `product.md`.

## Before you finish

- [ ] The change is focused, and nothing is described as working that was not checked
- [ ] Tests for the changed behavior, affected integrations, and relevant regressions ran, or the documentation-only rule applied; scope stated
- [ ] Verifier named, or Pending with the reason
- [ ] Product, roadmap, feature, security, data model, test plan, audit, README, and guide impact reviewed; affected documents updated in this pull request
- [ ] `Test plan` line present and true
- [ ] Relative links resolve; no secrets, real personal data, or sensitive security detail added
