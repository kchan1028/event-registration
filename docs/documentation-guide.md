# Documentation guide

This guide explains where each kind of information lives, how to describe the status of work honestly, and how to write documentation a new contributor or successor organizer can act on. Follow it for every document in this repository.

## Document maintenance rule (mandatory)

Every change must review both [product.md](../product.md) and [roadmap.md](../roadmap.md) for impact.

- Update `product.md` when requirements, scope, user flows, business rules, acceptance criteria, or product decisions change.
- Update `roadmap.md` when priorities, dependencies, milestones, blockers, or delivery status change.
- When a change affects neither document, state that explicitly in the change summary instead of making cosmetic edits.
- Keep `README.md` and affected guides consistent with the implementation.
- Mark roadmap work complete only after its acceptance criteria are verified.
- Distinguish planned, implemented, and verified behavior.
- Do not maintain a competing product roadmap elsewhere.
- Whenever a change affects the database schema, entities, relationships, constraints, or data behavior, update [`DATA_MODEL.md`](../DATA_MODEL.md) in the same change. Database changes are not complete until the documentation reflects them.

The change summary format is in [CONTRIBUTING.md](../CONTRIBUTING.md#change-summary).

## Where things live

Each fact has one home. Other documents link to it instead of copying it, so they cannot drift apart.

| Information | Home | Notes |
|---|---|---|
| Requirements, scope, flows, business rules, acceptance criteria | [product.md](../product.md) | Source of truth |
| Phases, priorities, dependencies, risks, delivery status | [roadmap.md](../roadmap.md) | Source of truth; the only roadmap |
| Feature overview | [feature.md](../feature.md) | Summarizes existing requirements and status; not a competing roadmap |
| Project summary, status snapshot, document map | [README.md](../README.md) | Summarizes; must match the two sources |
| How to propose and review changes | [CONTRIBUTING.md](../CONTRIBUTING.md) | |
| Audit findings, coverage, and closure evidence | [AUDIT.md](../AUDIT.md) | Public-safe; requirements stay in product.md, priorities in roadmap.md, defects in GitHub issues |
| Security reporting and security requirement summary | [SECURITY.md](../SECURITY.md) | Summary links to the rules' homes |
| Accessibility target, checks, and barrier reports | [ACCESSIBILITY.md](../ACCESSIBILITY.md) | Detailed rules stay in the coding guide |
| License | [LICENSE.md](../LICENSE.md) | MIT |
| Technical structure and constraints | [architecture.md](architecture.md) | Labeled Proposed until ADRs accept it |
| Current database tables, relationships, constraints, and deletion behavior | [DATA_MODEL.md](../DATA_MODEL.md) | Describes what is implemented; the target model is in `product.md` |
| Research reports and source notes | [research/](research/README.md) | Start here for desk research and links to field discovery, usability work, and event case studies; research recommendations do not change requirements |
| Field discovery and evidence | [discovery/](discovery/README.md) | Phase 0 interviews, observations, baselines, and the continue-or-stop memo |
| Significant technical decisions | [decisions/](decisions/README.md) | One file per decision |
| Operating model: support, incidents, monitoring, backups, handoff | [operations.md](operations.md) | Labeled Proposed until there is a running system |
| Domain rules for code | [coding-guide.md](coding-guide.md) | |
| Test scope, independent verification, predeployment gate, release blockers, evidence | [testing/test-plan.md](testing/test-plan.md) | Requirements stay in product.md; status in roadmap.md |
| Public page and copy rules | [content-guide.md](content-guide.md) | |
| Writing rules, status vocabulary, glossary | This file | |
| Setup and troubleshooting | [runbooks/](runbooks/local-setup.md) | Local setup and troubleshooting exist; race-day runbooks are planned |
| Visual system of the interface | [DESIGN.md](../DESIGN.md) | Tokens, type, components; distinguishes the built baseline from Planned design direction |
| Timer export format review and answers | [timer-export-review.md](timer-export-review.md) | Proposed until the timer accepts the format |
| USA Cycling questions and answers | [usac-questions.md](usac-questions.md) | Proposed until answered; confirmed requirements move to product.md with source and date |
| Payment model options and answers | [payment-model-questions.md](payment-model-questions.md) | Proposed until an ADR records the choice |
| Usability test plan, scripts, tasks, and results | [usability/](usability/README.md) | Kit implemented; results summaries are added after sessions, with participant codes only |
| Reusable organizer template research | [case studies](case-studies/organizer-templates/README.md) | Dated source observations and proposed setup exercises; not approved templates or a competing roadmap |
| Demo and category configuration fixtures | [fixtures/](fixtures/README.md) | Fake, illustrative data only. Demo purchase flow fixtures exist; category configuration fixtures are planned |

Detailed competitor profiles and raw research snapshots stay in the ignored local `competitor-profiles/` folder. Do not add tracked links to those files; keep dated public source citations in product.md so the repository remains understandable without local research.

### Repository structure

Current layout:

```text
.
├── README.md, CONTRIBUTING.md
├── SECURITY.md, ACCESSIBILITY.md, LICENSE.md
├── product.md, roadmap.md        Sources of truth
├── DESIGN.md                     Visual system of the organizer workspace
├── src/
│   ├── shared/                   Rules used by browser and server (schema, eligibility, capacity, validation, templates, demo data)
│   ├── server/                   Fastify API, PostgreSQL storage, seed script
│   └── web/                      React organizer workspace and rider preview
├── tests/                        Vitest unit and API tests
├── e2e/                          Playwright browser tests and screenshot capture
├── .github/workflows/ci.yml      Automated checks on pushes and pull requests
├── Dockerfile, render.yaml       Container image and Render Blueprint (not deployed; see docs/runbooks/deploy-render.md)
└── docs/
    ├── architecture.md, coding-guide.md, content-guide.md, documentation-guide.md, operations.md, timer-export-review.md,
    │                             usac-questions.md, payment-model-questions.md
    ├── research/                 Research index, desk reports, and dated source notes
    ├── discovery/                Phase 0 field-discovery kit and evidence
    ├── case-studies/             Event-specific research and setup exercises
    ├── decisions/                Architecture decision records
    ├── fixtures/                 Fake demo purchase flow data and sample waiver text
    ├── runbooks/                 Local setup, troubleshooting, and the planned Render deploy
    ├── usability/                Phase 1 usability test kit
    └── screenshots/              Images used in the README
```

Generated folders (`node_modules/`, `dist/`, `data/`, `test-results/`) are ignored by Git. Do not create empty placeholder directories.

### Naming conventions

- Documentation files use lowercase kebab-case: `race-day-check-in.md`, not `RaceDayCheckIn.md`. The exceptions are the conventional root files (`README.md`, `CONTRIBUTING.md`) and the two source documents (`product.md`, `roadmap.md`), whose names stay fixed because other files link to them.
- ADRs are numbered: `docs/decisions/0001-short-title.md`. Numbers are never reused.
- Runbooks are named for the task they support: `docs/runbooks/open-registration.md`, `docs/runbooks/check-in-outage.md`.
- Use the domain terms exactly as defined in the [glossary](#glossary). Say "registration category", not "division", "class", or "wave", unless the glossary says otherwise.

## Status vocabulary

Describe every feature, phase, or behavior with one of these words. Do not use "done", "ready", or "supported" on their own.

| Status | Meaning | Evidence needed |
|---|---|---|
| Planned | Described in `product.md` or `roadmap.md`; not started | A requirement or roadmap item |
| Proposed | A design or decision under discussion, not yet accepted | A document or ADR marked Proposed |
| In progress | Work has started but is not usable | A branch or partial change |
| Implemented | Code or documentation exists in `main` | The commit or file |
| Verified | Implemented, and its acceptance criteria or exit gate have been checked | Test results, rehearsal notes, or sign-off from the accountable role, linked from `roadmap.md` |
| Blocked | Cannot proceed until a named dependency is resolved | The dependency and its owner |

Only Verified work counts as complete on the roadmap. When README text describes behavior, it must match the status in `roadmap.md`.

## How to write

Write for a volunteer organizer who is smart, busy, and not a software engineer. Engineers lose nothing when the text is plain.

- **Lead with the point.** State the conclusion or instruction in the first sentence, then give the reasons and details in order of importance. This is the Minto pyramid structure: answer first, then grouped support. A reader who stops after the first paragraph should still know what to do.
- **One idea per paragraph.** Use headings that state the point, such as "A display header never creates a limit", rather than vague labels such as "Notes".
- **Explain technical terms when you need them.** Define the term the first time it appears, or link to the glossary. Example: "an idempotency key (a unique value that lets the system recognize a repeated request and process it only once)".
- **Be specific.** Name the role, the screen, the field, the number. Replace "the system handles errors" with what actually happens.
- **Be honest about uncertainty.** Say what is unknown and who owns the question. Never fill a gap with a guess.
- **Cut filler.** No "it's important to note", "seamless", "robust", "leverage", or restating the heading. No em dashes as sentence separators. No closing paragraph that repeats the page.
- **Instructions are numbered steps.** Each step starts with a verb and says what you should see when it worked.

## Diagrams

- Use Mermaid in fenced `mermaid` code blocks so diagrams live in version control and render on common Git hosts.
- Put a one-paragraph plain-English explanation directly below each diagram. Someone who cannot see the diagram should get the same information from the text.
- Label diagrams of unbuilt behavior as proposed, in the heading or the sentence above.
- Quote node labels (`A["Label text"]`) and avoid semicolons inside labels; both prevent common parse errors.
- Keep a diagram to one idea. If it needs more than about 20 nodes, split it.
- Check that every diagram parses before merging (paste it into the Mermaid live editor, or use a renderer once the project has one).

## Links

- Link between repository files with relative paths, such as `[coding guide](coding-guide.md)` from inside `docs/`.
- Link to a section with its heading anchor, such as `product.md#launch-criteria`. When you rename a heading, search for links to its old anchor.
- Use descriptive link text. Never "click here".
- External sources include the date you reviewed them when the content can change (fees, federation rules, competitor features).

## Documenting setup and troubleshooting once code exists

The current setup runbook is [runbooks/local-setup.md](runbooks/local-setup.md) and problems go in [runbooks/troubleshooting.md](runbooks/troubleshooting.md). Any change that alters how the app is installed, configured, or run must update them in the same change, using the templates below. Do not write setup steps for software that does not exist.

### Setup runbook template

Save as `docs/runbooks/local-setup.md` (or a more specific name):

```markdown
# Local setup

Last verified: <date> on <operating system and version> by <role>

## What you need
- <tool> <exact version>, and where to get it

## Steps
1. <Verb> <thing>. Expected result: <what you see>.
2. ...

## Check it worked
<one command or action and its expected output>

## Configuration
| Setting | Purpose | Where the value comes from | Secret? |
|---|---|---|---|

## Common problems
See troubleshooting.md.
```

### Troubleshooting entry template

Add entries to `docs/runbooks/troubleshooting.md`, one heading per symptom:

```markdown
## <Symptom as the user sees it, for example "Check-in screen shows 'offline'">

Who sees it: <role>
Likely causes:
1. <cause>: how to confirm, how to fix
2. ...
Escalate to: <role from the event's support plan> if not fixed in <time>
Last confirmed: <date>
```

Race-day runbooks (check-in outage, payment provider outage, start-list correction) follow the same structure and must name the support owner and escalation route that [product.md](../product.md#quality-requirements) requires.

Rules for runbooks:

- Every command must have been run by the author on the date shown.
- Never put real secrets, passwords, or rider data in a runbook. Refer to where the secret is stored.
- When a step changes, update the "Last verified" line.

## Glossary

Terms from the category model are defined in [product.md](../product.md#keep-the-concepts-separate); this list repeats them briefly and adds other terms used across the docs. If a definition here conflicts with `product.md`, `product.md` wins and this list should be corrected.

| Term | Meaning in this project |
|---|---|
| Road race | A mass-start bicycle race on roads, run over a set distance or number of laps of a course |
| Criterium (crit) | A mass-start race on a short closed circuit, often run for a set time plus a number of laps (for example 45 minutes + 3 laps) |
| Omnium | A competition combining several races; here, a road race and criterium weekend that riders can enter as a bundle. Omnium points scoring is out of scope |
| Event weekend | One event made up of one or more race days |
| Race day | A single date within an event weekend |
| Race | One competition on a race day, such as the Saturday road race |
| Display group (header) | A heading that groups categories on the schedule; presentation only, never a limit |
| Registration category | The entry option a rider buys, with its own eligibility and price, such as Masters 35+ Cat 3/4 |
| Start group (field) | Riders who start together under one shared field limit; may contain several categories |
| Classification | The label or code sent to the timer for scoring and awards |
| Capacity pool | An explicit limit shared across selected categories or start groups |
| Bundle | One purchase containing an entry in each specified race, such as a weekend entry |
| Reservation | A short-lived hold on a place during checkout; it expires if payment does not complete |
| Eligibility rule | Structured conditions (license category, racing age, competition class, and so on) a rider must meet for a category |
| License category | The rider's racing category assigned by the federation, such as Cat 3. Pro status is stored separately |
| Racing age | The age used for eligibility, calculated by the governing body's rule for the discipline and season, not assumed from the birthday |
| Readiness | Whether a rider is cleared to race: needs information, needs waiver, needs license review, cleared, or checked in |
| Bib | The race number a rider wears; assigned from configured ranges |
| Start list | The list of riders in each race sent to the timer; versioned with timestamps |
| Timer | The person or service that records finishes and produces results |
| USAC | USA Cycling, the national governing body for competitive cycling in the United States |
| Idempotency | Processing a repeated request or notification only once, so retries cannot create duplicates |
| ADR | Architecture decision record: a short document recording one significant decision and its tradeoffs |

## Review checklist for documentation changes

- [ ] Product and roadmap impact stated in the change summary
- [ ] Status words match the [status vocabulary](#status-vocabulary)
- [ ] Each fact lives in one home; other documents link to it
- [ ] Research reports and evidence collections are reachable from the [research index](research/README.md); decision records keep their explicit status
- [ ] Terms match the glossary
- [ ] Relative links and anchors resolve
- [ ] Every Mermaid diagram parses and has a plain-English explanation
- [ ] No secrets, real rider data, or unsupported claims
