# Pinole Team Time Trial

Status: Historical research case and published read-only research example. Reviewed November 15, 2026. Exact edition/date and current rules are unresolved. A working team-time-trial registration demo is not implemented.

## Evidence and relationship to BBC TTT

The [Berkeley Bicycle Club history](https://berkeleybikeclub.org/about) names the Pinole Team Time Trial as a historical club race. A [2011 Team Mike's Bikes BBC TTT description](https://www.teammikesbikes.com/blog-2020/support-our-africa-riders-bbc-team-time-trial) traces the event to an earlier Pinole two-person race and describes its original out-and-back route from Pinole Valley High School toward Bear Creek Road. It says the race later moved to the Bears-area course. This supports a historical lineage, not an exact Pinole edition date, current course permission, complete category matrix, or approved rules.

The separate [BBC TTT case](berkeley-bicycle-club-team-time-trial.md) uses a dated 2008 Orinda identity. Do not copy that date or later categories onto Pinole, assume independent simultaneous events, or create a combined purchase without a decision. No historical team, participant, result, timing, license, or contact records are imported.

## Draft representation and date placeholder

The [fixture](../../../src/shared/teamTimeTrialResearch.ts) creates one labeled research draft, with no race, category, starts, roster, or purchasable entry. The current schema cannot represent team time trials and requires at least one dated day. The stored **November 15, 2026** is therefore a research-record placeholder, explicitly labeled **NOT a race date** in both the day label and event notice. It is not a historical date or upcoming announcement. No placeholder start time, route length, price, capacity, or eligibility rule is invented.

Owner decision, November 15, 2026: publish this as an empty read-only research example. The explicit `researchOnly` flag permits publication only for demo records without races, categories, starts, pools, or packages. The catalog labels it research and hides the placeholder date; the detail page and server both make registration unavailable. The placeholder is not a workaround that makes a pre-2000 edition fit: the exact edition is still unknown, and the current rule-set season constraint starts at 2000. Full historical-season representation needs a design decision if a pre-2000 edition is selected.

## Proposed organizer setup exercise

1. Run `npm run seed:pinole-ttt -- --owner organizer@example.test` with the app's local database. Sign in and open the draft in the event chooser; organizer editing still requires sign-in.
2. Read the date warning before discussing course or schedule. Replace no metadata with guesses about a particular season. Confirm the intended historical edition and relationship to BBC TTT first.
3. On paper, represent a team entry and its members separately. Define who may enter/pay for a team, member acceptance and signatures, category assignment, substitutions, withdrawals/refunds, and what happens when a team becomes incomplete.
4. Distinguish capacity in teams from individual rider capacity and mass starts. Specify assigned team start slots only after an approved timing guide is available.
5. Keep historic route evidence separate from current traffic permissions, equipment and finish-timing rules. Do not use a road-race category or a text team name as an implementation of TTT entry.
6. Edit a research note and rerun the seed. IDs, draft edits, published read-only state, and unrelated local events must survive. Research does not enable registration or announce a revived race.

## Verification and limits

Targeted fixture/API tests verify the explicit placeholder date/notice, schema-valid empty research example, explicit publication, blocked registration, public research labeling, organizer visibility, safe reruns, and preservation of other events. Team entry, interval scheduling, timing/results, full historical recreation, browser walkthroughs, and participant usability remain unimplemented or unverified as stated.

## Open questions

Raised November 15, 2026. Owner: product owner, with organizer/federation approval before real reuse. Which Pinole edition is intended, and is the requested record a separate historical study or a renamed predecessor of BBC TTT? An authoritative flyer is needed for date, course, roster/composition/category rules, equipment, fee unit, team/rider capacity, start intervals, replacements/withdrawals, and timing rider/finish rule. A pre-2000 edition would also require an explicit historical-season model decision. The research date placeholder and separate-draft treatment are provisional, not approved event decisions. Historical research and organizer notes can proceed; a dated full recreation, TT/team checkout, working-race publication, live registration, and approved template remain blocked. Revisit when the owner identifies an edition, supplies a flyer, or prioritizes TT/team-entry implementation after the initial road/crit pilot.
