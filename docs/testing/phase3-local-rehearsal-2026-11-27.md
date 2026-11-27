# Local Phase 3 rehearsals, November 27, 2026

The scripted local rehearsals passed in one run. Phase 3 stays in progress. This note does not record registration-lead, timer, treasurer, or pilot-organizer acceptance.

Application source: `f0c36cf58d3c418a164cd18b9c72a382dacedb33`. The application code did not change. The rehearsal scripts are in this change.

Environment: local Playwright, `playwright.rehearsal.config.ts`, loopback port 3417, database `cyclereg_phase3_rehearsal_e2e`, test sign-in, desktop Chromium at 1440×900. One worker. The default `npm run test:e2e` config ignores `*.rehearsal.spec.ts`. Result: 4 passed (`organizer-handoff`, `race-day`, `support-freeze`, `walk-up`).

A follow-up run of the race-day script the same day passed after the timer steps were extended. Application source was still `f0c36cf58d3c418a164cd18b9c72a382dacedb33`. Result: 1 passed.

A second follow-up the same day added the bib-operations script. Application source: `b282e6bad7591cd4d16a2d83749a22b5a269cc13`. Result: 1 passed.

## Race-day desk

Passed on the published demo weekend with fictional accounts (organizer, registration manager, two check-in volunteers, timer export):

- Each role used its own signed-in session. The volunteer cannot read the team list.
- The whole-event bib range showed 100–199.
- The fallback roster printed to PDF and stayed labeled reference only.
- Emergency contact for Alex Demo was shown, then hidden.
- Alex Demo checked in at bib 100. Opening that rider again kept bib 100 and offered no second issue.
- Dana Demo stayed blocked until the lead marked both license reviews with no typed note. The volunteer then issued bib 101.
- Desk demo riders are created already marked as walk-ups. A separate paid fictional entry, Quinn Fictional, was marked as a walk-up at the desk and then issued bib 102.
- Blake Demo checked in at bib 103. A checked-in reassignment to 140 was previewed and applied. After a simulated offline lookup, Alex stayed at 100, Gray Demo stayed unreviewed, and Blake showed 140.
- Frankie Demo has no check-in code because the order is unpaid. A name lookup left Frankie not ready while Harper Demo checked in.
- The incoming volunteer, in a new session, saw Alex at bib 100 and could not issue a second bib.
- On the first run, the timer account locked one start list, downloaded the locked CSV, and received HTTP 403 from check-in.
- On the follow-up run, the timer account downloaded the current CSV and the locked CSV for Alex Demo's race. The two files matched, with bib 100. The organizer then changed that checked-in bib to 150. The timer session showed the revision, the current CSV showed bib 150, and a repeat download of the locked CSV was byte-identical. Check-in and the finance ledger returned HTTP 403.

Not rehearsed: physical bib stock, the paper desk contact sheet, a paper waiver, a physical camera, phone, or printer, and real sign-in delivery. Typed lookup was used. Camera emulation was not required for that path.

## Bib ranges, repeated check-in and bulk allocation

Passed on the published demo weekend with a registration manager and a check-in volunteer, each in their own session ([race-day check-in guide](../runbooks/race-day-check-in.md)):

- With no bib range, the volunteer's issue was refused and nothing was recorded for the rider.
- The lead saved a range of 100–100 in **Bib ranges**. The volunteer retried and issued bib 100.
- The next rider was refused because every bib from 100 to 100 was in use, and nothing was recorded. The lead extended the range to 100–199, and the retry issued bib 101.
- A third check-in was saved, but the response was dropped. The desk showed "Check-in could not be confirmed." and offered no issue button. A fresh lookup by check-in code showed bib 102 and no second issue.
- Returning to each of the three riders showed the same bib, each with one history entry, and no two riders shared a bib.
- The volunteer saw no **Assign bibs** control and the bulk preview API returned HTTP 403. The lead previewed and applied bib 103 to a paid rider who was not ready. That rider stayed not ready and not checked in, and the desk offered no issue.

Not rehearsed: physical bib stock and recovering a handed-out bib. A refused overlapping batch and protected manual assignments stay with the local API tests.

## Walk-up registration and test kiosk

Passed on a published fictional criterium: a phone-sized rider session completed simulated checkout, staff marked that entry as a walk-up and issued bib 100, and a separate kiosk session signed in and ended back at the kiosk sign-in.

Not rehearsed: a suggestion QR on a second physical phone, continuing a draft on that phone, a second full kiosk checkout, five idle minutes, and hosted payment.

## Organizer handoff

Passed with a fictional successor who had already signed in and held a role. Ownership moved once. The published event version and name stayed the same. The outgoing account kept registration-manager access and lost owner access.

Not rehearsed: named-person acceptance, unaided operation, Clerk delivery, bank or settlement duties, and timer import of the CSV.

## Support coverage and freeze windows

Passed on the published fictional criterium. The registration manager released an unpaid hold the rider asked for. A later paid order kept a name correction with a reason and an audit line. That correction used the session clock on November 27, 2026, outside both freeze windows below. A separate incoming session saw that registration.

Recorded from the Harbor criterium case study: America/Los_Angeles, category registration opens 2027-01-01T09:00, first start 2027-04-17T09:00. The pre-opening freeze starts 48 hours before that opening. The race-week freeze starts 72 hours before that first start. Window end times are not assigned.

Not rehearsed: alert paging, deputy paging, live routing, a delivered alert, a freeze gate that holds a configuration change, and a name correction inside the race-week freeze. Nobody was paged. Local health returned HTTP 200 during the run. HTTP 503 recovery is covered by `tests/health.test.ts` (6 passed on a disposable database the same day) and is not a hosted monitoring check.

## Local logical restore

Two runs of the isolated restore procedure passed on the same application commit and were cleaned up. `pg_dump`, `pg_restore`, and `server_version` were PostgreSQL 17.12. This was a shell procedure, not a Playwright rehearsal.

| Run | Dump bytes | sha256 |
|---|---:|---|
| 20261127131905 | 164258 | `98c2f0ed5e83e4d89217a46b75b1a7bbee45ec082914730d199ead633fd9e9dd` |
| 20261127131911 | 164207 | `ea7249c8edda9a1f23e457eab2917f199b0195d3b730523df12c4274931f8537` |

Both runs matched restored table hashes, counts, columns, constraints, indexes, and sequences. Ownership handoff, retained roles, and actor-attributed history passed. Health, paid-but-blocked readiness, an existing bib and check-in, repeat safety, and a locked start list passed. Restored audit rows and a new attributed ledger row passed. A populated source was refused. A conflicting restore stopped on `relation "orders" already exists` and left the rejection marker. Databases created for these runs were dropped. Dump files were deleted.

Hosted backup and restore, the five-minute recovery gap, and the 60-minute and 30-minute reopening targets were not scored.

## Still open

Named-person acceptance, hosted recovery, physical device checks, live alert delivery, the freeze gate, organizer MFA, live payments, USA Cycling, and the retention deletion procedure stay open. Phase 3 has not passed its exit gate.
