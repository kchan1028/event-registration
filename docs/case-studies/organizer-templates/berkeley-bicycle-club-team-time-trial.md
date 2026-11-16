# Berkeley Bicycle Club Team Time Trial

Status: Historical research case and published read-only research example. Reviewed November 15, 2026. A working team-time-trial registration demo is not implemented.

## Sources and edition separation

The [2008 BikeReg event archive](https://www.bikereg.com/results/s/17038/berkeley-bicycle-club-team-time-trial) identifies March 9, 2008 in Orinda. Only event identity/date/place are used; no rider, result, team, license, or timing records are copied.

A separate [2011 Team Mike's Bikes event description](https://www.teammikesbikes.com/blog-2020/support-our-africa-riders-bbc-team-time-trial) describes two-person entries, equipment-specific classes, and the event's earlier Pinole identity. This is evidence from a later edition, not a rulebook for 2008. Its general explanation of timing larger teams is not adopted as this two-person event's finish rule. The old 2011 flyer link is not treated as reviewed current rules.

The [BBC club history](https://berkeleybikeclub.org/about) independently names Pinole TTT among the club's historical races. See the separate [Pinole case](pinole-team-time-trial.md). The two research records describe related historical versions, not two verified upcoming events or separate competitions that should be sold together.

## Why the executable record is a draft

The current schema supports road races and criteriums only. An individual order/entry and a string team name do not implement a two-rider team entry, per-member consent, team capacity, timed team starts, or roster changes. This case does not substitute a road-race discipline to make checkout appear supported.

The [research fixture](../../../src/shared/teamTimeTrialResearch.ts) creates a labeled organizer draft with the archived 2008 date, no race, categories, starts, or classification records, and a read-only published snapshot. It has no team price, invented capacity, race duration, waiver signature, or seeded participants. The explicit `researchOnly` flag permits empty demo publication; orders are rejected server-side, and the public view has no registration form. Removing that flag restores normal missing-race/category publication errors. No schema migration or new discipline is added.

## Proposed organizer setup exercise

1. Run `npm run seed:bbc-ttt -- --owner organizer@example.test` against the app's database. Sign in with that email and open the draft from the public event chooser. It appears in the event chooser as a read-only research example with registration unavailable.
2. Confirm the historical date and inspect the notice. Keep the later format description separate from the selected 2008 identity until an edition-specific guide is approved.
3. On paper, define the team entry separately from its two riders: captain authority, invitations/acceptance, eligibility per member, member waivers/guardian consent, pricing unit, and what happens when a rider withdraws or is replaced.
4. Define start slots and capacity explicitly in teams versus riders. Two rider entries in one mass-start group are not equivalent to a team starting at an assigned interval.
5. Obtain the event's actual team timing and equipment-class rules. Do not infer them from a generic five-rider example or the word “team.” Scoring/results remain outside current product scope.
6. Rerun the seed after a draft edit. It must preserve IDs, edits, published read-only state, and other local events. Do not publish a fabricated road race as a workaround.

## Verification and limits

`tests/team-time-trial-research.test.ts` checks schema validity, empty unsupported-format structure, read-only publication, blocked order creation, research labeling in the rider catalog, organizer ownership, and preservation of edits on rerun. Existing published-demo regression tests protect the shared loader's other callers. This is draft/API verification, not team registration, a browser walkthrough, or participant usability evidence.

## Open questions

Raised November 15, 2026. Owner: product owner, with organizer/federation approval before actual event reuse. Which edition-specific guide defines team size/composition, category derivation, mixed-age/class eligibility, equipment, fee unit, team versus rider capacity, replacement/withdrawal, start intervals, and the timing rider/finish rule? Is this to be modeled as a continuation of the Pinole lineage? Team-entry and TT representation need an accepted implementation design and roadmap priority after the initial road/crit pilot. The 2008 identity is documented, while later rules remain unapproved for it. Research/draft editing may proceed; team checkout, scheduling, live entry, and an approved template remain blocked. Revisit when an authoritative flyer is provided or TT implementation is prioritized.
