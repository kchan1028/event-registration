# Requirements entry point

Status: Proposed documentation addition  
Date: November 15, 2026

Read [product.md](product.md) for the authoritative requirements and [roadmap.md](roadmap.md) for priorities, dependencies, delivery status, and release gates. This file is an entry point for product review and Codex implementation tasks; it introduces no new requirements or competing roadmap.

## Find the requirement before changing code

| Review question | Authoritative source |
| --- | --- |
| Who is the product for, and what outcome should improve? | [Product brief](product.md) |
| What belongs in the first release? | [First-release scope](product.md#scope-of-the-first-release) |
| How do registration categories, start groups, classifications, and capacity differ? | [Category concepts](product.md#keep-the-concepts-separate) |
| What are the acceptance criteria and launch conditions? | [Product requirements](product.md) and [launch criteria](product.md#launch-criteria) |
| What is implemented, pending, or blocked? | [Delivery roadmap](roadmap.md) |
| What should happen next? | [Next actions](roadmap.md#next-actions) |
| How are changes reviewed? | [Contribution guide](CONTRIBUTING.md) |
| How are requirements and status maintained? | [Documentation guide](docs/documentation-guide.md) |

## Product review

Review the existing requirements from the perspective of a rider or parent, registration lead, check-in volunteer, timer, treasurer, and successor organizer. Check that each proposed change identifies:

- The user's problem and the measurable outcome.
- Its scope and acceptance criteria in `product.md`.
- Its priority, dependency owner, and evidence needed in `roadmap.md`.
- Failure and recovery behavior, particularly for money, capacity, eligibility, waivers, permissions, and personal data.
- The operating burden on volunteers and the plan for handing responsibilities to a successor.

Berkeley Omnium remains a proposed design partner, not an approved migration. A completed local build does not establish readiness for live registration. Use the source documents' launch gates and evidence requirements before making that decision.

## Codex implementation handoff

1. Read `CONTRIBUTING.md`, `product.md`, `roadmap.md`, and the applicable guides before editing.
2. Select a focused item from the existing roadmap. Preserve its stated acceptance criteria and prerequisite gates; do not infer authorization to implement the entire roadmap from this document.
3. Check existing code and tests before adding functionality. Distinguish implemented local or simulated behavior from verified production integration.
4. Keep the change small and reviewable. Never commit secrets or real rider information; follow the repository's test-data rules.
5. Update `product.md` when requirements change and `roadmap.md` when priority, dependencies, or delivery status change. Otherwise explain why neither needs an edit.
6. Run the tests for what you changed ([test plan](docs/testing/test-plan.md)); `npm run check` and the full `npm run test:e2e` run only before a deployment. Report any check that could not run and why.
7. Open a pull request using the contribution guide's change-summary format. Include evidence, remaining dependencies, and product and roadmap impact. Do not merge or deploy as part of opening the pull request.

New requirements belong in `product.md`; new priorities and status changes belong in `roadmap.md`. Link to them here when needed rather than copying their details.
