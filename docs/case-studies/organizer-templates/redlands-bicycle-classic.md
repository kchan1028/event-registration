# Redlands Bicycle Classic

Status: Research case; proposed configuration only. Reviewed November 14, 2026. Edition studied: 2026.

## Published evidence

The [official site](https://redlandsclassic.com/) describes an invitational professional stage race. Its [2026 men's technical guide](https://redlandsclassic.com/wp-content/uploads/2026/04/2026_Mens_Tech_Guide_Final3.pdf), printed pages 7 and 12-13, specifies a Men's Pro/1 program with five stages: TT, circuit, road, criterium, and road. It also describes team confirmation and a four-to-eight-rider team composition.

The [licensed-racing page](https://redlandsclassic.com/usac-licensed-racing/) separately advertises public Sunday criteriums and a separate junior stage race. It allows additional criterium entries subject to its published pricing. These are separate participation paths, not proof that every registrant can enter the professional stages.

The guide's extracted PDF metadata misleadingly names an older year; the inspected pages themselves identify the 2026 edition. The public criterium page also embeds an image whose filename references 2025. Treat that image as unresolved for exact 2026 field/time reconstruction.

## Proposed organizer setup

| Step | Configure | Review boundary |
|---|---|---|
| 1 | Separate professional, junior, and standalone-criterium registration programs | A festival header grants no common eligibility or capacity |
| 2 | Create the professional program's ordered stage itinerary | Each stage has its own course, schedule, length, start method, and confirmation requirements |
| 3 | Keep men's and women's program definitions independently editable | Do not infer identical distances, start times, team sizes, or eligibility |
| 4 | Add explicit team/application approval requirements for the professional program | A successful public checkout does not grant an invitation or team approval |
| 5 | Configure the public criterium from an approved category schedule | Allow eligible additional entries without enrolling the rider in the professional competition |
| 6 | Link overall-participation identifiers to the approved program | Results/GC calculation remains with officials/timing systems |

For a paper example, keep an invited professional program and a public amateur criterium as separate registration scopes under one presentation grouping. The current app cannot implement the professional team-registration workflow or all its race formats. A template picker should mark those modules unsupported rather than imply that a generic stage-race package is sufficient.

## Reusable lesson

A festival can contain programs with different entry mechanisms. An event-format preset should describe an itinerary; it must not silently convert public individual registration into team-managed invitational entry. Preserve discipline-specific length and start definitions rather than one “race length” copied across all stages.

## Acceptance exercise

An organizer selects the mixed-format starter, configures five ordered stages, and adds a public criterium separately. A rider entering only that criterium receives no professional entry, team place, or overall classification. Unsupported invitation/team checks and uncertain schedule provenance remain review items. See T08 and T10 in the [case index](README.md#proposed-validation-exercises).

## Open questions

Obtain the final approved men's, women's, junior, and public-criterium matrices, application/acceptance procedure, permitted purchase paths, team roster limits per program, and exact current field caps. Do not generalize the men's guide to another program or season. Tax forms, prize payouts, convoy rules, and results scoring are outside this template exercise.
