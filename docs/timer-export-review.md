# Timer export review packet

Status: Research packet retained for possible future development. The sample CSV is available today. Format approval and validation in timing software were deferred on November 19, 2026. See [product scope](../product.md#out-of-scope-initially).

If the project owner selects timing interoperability for future development, use this packet and the sample file to gather feedback from the timer and chief official.

## What to send

1. This page, or a PDF of it.
2. [sample-start-list.csv](fixtures/sample-start-list.csv): a start list exported by the app for two fictional events. Every rider, license number, and ID in it is fake.

A short message to go with it:

> We're testing a registration app and want its start-list export to fit how you work before we build further. Attached is a sample file with made-up riders and a one-page list of the columns. Could you look at it and answer the questions at the end, or tell us what format your timing software imports? A copy of a file you have imported before would help most.

## How the export works today

The app exports one CSV per race, per saved snapshot, or for all races of an event in one file. Organizers find it under **Start lists and timer export** in the event builder. Implementation details are in [roadmap.md](../roadmap.md#start-lists-and-timer-export).

- **Who is in it.** Confirmed (paid) entries only. Unpaid holds, cancelled orders or entries, withdrawn entries, and the builder's simulated test entries are left out.
- **Order.** Within a race, rows sort by start time, category code, bib (unassigned last), last name, then first name. An all-races file groups rows in published race order.
- **One row per entry.** A rider entered in two races appears once per race. The rows share a `rider_id` when the entries are on the same order or on linked orders.
- **Match revisions by entry ID.** Use `entry_id` to match the same entry across downloads. Use `rider_id` to group entries for a rider. Linking or unlinking orders can change the rider grouping ID on affected rows, so compare the CSVs directly for that change.
- **Snapshots.** The organizer saves a numbered, timestamped snapshot when sending a list. Later changes (added, removed, or changed riders) are shown against it, so the organizer can tell the timer exactly what changed.
- **File format.** UTF-8 text, comma separated, a header row, Windows line endings (CRLF). Fields containing commas or quotes are quoted. A value that starts with `=`, `+`, `-`, or `@` gets a leading apostrophe so a spreadsheet does not run it as a formula.
- **Not included.** Email, phone, guardian, emergency contact, payment amounts, and order numbers. These stay out unless officials need them and access controls exist.

Cancellation download labels are Implemented locally: filenames and HTTP headers identify current closure and historical snapshots without changing the CSV schema or saved contents. A historical file can still contain entrants in a race cancelled since it was saved. See the [cancellation requirements](../product.md#event-and-race-cancellation) for label meanings. This does not establish timer acceptance or settlement. Printable-roster cancellation notices use the protected day-list projection described in the requirements.

## Columns

| Column | Meaning | Format | Example |
|---|---|---|---|
| `race_date` | Date of the race | `YYYY-MM-DD` | `2027-04-17` |
| `race` | Race name as configured | Text | `Demo Harbor Criterium: pricing and eligibility lab` |
| `start_time` | Start group's start time | 24-hour `HH:MM`, local time | `09:00` |
| `start_group` | Riders who start together | Text | `Men Cat 4/5` |
| `category_code` | Timer classification code for scoring and awards | Text | `DVC-M45` |
| `category` | Registration category name riders see | Text | `Men Cat 4/5` |
| `race_length` | Length as configured; never an invented distance or finish time | Text | `35 min + 2 laps`, `64 km · 4 laps` |
| `bib` | Assigned bib for the applicable day or weekend at export time, or as recorded in a saved snapshot. Includes preassigned numbers. Blank if unassigned. Use `checked_in` to tell whether check-in was recorded for the race day. | Whole number | `101` |
| `last_name`, `first_name` | Rider name | Text | `Demo`, `Alex` |
| `team` | Team or club; may be blank | Text | `Demo Wheelers` |
| `license_number` | License number as the rider entered it (not verified with USA Cycling) | Text | `DEMO-100001` |
| `racing_age` | Racing age the rider gave | Whole number | `29` |
| `competition_class` | Competition class the rider gave | `women`, `men`, `other`, or blank | `men` |
| `license_status` | Whether an organizer reviewed the license | `reviewed` or `needs_review` | `needs_review` |
| `checked_in` | Checked in for that race day | `Y` or `N` | `Y` |
| `entry_id` | Stable ID for this entry | Text | `oe_2ca41be52185` |
| `rider_id` | Rider grouping ID. For linked orders, the earliest order ID is used. A saved snapshot keeps the ID recorded when it was saved. The revision panel does not list a change to this field alone. | Text | `ord_343502c91430` |

## What the sample shows

The sample was generated from the app on November 14, 2026, using the fictional riders in [the fixtures](fixtures/README.md). Bibs come from a weekend range of 101 to 299.

| Rider | Situation shown |
|---|---|
| Alex Demo | Two races on one day: two rows, the same bib and `rider_id` |
| Sam Demo | Paid, license still needs review, not checked in, no bib |
| Casey Demo | A junior (racing age 13), checked in |
| Blake Demo | A two-day weekend: checked in on Saturday, not yet on Sunday |

## Questions for the timer and officials

Record each answer and who gave it. "Not needed" is a useful answer.

| # | Question | Answer | From (role) | Date |
|---|---|---|---|---|
| 1 | Which timing software do you use, and what file does it import? Can you share a file you have imported before (riders can be removed)? | | | |
| 2 | Which of these columns do you need, which can be dropped, and which are missing? | | | |
| 3 | Do you want one file per race, one per day, or one for the whole event? Should a combined file have an `event` column? | | | |
| 4 | Do you need riders with no bib yet, riders whose license needs review, or riders not yet checked in? Should any be marked differently? | | | |
| 5 | Is the license number useful to you, or for the results upload to road-results.com? | | | |
| 6 | Does your software read UTF-8 text with characters such as `·` and accented names, or does it need plain ASCII? | | | |
| 7 | How should late changes reach you: a full new file, only the changes, or a list on paper? Would the snapshot change list help? | | | |
| 8 | Do you need the start lists locked at a set time before each race? | | | |
| 9 | Can the same file feed both your timing software and the road-results.com upload, or do they need different files? | | | |
| 10 | After results are posted, who makes corrections, and does anything need to flow back to registration? | | | |

## What public sources already say

Checked November 15, 2026 from public pages only (no login, no contact). Preliminary: the timer's answers above win over anything here.

| Topic | Finding | Confidence | Source |
|---|---|---|---|
| Who uploads to road-results.com | Anyone with an email-based road-results.com account, normally the promoter or timer. Upload, review the output, click "Save Results", and share the link. | High | [road-results.com upload page](https://www.road-results.com/upload) (read directly) |
| road-results.com file format | CSV with all categories on one sheet. Required: "First Name" and "Last Name", or "Full Name", or "Name". Optional: "Team", "Time", "Place", "License". Column labels on the first row; a row with exactly one filled cell starts a new category. | High | [road-results.com upload page](https://www.road-results.com/upload) |
| Reusing the USA Cycling file | road-results.com says a file just uploaded to USA Cycling can be uploaded as is. | High | [road-results.com upload page](https://www.road-results.com/upload) |
| USA Cycling results upload | CSV only, uploaded by the organizer in the USA Cycling event portal under Results Submission. The attached 2024 template has the columns `Race Date`, `Race discipline`, `Race Category`, `Race Gender`, `Race Class`, `Race Age Group`, `Rider License`, `Rider First Name`, `Rider Last Name`, `Rider Place`. Place codes: DNS 9996, DQ 9997, DNP 9998, DNF 9999. | High | [USA Cycling help: upload results to an event sanction](https://usacyclinghelp.zendesk.com/hc/en-us/articles/42343840919195-How-to-upload-results-to-an-event-sanction) (article updated about October 2025; template read directly) |
| Rider matching | USA Cycling says its results program associates results by name. road-results.com's help points missing results to name spelling. A license number helps but is not required by either. | Medium | USA Cycling help article "Why is my license number not associated to my results" (May 2023, seen in search results); road-results.com racer help thread |
| Automatic import or API | None found for either site. No public statement that road-results.com imports USA Cycling results on its own. | Medium | Search of both sites |
| Corrections | Not found publicly for road-results.com. Riders are directed to email road-results.com about missing results. | Low | road-results.com racer help thread |
| Points | road-results.com upgrade points depend on the category label in the uploaded results. | Medium | road-results.com racer pages (seen in search results) |

What this means for the export: one CSV in USA Cycling's format can feed both uploads. The current sample already has race date, category, license number, and names. A results file would also need discipline, gender, class, and age group, which belong in the category setup, and place, which comes from timing. Whether the timer's software produces this file is still question 9 above.

## After the review

1. Fill in the answers above and note the date in the status line.
2. If the format changes, update the export in `src/shared/startlist.ts`, regenerate the sample, and send it back for a round-trip test: the timer imports the file into their software and confirms riders, bibs, and categories arrive correctly.
3. When the timer accepts the format, record the acceptance in [roadmap.md](../roadmap.md#delivery-status) as evidence for the future interoperability work, and move the answered questions out of the research list in [product.md](../product.md#results-site-updates-research).
