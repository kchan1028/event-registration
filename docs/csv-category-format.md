# Category CSV format

Use this format to load a category schedule from a spreadsheet, or to export one for review. In the organizer workspace, open **Import and export** for an event, download the template or export the current schedule, and upload a CSV.

How an import works:

1. **Races must already exist.** Each row names its race, and rows are matched to the event's races by name (case and punctuation do not matter). Add races in **Event setup** first.
2. **Columns are matched by name.** Headers can be the column keys below or their labels. You can change any match on screen before importing.
3. **Every row is checked first.** Problems are listed per row, by line number. Rows with problems are never imported; you can import the good rows and skip the rest only after confirming that choice.
4. **An import only adds to the draft.** It never publishes, never changes existing categories, and refuses a timing code that already exists in the race. The draft still has to pass the usual checks and be published by a person.
5. **Nothing is guessed from a name.** A category called "Cat 4/5" with an empty `license_categories` column is open to every license category; the import warns about it. List allowed categories explicitly.

Start groups and display groups are matched by name within the event, or created. Rows that share a start group must give it the same start time, staging time, and field limit.

## Columns

| Key | Required | Meaning and format | Example |
|---|---|---|---|
| `race` | Yes | Name of an existing race in the event | `Saturday road race` |
| `category` | Yes | Registration category name riders see | `Masters 35+ Cat 3/4` |
| `timing_code` | Yes | Short code, unique within the race | `RR-M35-34` |
| `display_group` | No | Heading on the schedule. Only arranges the list; never a limit | `Masters` |
| `start_group` | Yes | Categories with the same start group start together | `Masters 50+ and 60+` |
| `start_time` | Yes | 24-hour `HH:MM` | `09:30` |
| `staging_time` | No | 24-hour `HH:MM` | `09:15` |
| `field_limit` | No | Whole number shared by the whole start group | `80` |
| `license_categories` | No | Explicit list separated by `;` from `PRO`, `1`, `2`, `3`, `4`, `5`. Blank means any | `3;4` |
| `license_types` | No | `annual`, `one_day`, or both separated by `;`. Blank means both | `annual` |
| `min_age` | No | Minimum racing age, whole number | `35` |
| `max_age` | No | Maximum racing age, whole number | `59` |
| `competition_class` | No | `any`, `women`, or `men`. Blank means any | `women` |
| `collegiate_divisions` | No | `A;B;C;D` or `any`. Blank means collegiate eligibility is not required | `A` |
| `guardian_required` | No | `yes` or `no` | `yes` |
| `organizer_review` | No | `yes` or `no`: the organizer reviews every entry | `no` |
| `length_type` | Yes | `distance`, `duration`, or `laps` | `duration` |
| `distance` | For distance | Number greater than 0 | `62.5` |
| `distance_unit` | No | `km` or `mi` (default `km`) | `km` |
| `laps` | For laps | Whole number; optional for distance races | `5` |
| `minutes` | For duration | Whole number | `45` |
| `plus_laps` | No | Laps after the time runs out, for timed races | `3` |
| `price` | Yes | Dollars, `0` for free | `45` or `45.00` |
| `day_of_surcharge` | No | Dollars added on race day | `15` |
| `cap` | No | Category cap, whole number; blank means no cap of its own | `60` |
| `opens_at` | No | `YYYY-MM-DD HH:MM` in the event's time zone | `2027-02-01 09:00` |
| `closes_at` | No | `YYYY-MM-DD HH:MM` in the event's time zone | `2027-04-22 20:00` |
| `classification_code` | No | Timer classification code; defaults to the timing code | `RR-M35-34` |
| `description` | No | Plain text for riders | `Racing age 35+ AND Cat 3 or 4.` |
| `prize` | No | Prize or purse text, shown as written | `$500 across 10 places` |

## What the format does not carry

These stay in the app and are not imported or exported: more than one eligibility path per category (the export includes the first and notes the rest in the description), shared capacity pools, scheduled price changes, dual scoring, bundles and discounts, fees, waiver text, and test entries.

Importing a file exported from another registration platform does not give access to that platform, and its labels are not treated as rules: map its columns to the ones above and list eligibility explicitly.
