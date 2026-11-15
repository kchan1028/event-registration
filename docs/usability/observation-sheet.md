# Observation sheet and results summary

Print one session sheet per participant. Fill it in with participant codes only; keep completed sheets in the organizer's private storage, never in this repository (see [protecting participants](README.md#protect-participants-and-their-data)). Outcome codes and the critical-blocker rule are defined in the [kit README](README.md#score-the-sessions).

## Session sheet

```text
Participant code: P____     Role: rider/parent | organizer | check-in volunteer
Date: ______________        Facilitator: ______   Note-taker: ______
Session database (DB_PATH): data/usability-P____.sqlite
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
Dates: ______________     Prototype commit tested: ____________
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
Remaining for the exit gate: timer accepts the sample format (yes / no), scope fits the team (yes / no)
Signed off by (role): ______________     Date: __________
```
