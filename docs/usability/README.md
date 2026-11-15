# Phase 1 usability test kit

Status: Implemented (kit written November 14, 2026). No sessions have been run. Results become evidence for the [Phase 1 exit gate](../../roadmap.md#phase-1--test-the-experience-without-live-money) only after they are summarized and linked from `roadmap.md`.

Use this kit to find out whether organizers, check-in volunteers, and riders or parents can complete the core prototype tasks on their own. The Phase 1 exit gate needs at least 90% unassisted completion across the core tasks and no unresolved critical blocker.

| File | Use it for |
|---|---|
| [facilitator-script.md](facilitator-script.md) | What to say before, during, and after each session, and what counts as a rescue |
| [tasks.md](tasks.md) | The tasks for each role, the starting state, what success looks like, and what to watch for |
| [pilot-run-2026-11-14.md](pilot-run-2026-11-14.md) | A dry run of every task by the developer tools, before real sessions. Not gate evidence |
| [observation-sheet.md](observation-sheet.md) | One printed sheet per session, plus the results summary that feeds the exit gate |

## Who to recruit

The roadmap asks for at least two organizers, two check-in volunteers, and five riders or parents. Participants may overlap with Phase 0 discovery interviews.

| Role | Count | Good candidates | Session length |
|---|---|---|---|
| Organizer | 2 or more | A race director and a registration lead who have set up a road race or criterium | 60 minutes |
| Check-in volunteer | 2 or more | People who have staffed a registration tent; at least one who has never used this prototype | 30 minutes |
| Rider or parent | 5 or more | At least one beginner (Cat 5 or one-day license), one masters racer, one parent of a junior, one rider who races both days | 30 minutes |

Include at least one participant who prefers a keyboard or uses a screen reader, magnification, or large text if you can. The [accessibility rules](../coding-guide.md#accessibility-and-mobile-usability) apply to every screen in the test.

## Protect participants and their data

Nobody enters real personal information. Every task uses the fictional demo riders, events, and fees, or made-up details the participant invents on the spot.

- Get verbal consent with the script in [facilitator-script.md](facilitator-script.md#before-the-session). Recording the screen is optional and needs a separate yes. Do not record faces or voices unless the participant agrees.
- Refer to participants by code only (P01, P02, and so on). Keep the code-to-name list, recordings, and filled-in sheets in the organizer's private storage, never in this repository.
- Only the anonymized results summary and findings go into the repository, linked from `roadmap.md`.
- Delete recordings when the findings are written up, unless the participant agreed to longer storage.

## Set up the computer before each session

The prototype runs only on the facilitator's computer and listens only on `127.0.0.1`. Follow [local-setup.md](../runbooks/local-setup.md) once, then give every session its own database file so each participant starts clean and their session stays available for review.

1. Start the app with a fresh database named for the session:

   ```bash
   DB_PATH=data/usability-P01.sqlite npm run dev
   ```

   Expected result: the API logs `Server listening at http://127.0.0.1:3001` and Vite prints `Local: http://127.0.0.1:5273/`. A new database file starts empty.

2. Open `http://127.0.0.1:5273/` and prepare the starting state for the role, as listed under each role in [tasks.md](tasks.md).
3. Set the display theme the participant will use (the sun or moon button in the header). Run at least one volunteer session in the dark theme and at least one in bright daylight, because [product.md](../../product.md#display-themes) requires the check-in result to read in sunlight.
4. Close other tabs and notifications. Keep the observation sheet and a timer ready.

To look at a past session again, start the app with that session's `DB_PATH`.

### Phone-sized sessions

A real phone cannot reach the prototype, because it must not be exposed to a network (see the [local setup warning](../runbooks/local-setup.md)). For rider sessions that need a phone-sized screen, narrow the laptop browser window to about 375 pixels wide or use the browser's device toolbar, and note this on the observation sheet. Testing on a real phone needs a decision from the technical lead about a safe way to reach the prototype; that question is open.

## Score the sessions

Score each core task with one outcome code. The definitions of a prompt and a rescue are in [facilitator-script.md](facilitator-script.md#prompts-and-rescues).

| Code | Meaning | Counts as unassisted? |
|---|---|---|
| S | Completed correctly with no help | Yes |
| SP | Completed correctly after neutral prompts only | Yes |
| A | Completed only after a rescue | No |
| F | Gave up, ran out of time, or finished with a wrong result (wrong race, wrong total understood, bib issued to a blocked rider) | No |

**Unassisted completion rate** = (number of S and SP outcomes) ÷ (number of core tasks attempted), across every participant and role. With the minimum panel (5 riders × 4 core tasks, 2 organizers × 6, 2 volunteers × 4 = 40 tasks), the gate needs at least 36 unassisted completions.

**A critical blocker** is a problem that either:

- caused an A or F outcome for two or more participants on the same step, or
- produced, even once, an outcome that would hurt a real event: a rider who believes they are cleared to race while blocked, a volunteer who issues a bib to a blocked rider, an organizer who creates a capacity limit they did not intend, or a rider charged a total they did not expect.

Every critical blocker must be fixed and re-tested with at least one new participant before the exit gate is marked Verified. Record the fix and the re-test in the results summary.

Also time the standard check-in task (V1). [product.md](../../product.md#success-measures) proposes a median under 30 seconds; the prototype result is an early signal, not the pilot measurement.

## After the sessions

1. Fill in the results summary at the end of [observation-sheet.md](observation-sheet.md#results-summary) from the session sheets.
2. Write each finding as: what happened, how many participants, severity (critical, serious, minor), and the proposed change. Turn serious and critical findings into issues or roadmap items.
3. Link the summary from the Phase 1 row in [roadmap.md](../../roadmap.md#delivery-status). Mark Phase 1 Verified only when the gate is met, the timer has accepted the sample format, and no critical blocker is open.
