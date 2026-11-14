# AGENTS.md

Instructions for AI coding agents and other automated contributors. Human contributors follow the same rules through [CONTRIBUTING.md](CONTRIBUTING.md).

## What this repository is

CycleReg is a proposed registration and race-day platform for U.S. road races and criteriums. Right now the repository contains documentation only. No technology stack has been chosen, and there is no code to build, test, or run. Do not describe commands, integrations, screenshots, or features as working unless they exist in this repository and have been checked.

## Read these first, in this order

1. [product.md](product.md): requirements, scope, business rules, acceptance criteria. Source of truth for what to build.
2. [roadmap.md](roadmap.md): phases, priorities, dependencies, risks, and delivery status. Source of truth for when and in what order.
3. [docs/coding-guide.md](docs/coding-guide.md): domain rules that code must follow.
4. [docs/architecture.md](docs/architecture.md) and [docs/decisions/README.md](docs/decisions/README.md): what is decided and what is still open.
5. [docs/documentation-guide.md](docs/documentation-guide.md): status vocabulary, glossary, and writing rules.
6. [docs/content-guide.md](docs/content-guide.md): only when the change touches public-facing pages or copy.

If two documents disagree, `product.md` wins on requirements and `roadmap.md` wins on priority and status. Fix the other document in the same change and mention the conflict in your summary.

## Document maintenance rule (mandatory)

Every change must review both [product.md](product.md) and [roadmap.md](roadmap.md) for impact.

- Update `product.md` when requirements, scope, user flows, business rules, acceptance criteria, or product decisions change.
- Update `roadmap.md` when priorities, dependencies, milestones, blockers, or delivery status change.
- When a change affects neither document, state that explicitly in the change summary instead of making cosmetic edits.
- Keep `README.md` and affected guides consistent with the implementation.
- Mark roadmap work complete only after its acceptance criteria are verified.
- Distinguish planned, implemented, and verified behavior.
- Do not maintain a competing product roadmap elsewhere.

## Boundaries

Do not do any of the following unless the user explicitly asks for it in the current task and the roadmap phase allows it:

- Activate or configure live payments, or store card details anywhere. Payments use a provider's hosted flow.
- Connect to USA Cycling or any federation account, or claim a federation integration exists.
- Deploy a website or service, or create cloud resources.
- Import, migrate, or copy real rider registrations, waivers, or payment records.
- Commit secrets, API keys, `.env` files, or real rider data (names, emails, birth dates, license numbers, emergency contacts). Use clearly fake fixtures.
- Choose a technology stack without an accepted architecture decision record (ADR). See [docs/decisions/README.md](docs/decisions/README.md).
- Present competitor capabilities, fees, or federation rules as verified unless a dated source in `product.md` supports them.

## Domain rules agents most often get wrong

- Display groups, registration categories, start groups, classifications, capacity pools, and bundles are separate concepts. Never merge two of them to save code. See [product.md](product.md#keep-the-concepts-separate).
- A display header never creates a capacity limit.
- A rider counts once toward a shared start-group limit, even with several classification tags.
- Eligibility is structured (AND between independent constraints, OR between alternatives, explicit exceptions). Do not infer eligibility from a category label or assume category numbers form a simple ladder.
- Unknown or stale license verification means "needs review", never "cleared".
- Entry, payment, and readiness states are independent. A paid entry is not automatically cleared to race.
- Paid entries keep the price and rules accepted at purchase. Never silently reprice or invalidate them.

## Writing rules

- Plain English. Lead with the point, then the detail. Define a technical term the first time it appears or link to the [glossary](docs/documentation-guide.md#glossary).
- Label anything not built as Planned or Proposed. Use the [status vocabulary](docs/documentation-guide.md#status-vocabulary).
- No filler, hype, or unsupported claims. No em dashes as sentence separators.
- Mermaid diagrams need a short plain-English explanation underneath.
- Use relative links between repository files.

## Change summary format

End every change with this summary (in the commit message body, pull request description, or final report):

```text
What changed:
Why:
Product impact (product.md): <sections updated, or "None" plus the reason>
Roadmap impact (roadmap.md): <sections updated, or "None" plus the reason>
Docs updated: <README or guides touched, or "None needed" plus the reason>
Status: Planned | Implemented | Verified (say what was checked and how)
Open questions:
```

## Before you finish

- [ ] `product.md` and `roadmap.md` reviewed; impact stated in the summary
- [ ] README and affected guides match the repository as it actually is
- [ ] Relative links resolve and Mermaid diagrams parse
- [ ] No secrets or real personal data added
- [ ] Nothing described as working that has not been verified
