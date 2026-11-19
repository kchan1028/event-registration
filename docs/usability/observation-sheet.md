# Observation sheet and results summary

Print one session sheet per participant. Fill it in with participant codes only; keep completed sheets in the organizer's private storage, never in this repository (see [protecting participants](README.md#protect-participants-and-their-data)). Outcome codes and the critical-blocker rule are defined in the [kit README](README.md#score-the-sessions).

## Session sheet

```text
Participant code: P____     Role: rider/parent | organizer | check-in volunteer
Date: ______________        Facilitator: ______   Note-taker: ______
Session database (DATABASE_URL name): cyclereg_usability_p____
Screen: laptop | phone-sized window (width ____ px)     Theme: light | dark
Light (volunteers): indoors | bright window | outdoors
Assistive technology or settings used: ______________________________

Consent:  notes  yes / no     screen recording  yes / no     face/voice  yes / no

Organizer sessions only, expected answer for O3 (recorded during setup):
______________________________________________________________________

Warm-up notes:
______________________________________________________________________
______________________________________________________________________
```

Copy one block per task.

```text
Task: ____   Core / optional
Outcome:  S   SP   A   F          Time: ____ min ____ s        Ease (1–5): ____
Prompts used (exact words): _________________________________________
Rescue given (exact words, and at which step): ______________________
Hesitations and wrong turns: ________________________________________
_____________________________________________________________________
Words misunderstood or used differently: ____________________________
Believed something untrue? (what): __________________________________
Follow-up answer: ___________________________________________________
Possible critical blocker?  yes / no   Why: _________________________
Quote worth keeping: ________________________________________________
```

```text
Debrief answers
Most confusing part: _________________________________________________
Expected but missing: ________________________________________________
Compared with today (easier / harder / same, why): ___________________
One thing to change: _________________________________________________
Role-specific debrief: _______________________________________________
```

## Results summary

Fill this in once all sessions are done. This summary, with participant codes only, is the document that goes into the repository and is linked from the Phase 1 row in [roadmap.md](../../roadmap.md#delivery-status).

```text
Sessions run: ____ riders/parents, ____ organizers, ____ check-in volunteers
Dates: ______________     Commit tested: ____________
```

### Outcomes by task

| Task | Attempts | S | SP | A | F | Unassisted (S+SP) | Median time | Median ease |
|---|---|---|---|---|---|---|---|---|
| R1 Two races, one day | | | | | | | | |
| R2 Weekend bundle | | | | | | | | |
| R3 Parent registering a junior | | | | | | | | |
| R4 License still needs review | | | | | | | | |
| O1 Raise a field limit | | | | | | | | |
| O2 Start two categories together | | | | | | | | |
| O3 Check what a rider can enter | | | | | | | | |
| O4 Publish the schedule | | | | | | | | |
| O5 Record a license review | | | | | | | | |
| O6 Send the start list to the timer | | | | | | | | |
| V1 Check in a ready rider (timed) | | | | | | | | |
| V2 Use a check-in code | | | | | | | | |
| V3 A rider who is not ready | | | | | | | | |
| V4 The same rider comes back | | | | | | | | |
| **All core tasks** | | | | | | | | |

Optional tasks (R5, V5, V6) are reported in the findings but do not count toward the rate.

```text
Unassisted completion rate = (S + SP) / attempts = ____ / ____ = ____ %
Gate: 90% or higher?  yes / no
Median V1 check-in time: ____ s   (proposed pilot target: under 30 s)
```

### Critical blockers

| Blocker | Task and step | Participants affected | Fix | Re-tested with (code) | Result |
|---|---|---|---|---|---|
| | | | | | |

The gate cannot be marked met while any row lacks a passing re-test.

### Findings

| Finding | Tasks | Participants | Severity (critical, serious, minor) | Proposed change | Issue or roadmap link |
|---|---|---|---|---|---|
| | | | | | |

### Decision

```text
Phase 1 usability part of the exit gate:  met / not met
Remaining for the exit gate: scope fits the team (yes / no)
Signed off by (role): ______________     Date: __________
```

## Berkeley initial-round addendum

Status: Blank template for the Planned initial round; no participant results. Use the existing consent, outcome, prompt/rescue, and critical-blocker fields. Keep named contact lists and completed sheets outside the repository.

```text
Module: Berkeley initial round     Commit/version: _______________
Task/state variant: B___ / standard | full | blocked | ready control
Quote date / time zone: ___________   Expected total: _____________
Prepared capacity and price changes: _____________________________
Outcome S/SP/A/F: ____   Attempted / omitted (reason): ____________
Start: ______  End: ______  Elapsed seconds: ______
Interruption seconds and reason: _________________________________
Wrong categories/edits: ___  Validation errors: ___  Retry errors: ___
Neutral prompts: ___  Rescues: ___  Unresolved errors at end: ___
Details or selections lost? ______________________________________
Keyboard / screen-reader / zoom access failure: ___________________
Unaided teach-back (record exact answer before prompting):
  Included races/dates: ____________ Correct / incorrect / not asked
  Total and fees: __________________ Correct / incorrect / not asked
  Package versus extra-entry saving: _ Correct / incorrect / not asked
  Registration/payment versus clearance: Correct / incorrect / not asked
  Outstanding action and responsible role: _________________________
Known unavailable workflow encountered (not participant error): ___
Missing-waiver card: comprehension only, never UI completion: ______
Hypothesis supported / contradicted / unresolved, with behavior: ___
```

### Initial-round summary template

Do not fill with expert predictions. Use participant codes and aggregate counts after sessions only. Report this separately from the Phase 1 gate table above.

| Task | Role | Attempts / omitted | S | SP | A | F | Wrong actions / errors | Prompts / rescues | Median / range seconds | Correct price teach-back / asked | Correct clearance teach-back / asked |
|---|---|---|---|---|---|---|---|---|---|---|---|
| B1 Setup | Staff | | | | | | | | | | |
| B2 Both days | Rider | | | | | | | | | | |
| B3 Extra category / recovery | Rider | | | | | | | | | | |
| B4 Parent / junior | Rider/parent | | | | | | | | | | |
| B5 Full field | Rider | | | | | | | | | | |
| B6 Blocked check-in | Staff | | | | | | | | | | |
| B6 Ready control | Staff | | | | | | | | | | |

Record panel composition, unique participants, devices/themes, assistive settings, interruptions, and state differences. List the hypothetical missing-waiver answers separately. Report failures and assisted attempts as well as successes; do not calculate successful-task times as if they represent all attempts. Use the critical-blocker table above for every unsafe misunderstanding and its later fix/re-test. The initial round can guide priorities; it cannot itself mark Phase 1 Verified.
