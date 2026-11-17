# Audit findings

A public-safe register of audit findings for CycleReg: what was examined, what was found, and what evidence closes each finding. It records findings only. Requirements stay in [product.md](product.md), priorities and delivery status in [roadmap.md](roadmap.md), and individual defects in GitHub issues, which findings link to rather than copy.

This repository is public. Security weaknesses are reported privately as [SECURITY.md](SECURITY.md) describes. This register never holds exploit details, affected endpoints, or reproduction steps for a vulnerability; at most a placeholder that a private report exists.

## Current audit

| Field | Value |
|---|---|
| Audit | Documentation-based baseline |
| Date | November 16, 2026 |
| Reviewed commit | `f2875ba8ef03f7c5364138dd654553554dc405b5` (`main`) |
| Auditor | Claude Code (author of this register); independent verification by Codex is Pending |
| Methods | Read `product.md`, `roadmap.md`, `feature.md`, `SECURITY.md`, `ACCESSIBILITY.md`, `DATA_MODEL.md`, and the [test plan](docs/testing/test-plan.md); reviewed open GitHub issues; checked specific claims against the source and tests named in each finding; ran `npm audit` for dependency advisories |
| Limitations | No application run, no regression suite, no penetration test, no load test, no manual accessibility pass, no real-device check, and no review against real provider instances (Clerk, Stripe, SES). A document saying a feature is Implemented was not taken as evidence that it works. Coverage below says what was and was not examined |

## Supplemental prelaunch research

November 16, 2026, Codex, baseline `028d7e2`: [registration and operational readiness](docs/research/prelaunch-readiness.md). Scope: source and existing-document inspection, dated primary-source research, runtime provenance checks, and five filtered roster/check-in tests (five passed, 23 skipped). No fresh rendered journey, real provider, staff rehearsal or restore was checked. The running local UI was a separate uncommitted variant; historical variant checks do not validate main. Claude Code round 2 reviewed supplemental documentation at `1e16d692b0b1942ce9e8624a1fcd461e0c5ace26` with no documentation blockers; no application tests were rerun. Later verification-record edits are author-checked, not independently reviewed. The historical coverage table below describes the original audit, not this supplement.

The supplement partially examines capacity/eligibility/pricing/refund implementation and race-day controls; it does not verify their complete correctness. It does not close GAP-001–011. Two newly tracked main defects are added below. AUD-006 was corrected and independently reviewed in merged PR #129 (`75b86ae`).

November 16 volunteer-guide source review against `cdc9fbc`: Claude Code identified a printed-roster instruction conflict, tracked as AUD-011 / #142 below. This supplemental finding is source-inspected only; no fresh runtime, printer or volunteer test was performed. The [check-in guide](docs/runbooks/race-day-check-in.md) originally documented the limitation. The subsequent #142 wording fix adds reference-only instructions to the printout; its closure evidence is recorded below and does not close operational gaps.

## Coverage

| Area | Status | What was examined |
|---|---|---|
| Documentation accuracy | Partly assessed | Status claims in README, roadmap, and source comments compared with the code for the findings below; not a full document sweep |
| Dependencies | Assessed | `npm audit` on the reviewed commit |
| Payments (Stripe test mode) | Partly assessed | Open issues and `src/server/payments.ts` for the recorded defect; no provider-level check |
| Sign-in, roles, guardian access | Partly assessed | Roadmap gates and source search for MFA; no access-control test review |
| Email (Amazon SES, test-only) | Partly assessed | `src/server/email.ts` and the schema for delivery-event handling |
| Check-in and bibs | Partly assessed | Open issues only |
| Registration screens on phones | Partly assessed | Open issue only; no device check |
| Capacity, eligibility, pricing, refunds | Not Assessed | |
| Start lists and timer export | Not Assessed | Readiness gap recorded from the roadmap only |
| Application security (threat model, penetration test) | Not Assessed | Out of scope for a public register; handled privately under [SECURITY.md](SECURITY.md) |
| Privacy, retention, and deletion | Not Assessed | Readiness gap recorded from the roadmap only |
| Accessibility (manual passes) | Not Assessed | Readiness gap recorded from `ACCESSIBILITY.md` only |
| Performance and load | Not Assessed | Readiness gap recorded from the roadmap only |
| Operations (backups, restore, monitoring, support) | Not Assessed | Readiness gap recorded from the roadmap only; runbooks are deferred |

## How findings are recorded

- **IDs are stable.** `AUD-` for an observed defect, `GAP-` for a documented readiness gap. An ID is never reused or renumbered; a finding that turns out wrong is marked Invalidated, not deleted.
- **Severity:** Critical (oversold place, duplicate charge, lost confirmed entry, unexplained ledger difference, or exposed private data, as [operations.md](docs/operations.md#incident-severity) defines), High (wrong result in money, capacity, eligibility, waivers, permissions, or personal data, or a known exploitable dependency on a shipped path), Medium (a wrong or failed result with a workaround), Low (cosmetic, documentation, or maintenance).
- **Launch impact:** Blocks live launch, Blocks hosted beta, Before pilot, or None.
- **Owner:** a named role, or Unassigned.
- **Status:** Open, Fixed (pending verification), Closed, Accepted risk (a dated owner decision, recorded in the finding or in `roadmap.md`), or Invalidated.

### Closure rule

A finding is Closed only with verification evidence: a test, check, or rehearsal that someone other than the author ran or reviewed, linked in the Closure evidence column. Merging a fix moves a finding to **Fixed (pending verification)**; it does not close it. A pull request that introduces, fixes, or invalidates a finding updates this register in the same pull request ([CONTRIBUTING.md](CONTRIBUTING.md)).

## Observed defects

Defects seen in the code, tooling, or documents at the reviewed commit.

| ID | Finding | Evidence | Severity | Launch impact | Owner | Issue or PR | Status | Closure evidence |
|---|---|---|---|---|---|---|---|---|
| AUD-001 | Two simultaneous Pay requests for one order send Stripe the same idempotency key; the second can fail and the rider must press Pay again | Pre-fix #84 assumptions and retry-parameter drift; real SDK with fake HTTP transport now tests concurrent recovery, bounded conflicts and unchanged later-retry parameters | Medium | Blocks live launch (labeled `release-blocker`) | Unassigned | [#84](https://github.com/kchan1028/event-registration/issues/84) | Fixed (pending verification) | [#132](https://github.com/kchan1028/event-registration/pull/132): author and Claude Code passed SDK-concurrency, bounded conflict and later-retry checks on `efcde53`; follow-up verification is recorded in #132; real-provider operational proof remains pending (GAP-003) |
| AUD-002 | Runtime and development dependencies had published advisories: `@fastify/static` (high) with transitive `glob` and `minimatch` (moderate), `zod` (high), and `vitest` with `tinypool` and `@vitest/mocker` (critical, development and CI only). All but `zod` were upgraded on November 16, 2026; `zod` remains | `npm audit` on the reviewed commit: 7 advisories (2 critical, 2 high, 3 moderate). After the upgrade pull request: 1 (`zod`, high). Public advisories; no project-specific detail | High | Blocks hosted beta | Project owner | [roadmap.md Next actions](roadmap.md#next-actions), item 8; upgrade pull request (this change) for the first four packages | Open (`zod` upgrade outstanding; the other packages Fixed, pending verification) | |
| AUD-003 | The signed-in rider registration header overflows at phone width | Issue #117 (390 px viewport, `src/web/Register.tsx`) | Low | Before pilot | Unassigned | [#117](https://github.com/kchan1028/event-registration/issues/117) | Closed | [#134](https://github.com/kchan1028/event-registration/pull/134): author and Claude Code passed scoped Chromium checks on `ca7d066` (typecheck and nine browser checks); full physical-device/accessibility gates remain open |
| AUD-004 | `DATA_MODEL.md` still says role-change audit history does not exist | Issue #105 | Low | None | Unassigned | [#105](https://github.com/kchan1028/event-registration/issues/105) | Fixed (pending verification) | Needs: the other agent confirms the corrected text on `main` after the sync pull request merges |
| AUD-005 | Bib replacement drafts and the reassignment region are hard to tell apart in the bib batch panel | Issue #98 (`src/web/BibBatchPanel.tsx`) | Low | None | Unassigned | [#98](https://github.com/kchan1028/event-registration/issues/98) | Open | |
| AUD-006 | README says Stripe integration is not built, but Stripe hosted Checkout and refunds exist in test mode | Historical README claim versus `src/server/payments.ts` and roadmap; README now distinguishes local test mode from unverified live operation | Low | None | Unassigned | [#129](https://github.com/kchan1028/event-registration/pull/129) | Closed | Claude Code reviewed `1e16d69` and final record `cdf1e57`; merged #129 at `75b86ae` |
| AUD-007 | A source comment says MFA ships in Phase 3; the roadmap moved organizer MFA to the final pre-launch security gate | `src/server/listen.ts` comment versus [roadmap.md](roadmap.md#final-pre-launch-security-gate-planned) | Low | None | Unassigned | Sync pull request (this change) | Fixed (pending verification) | Needs: the other agent confirms the corrected text on `main` after the sync pull request merges |
| AUD-008 | Agent instructions are untracked (`AGENTS.md` is gitignored), so Claude Code and Codex can work from different, unreviewed rules | `.gitignore`; shared rules live in the tracked guides ([CONTRIBUTING.md](CONTRIBUTING.md), [coding guide](docs/coding-guide.md), [test plan](docs/testing/test-plan.md)) | Low | None | Project owner | Tracked briefly in #119, untracked again by owner decision | Accepted risk (owner decision, November 16, 2026: agent instructions stay local) | Not applicable |
| AUD-009 | Details-form error summary can regain focus while the rider types a correction | Pre-fix `Register.tsx` ErrorSummary dependency and fresh DetailsStep array; historical CRO-variant expert walkthrough, not a main runtime test; blocks keyboard completion of required rider data under existing accessibility requirements | Medium | Blocks live launch (release-blocker) | Unassigned | [#127](https://github.com/kchan1028/event-registration/issues/127) | Closed | [#130](https://github.com/kchan1028/event-registration/pull/130); author and Claude Code keyboard regression passed on `b5f9c35`; Claude Code guard regression passed on `df69c3d`; unchanged reviewed tree merged at `586eb95`, with CI passing |
| AUD-010 | Reservation retry rotates request identity after an unknown response, risking another hold | Pre-fix `Register.tsx` Waiver catch; code-inspected risk, no duplicate real charge demonstrated | High | Blocks live launch (release-blocker) | Unassigned | [#128](https://github.com/kchan1028/event-registration/issues/128) | Closed | [#130](https://github.com/kchan1028/event-registration/pull/130); author and Claude Code recovery regressions passed on `b5f9c35`; Claude Code guard regression passed on `df69c3d`; unchanged reviewed tree merged at `586eb95`, with CI passing |
| AUD-011 | Printed-roster instructions assume paper issuance/clearance while the accepted contingency process remains Proposed | Source-only review of `src/web/Roster.tsx` against [operations](docs/operations.md#handling-an-incident); no fresh runtime or paper processing test | Medium | Blocks live launch (release-blocker) | Unassigned | [#142](https://github.com/kchan1028/event-registration/issues/142) | Closed | [#143](https://github.com/kchan1028/event-registration/pull/143): Claude Code independently checked typecheck, three targeted browser scenarios and rendered print/phone screenshots at `da175dc0a5b9a8d931a502e44427ef7158c53539`; first-round five roster tests also passed. Closure covers wording only; approved paper process and physical/staff rehearsal remain open |
| AUD-012 | Repeating original refund creation after a lost response can create another partial refund despite provider retry identity | Source-inspected pre-fix request creation; new simulated/stubbed replay/concurrency cases verify stable request behavior. No real duplicate refund is claimed | High | Blocks live launch | Implementation owner | [PR #164](https://github.com/kchan1028/event-registration/pull/164) | Closed | Independent verifier passed typecheck/docs, 59 targeted API and two browser cases at 80ddcdd. Closure covers local creation/recovery only; real settlement/reconciliation remains open |
| AUD-013 | Organizer finance content overflows at 390px for header actions or an allowed long unbroken refund reason | Local browser checks measured 667px for header actions and 2316px for a long unbroken reason before wrapping fixes | Medium | Before pilot | Implementation owner | [PR #164](https://github.com/kchan1028/event-registration/pull/164) | Closed | Independent verifier checked recovery/history screenshots and width assertions at 360/390/1440 in both themes at 80ddcdd. Header actions and long reasons wrap; physical-phone acceptance remains open |

## Documented readiness gaps

Work the documents say is not done yet. These are not defects; each is tracked in `roadmap.md`, which owns its priority.

| ID | Gap | Evidence | Severity | Launch impact | Owner | Tracking | Status | Closure evidence |
|---|---|---|---|---|---|---|---|---|
| GAP-001 | Organizer MFA and sensitive-action re-verification are not built | [Final pre-launch security gate](roadmap.md#final-pre-launch-security-gate-planned); no MFA code in `src/` | High | Blocks live launch | Project owner | roadmap.md | Open | |
| GAP-002 | Sign-in has not been checked against a real Clerk development instance | [Berkeley weekend review priorities](roadmap.md#berkeley-weekend-review-priorities), identity lifecycle row | Medium | Blocks hosted beta | Project owner | roadmap.md | Open | |
| GAP-003 | Merchant and settlement model not accepted (ADR 0005 Proposed); no reconciliation check against a real Stripe sandbox account | [ADR 0005](docs/decisions/0005-merchant-and-settlement-model.md); [roadmap.md Delivery status](roadmap.md#delivery-status) | High | Blocks live launch | Project owner | roadmap.md | Open | |
| GAP-004 | USA Cycling electronic waiver, guardian, and license path not accepted | [Berkeley weekend review priorities](roadmap.md#berkeley-weekend-review-priorities), Phase 0 decisions row; [USAC questions](docs/usac-questions.md) | High | Blocks live launch | Project owner | roadmap.md | Open | |
| GAP-005 | Retention and deletion rules for riders, minors, waivers, exports, and audit history not approved | [Berkeley weekend review priorities](roadmap.md#berkeley-weekend-review-priorities), before real rider data row | High | Blocks live launch | Unassigned | roadmap.md | Open | |
| GAP-006 | Hosted backup restore, monitoring, and support ownership not demonstrated; local logical restore procedure provides partial rehearsal evidence only | [Test plan section 4](docs/testing/test-plan.md#4-predeployment-testing); [operations.md](docs/operations.md) | High | Blocks hosted beta | Unassigned | roadmap.md | Open | |
| GAP-007 | Email delivery, bounce, and complaint events are not recorded | `src/server/email.ts` records send outcome only; [roadmap.md Phase 2](roadmap.md#phase-2--build-the-registration-core), email delivery tracking | Medium | Before pilot | Unassigned | roadmap.md | Open | |
| GAP-008 | Event, race, and day cancellation workflow not built; refunds are not yet worked out from the organizer's rules | [Berkeley weekend review priorities](roadmap.md#berkeley-weekend-review-priorities), cancellation integrity row | High | Blocks live launch | Unassigned | roadmap.md | Open | |
| GAP-009 | Timer export format not agreed with a timer or round-trip tested | [roadmap.md Delivery status](roadmap.md#delivery-status), start lists row | Medium | Before pilot | Unassigned | roadmap.md | Open | |
| GAP-010 | Manual accessibility passes (keyboard only, screen reader, real phone) not done | [ACCESSIBILITY.md](ACCESSIBILITY.md) status | Medium | Before pilot | Unassigned | roadmap.md | Open | |
| GAP-011 | Expected event size, opening peak, and race-morning concurrency not established or load tested | [Berkeley weekend review priorities](roadmap.md#berkeley-weekend-review-priorities), before Phase 3 exit row | Medium | Before pilot | Unassigned | roadmap.md | Open | |

## Not assessed

These areas were not examined in the original audit; the supplemental research above records its narrower additional coverage. No conclusion, positive or negative, should be drawn about them: capacity, eligibility, pricing, and refund correctness; start list and timer export behavior; application security; privacy and data handling; manual accessibility; performance; and operations. See [Coverage](#coverage). A later audit adds findings here, with its own scope, date, and reviewed commit.

## Later work

The phone handoff and check-in guides exist for local fictional-data rehearsals. Accepted recovery procedures, demonstrated operations and the data-retention document remain open; GAP-005 and GAP-006 are not closed by writing instructions.
