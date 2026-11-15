# Phase 0 discovery kit

Status: Implemented (kit written November 14, 2026). One interview done: [D01](interviews/D01.md), November 14, 2026, the promoter answering as race director, registration lead, treasurer, and rider. No observations or measurements have been done. Results become evidence for the [Phase 0 exit gate](../../roadmap.md#phase-0--establish-the-case-to-build) only after they are summarized in [decision-memo.md](decision-memo.md) and linked from `roadmap.md`.

Use this kit to decide whether CycleReg should be built at all. Phase 0 ends in one of two outcomes: a recorded decision to continue, with evidence, or a recommendation to improve the current registration workflow and stop the build. Both are successful outcomes.

The app already built does not count as Phase 0 evidence. It was built ahead of this gate at the owner's request.

## What is in the kit

| File | Use it for | Roadmap deliverable |
|---|---|---|
| [interview-guides.md](interview-guides.md) | Questions for the race director, registration lead, treasurer, timer, and riders or parents | Observe and interview |
| [workflow-map.md](workflow-map.md) | Mapping how the current event is set up and run, step by step, with the tools and people involved | Map the setup, shared fields, discounts, changes, exceptions, check-in, and exports |
| [workload-baseline.md](workload-baseline.md) | Measuring organizer hours, check-in times, errors, and support requests | Measure the baseline |
| [options-comparison.md](options-comparison.md) | Comparing improving the current setup, buying more support, and building | Compare the three options |
| [external-requirements.md](external-requirements.md) | Owners and status for the USA Cycling (USAC), payment-provider, and road-results.com questions, with links to the question packets | Contact USAC; assess payment models; research results uploads |
| [pilot-selection.md](pilot-selection.md) | Choosing a smaller pilot event, its accountable organizer, and a support owner | Identify a pilot |
| [interviews/](interviews/D01.md) | Anonymized interview summaries, one file per participant code | Observe and interview |
| [decision-memo.md](decision-memo.md) | The exit-gate decision: continue or stop, with the evidence for each gate condition | Exit gate |

## Who does what

Phase 0 is people work. Nothing in this kit can be finished by writing code.

| Role | Responsibility |
|---|---|
| Product owner | Runs Phase 0, signs the decision memo |
| Registration lead | Supplies current setup, exception list, and check-in data; joins the observation |
| Discovery interviewer | Runs interviews and fills in the guides (can be the product owner) |
| USAC contact owner | Sends the federation questions and records answers |
| Payments owner | Talks to payment providers and the club treasurer |

Record names in [decision-memo.md](decision-memo.md#team-and-owners), not here, so the kit stays reusable for another club.

## Suggested order (2 to 3 weeks)

1. **Week 1.** Assign the product owner and registration lead. Ask the registration lead for anonymized copies of the current category setup, a timer export, an exception list, and a reconciliation example. Send the USAC questions and the timer export review packet, because their answers take longest.
2. **Week 1 to 2.** Run the race director, registration lead, treasurer, and timer interviews. Fill in the workflow map as you go.
3. **Week 2.** Interview at least five riders or parents. If an event happens in the window, observe check-in and time it with the baseline sheet.
4. **Week 2 to 3.** Finish the baseline, score the options comparison, shortlist pilot events, and write the decision memo.

## Protect people and their data

Discovery touches real people and real registration records, so the rules are stricter than for the usability test.

- Get verbal consent before each interview with the script at the top of [interview-guides.md](interview-guides.md#consent-script). Recording is optional and needs a separate yes.
- Refer to participants by code only (D01, D02, and so on). Keep the code-to-name list, recordings, and raw notes in the product owner's private storage, never in this repository.
- Anything copied from the current system (category setup, exports, exception lists, reconciliation) must have rider names, emails, birth dates, license numbers, emergency contacts, and payment details removed or replaced before it is shared. Real rider data is never committed to this repository.
- Only anonymized summaries go into the repository.
- Do not record a competitor's fees or capabilities as fact unless you note the date and source.

## What counts as done

Each roadmap deliverable is Verified when its file has real, anonymized answers and the summary in [decision-memo.md](decision-memo.md) links to it. Phase 0 is Verified when the product owner signs the decision memo, whichever way it decides.
