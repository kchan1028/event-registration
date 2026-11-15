# Options comparison

Use this sheet to compare the three options the roadmap names, using evidence from the interviews, workflow map, and baseline. Score it after the baseline is filled in; scoring it earlier only records opinions.

The comparison is honest only if the build option has to win on evidence. If improving the current setup removes most of the measured cost, that is the answer.

## The options

| Option | What it means |
|---|---|
| A. Improve the current setup | Keep the current registration provider. Fix configuration, templates, written procedures, and volunteer training. Use features the club is not using yet. |
| B. Buy more support | Keep the current provider and pay for help: the provider's premium support or services, a paid registration coordinator, or a timing company that handles start lists. |
| C. Build CycleReg | Continue to Phase 1 and beyond on this repository. |

Name the current provider and any alternative providers in the notes, with the date and source of every capability or fee claim. Do not present a competitor's capability as verified without that source.

## Evidence so far (not scored)

Recorded 2026-11-14 from [D01](interviews/D01.md) only. Scoring waits for measured baseline numbers and interviews with people outside the project.

- D01 described rider registration on BikeReg as "simple and easy", with a clear total price and quick check-in. No race-weekend problem was traced back to registration.
- The largest estimated cost is reconciliation (about 8 hours). Whether a software limit causes it, or reporting and analytics work that any tool would need, is not yet known.
- Bib assignment across multiple fields is slow. Whether the current tool can do it faster with different setup is not yet known.
- The start-list export cost mostly disappears with a saved template, which points to option A for that step.
- D01 would not switch to anything that hurts the event's search visibility. This is a condition every option must meet.

## Criteria

Score each option 1 (poor) to 5 (strong) per criterion, with a one-line reason that cites evidence (interview code, baseline row, or dated source).

| Criterion | Weight | Why it matters |
|---|---|---|
| Removes the measured top costs | 3 | The whole case rests on saving volunteer time |
| Handles road race and criterium configuration without workarounds | 2 | Shared fields, bundles, structured eligibility |
| Reduces race-morning exceptions | 2 | The highest-pressure work |
| Time until it helps | 2 | Option C takes months before a pilot |
| Cost to the club (setup and per season) | 2 | Include volunteer development time as a cost for C |
| Federation and payment risk | 2 | C needs USAC acceptance and a payment model; A and B already have them |
| Successor handoff | 1 | Can someone else run it next year? |
| Who supports it on race morning | 1 | C needs a named support owner |

## Scores

| Criterion | Weight | A score | A reason | B score | B reason | C score | C reason |
|---|---|---|---|---|---|---|---|
| Removes the measured top costs | 3 | | | | | | |
| Configuration without workarounds | 2 | | | | | | |
| Reduces race-morning exceptions | 2 | | | | | | |
| Time until it helps | 2 | | | | | | |
| Cost to the club | 2 | | | | | | |
| Federation and payment risk | 2 | | | | | | |
| Successor handoff | 1 | | | | | | |
| Race-morning support | 1 | | | | | | |
| **Weighted total** (out of 75) | | | | | | | |

## Reading the result

- Proposed rule (the product owner may change it before scoring): if A or B scores within 10 points of C, recommend A or B. A small lead does not justify building and supporting a new platform.
- C must lead on "Removes the measured top costs". If it does not, it has no credible advantage.
- Record the recommendation and the main reason in [decision-memo.md](decision-memo.md#build-versus-improve).
