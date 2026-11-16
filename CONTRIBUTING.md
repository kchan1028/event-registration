# Contributing to CycleReg

Thanks for helping. This guide explains how to propose a change, make it, and get it reviewed. It is written for new contributors and for a race organizer taking over the project from someone else.

The project has its source documents and a local build covering the category builder, rider checkout with simulated payment, registration tools, check-in, and start lists. Useful contributions now are discovery notes, requirement clarifications, decision records, and code that closes gaps listed in [roadmap.md](roadmap.md#delivery-status). To run the code, follow [docs/runbooks/local-setup.md](docs/runbooks/local-setup.md).

## The one rule that applies to every change

Every change must review both [product.md](product.md) and [roadmap.md](roadmap.md) for impact.

- Update `product.md` when requirements, scope, user flows, business rules, acceptance criteria, or product decisions change.
- Update `roadmap.md` when priorities, dependencies, milestones, blockers, or delivery status change.
- When a change affects neither document, state that explicitly in the change summary instead of making cosmetic edits.
- Keep `README.md` and affected guides consistent with the implementation.
- Mark roadmap work complete only after its acceptance criteria are verified.
- Distinguish planned, implemented, and verified behavior.
- Do not maintain a competing product roadmap elsewhere.

Reviewers will send back any change whose summary does not state its product and roadmap impact.

## How to propose a change

1. **Check the source documents.** Search `product.md` and `roadmap.md` for the topic. Many questions are already answered there, including what is deliberately out of scope.
2. **Decide what kind of change it is.**

   | Kind of change | Where it goes |
   |---|---|
   | New or changed requirement, rule, flow, or acceptance criterion | Edit `product.md` |
   | New priority, dependency, milestone, blocker, or status | Edit `roadmap.md` |
   | Significant technical choice (stack, data store, payment provider, hosting, integration approach) | New ADR in [docs/decisions/](docs/decisions/README.md) |
   | How we work, write, or test | Edit the relevant guide in [docs/](docs/documentation-guide.md#where-things-live) |
   | Implementation of planned work | Code plus the docs it affects |

3. **Write down the problem first.** One or two sentences: who is affected, what goes wrong today, and how you will know the change worked. Link to the requirement or roadmap item it serves.
4. **Raise open questions early.** If the change depends on USA Cycling, a payment provider, a timer, or the club's treasurer, name the dependency and who owns it (see the responsibilities table in [roadmap.md](roadmap.md#responsibilities)).

## How to make a change

1. Create a branch from `main` with a short descriptive name, for example `docs/category-import-errors` or `feat/capacity-pools`.
2. Keep the change focused on one problem. Separate unrelated fixes.
3. Follow [docs/coding-guide.md](docs/coding-guide.md) for domain rules and [docs/documentation-guide.md](docs/documentation-guide.md) for writing.
4. Update `product.md`, `roadmap.md`, `README.md`, and affected guides in the same change when the rule above requires it.
5. Use fake data only. Never commit secrets, `.env` files, or real rider information.
6. Run the tests for what you changed, as the [test plan](docs/testing/test-plan.md) describes, and record the scope and results in the pull request. CI runs the whole suite; `npm run check` and the full `npm run test:e2e` run locally only before a deployment. Keep the visual system in [DESIGN.md](DESIGN.md) consistent.
7. Write the change summary (format below).

## Change summary

Put this in the pull request description, or in the commit message body for a direct commit:

```text
What changed:
Why:
Product impact (product.md): <sections updated, or "None" plus the reason>
Roadmap impact (roadmap.md): <sections updated, or "None" plus the reason>
Docs updated: <README or guides touched, or "None needed" plus the reason>
Test plan: <"Test plan updated: what changed and why" or "No test plan update needed: brief reason">
Status: Planned | Implemented | Verified (say what was checked and how)
Open questions:
```

Example of a valid "no impact" line: `Product impact (product.md): None. This fixes a broken link in the coding guide and changes no requirement.`

The `Test plan` line follows [keeping the test plan current](docs/testing/test-plan.md#8-keeping-this-plan-current): update the plan in the same pull request when the change alters workflows, integrations, risks, test commands, environments, fixtures, CI, coverage, verification, or release gates.

## Review expectations

- Every change gets at least one reviewer who did not write it. While the team is one person, the author reviews their own change a day later against the checklist below and says so in the summary.
- Changes that touch money, capacity, eligibility, waivers, permissions, or personal data need a reviewer who understands that area (for example the treasurer for refunds, the registration lead for category rules). See [docs/coding-guide.md](docs/coding-guide.md#testing-and-review). Changes written by an agent are independently verified by the other agent ([test plan](docs/testing/test-plan.md#3-independent-verification)).
- Reviewers check:
  - [ ] Product and roadmap impact is stated and correct
  - [ ] The `Test plan` line is present and true; the [test plan](docs/testing/test-plan.md#8-keeping-this-plan-current) is updated when the change requires it
  - [ ] Docs describe what exists, labeled Planned, Implemented, or Verified
  - [ ] Roadmap items are marked complete only with evidence that acceptance criteria pass
  - [ ] No secrets or real personal data
  - [ ] Relative links work and Mermaid diagrams render
  - [ ] Tests cover the acceptance criteria the change claims, the pull request explains the test scope and records evidence as the [test plan](docs/testing/test-plan.md) asks, and CI is green

## Architecture decisions

Write an ADR when a choice is expensive to reverse or affects several parts of the system. The process and template are in [docs/decisions/README.md](docs/decisions/README.md). Open a decision as Proposed, discuss it, then mark it Accepted or Rejected. Do not edit an accepted ADR to change its decision; write a new one that supersedes it.

## Reporting a problem

Describe what you expected, what happened, and how to reproduce it. Leave out real rider names, emails, license numbers, and payment details. If the problem exposes private data or a security weakness, report it privately as described in [SECURITY.md](SECURITY.md) instead of filing it in public. For accessibility barriers, see [ACCESSIBILITY.md](ACCESSIBILITY.md#report-a-barrier).

## License

By contributing, you agree that your contributions are licensed under the [MIT License](LICENSE.md).

## Questions

If something in these documents is unclear, that is a documentation bug. Open an issue or a change that fixes the wording.
