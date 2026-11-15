# Questions for USA Cycling

Status: Proposed, written November 14, 2026. Not yet sent. Owner: KC (project owner). Public research done November 15, 2026; see [What public sources already say](#what-public-sources-already-say). That research does not replace USA Cycling's own answers. Answers go in the table at the end of this page; the owner and status are tracked in the [Phase 0 discovery kit](discovery/external-requirements.md#status).

USA Cycling's answers decide whether this product can handle waivers and license checks for sanctioned events at all, so they come before any choice of production stack or live pilot. This is a [Phase 0](../roadmap.md#phase-0--establish-the-case-to-build) deliverable and [open decision 4](../product.md#open-decisions) in product.md. Until the answers are in, the app keeps using simulated checks and organizer review only.

## Who should send it

The club's race director or another officer who already holds a USA Cycling organizer account for the event, because USAC deals with sanctioning organizers. Copy the technical lead so technical follow-ups reach the right person. Do not describe the app as an approved or integrated platform.

## What to send

> We run [event] each year under a USA Cycling permit. Our club is exploring a registration and check-in tool built for road races and criteriums, to reduce volunteer workload. Before we build anything for live use, we want to follow USA Cycling's rules for waivers, licenses, and reporting. Could you answer the questions below, or point us to the right contact? We are not asking for access yet; we want to know what is required and whether it is possible.

## Context USA Cycling may ask for

- **What exists today.** An app that runs on one computer with fictional riders. It does not connect to USA Cycling, take real payments, or collect real waivers.
- **Planned design.** License and waiver checks sit behind one interface that can use organizer review, an approved file import, or a live USA Cycling connection. Unknown or failed checks always leave the rider "needs review", never cleared. See [product.md](../product.md#future-usa-cycling-waiver-and-license-integration).
- **First use.** A smaller pilot event before the Berkeley Omnium, which stays on its current system until the [launch criteria](../product.md#launch-criteria) are met.

## Questions

Our current understanding, which needs USA Cycling's confirmation: electronic waiver signatures are accepted only on a USA Cycling approved registration platform; otherwise every rider signs a paper waiver that the organizer keeps. There is no public license-lookup service, and approved platforms get license data through an agreement with USA Cycling.

### Waivers

1. Is our understanding of electronic waivers correct? Where is the current rule written down?
2. How does a registration platform become approved for electronic waivers? What are the requirements, review steps, cost, and typical time?
3. Can a club-run tool used only for the club's own events be approved, or must the platform serve the public?
4. If we are not approved, what is the accepted paper process: who prints the waiver, what text, and how long the organizer keeps it?
5. How must a parent or guardian sign for a rider under 18, electronically and on paper?
6. Must the waiver text be USA Cycling's text unchanged, and how are new versions published?

### Licenses and categories

7. How can an approved platform check a rider's license number, name, type, status, expiry, and racing category for a race date?
8. Is there a file a promoter or platform may receive (for example a periodic license list), and under what terms and refresh schedule?
9. How should racing category be checked for category-restricted fields, and what is the source of truth when a rider's category changed recently?
10. What should happen at registration when a license cannot be verified? Is "pending, checked at the desk" acceptable?

### One-day licenses

11. Which one-day licenses can riders buy, and where? Can a club's registration tool sell or record them, or must riders buy them from USA Cycling directly?
12. What does an organizer need to record for a one-day license holder at check-in?

### Reporting and permits

13. What rider and entry data must the organizer send USA Cycling after the event, in what format, and by when?
14. Do results uploads or insurance reports need fields we should collect at registration (for example license number or club)?

### Data handling

15. What may we store about license checks and waivers, and for how long? Are there rules on sharing that data with the timer or officials?

### Next step

16. Who is the right contact for platform approval or data access, and what would a first conversation require from us?

## What public sources already say

Checked November 15, 2026 from public pages only (no login, no contact). These are preliminary. USA Cycling's own answers go in the [Answers](#answers) table and win over anything here. Confidence: **High** means stated in a current USA Cycling document; **Medium** means an older or undated USA Cycling page, or a registration platform describing its own USA Cycling arrangement; **Low** means not found or inferred.

| # | Preliminary answer | Confidence | Sources |
|---|---|---|---|
| 1 | Correct. Waivers may be signed electronically only if the organizer uses a USA Cycling approved registration platform; otherwise every participant and volunteer signs a paper waiver. Written in the 2026 Event Insurance Coverage Summary (checked directly). The 2024 rulebook says the same. | High | [A], [B] |
| 2 | Not found publicly. No list of approved platforms, criteria, cost, or timeline is published. BikeReg (partnership announced 2019), RunSignup (2026), and Movemint (2024) describe USA Cycling integrations. | Low | [C], [D], [E] |
| 3 | Not found publicly. | Low | |
| 4 | The organizer prints USA Cycling's waiver (current form Rev. 5/2024, with event, date, permit, and bib fields). Paper waivers must be kept in a secure place, on paper or digitized, for at least ten years (checked directly). | High | [A], [F], [G] |
| 5 | On paper, a parent or legal guardian signs a separate consent block for a rider under 18 (19 in Alabama). The form allows electronic or handwritten signature, but USA Cycling publishes no electronic method; BikeReg says it emails the parent a link. | High (paper), Medium (electronic) | [F], [H] |
| 6 | Organizers may not change the waiver without USA Cycling's written permission (checked directly). Versions carry a revision code on the PDF; no announcement process was found, and some USA Cycling documents still link older forms. | High (no changes), Low (versions) | [A], [F] |
| 7 | No public USA Cycling license lookup or API. RunSignup says it checks against a list USA Cycling refreshes weekly (so up to six days old) and that a real-time API is in progress; BikeReg says it checks name, birth date, and category in real time. Terms are not public. | Medium | [C], [D], [H] |
| 8 | Only what partners describe: RunSignup's weekly license list. No USA Cycling terms found. | Medium | [D] |
| 9 | Upgrades meeting the requirements apply automatically; others wait for staff review. The rider's USA Cycling account appears to be the source of truth, so a weekly list can miss a recent upgrade. | Medium | [I] |
| 10 | USA Cycling says competitive events must have a system for checking licenses and that the organizer should agree with the Chief Referee on who handles license problems. That fits "pending, checked at the desk", but USA Cycling does not say so outright. | Medium | [G], [D] |
| 11 | Two one-day licenses: Beginner, $15 (Cat 5 road, track, and cyclocross; Cat 3 mountain bike), sold on BikeReg or on site (the page's FAQ says USA Cycling's website instead of BikeReg); Experienced, $35, BikeReg only. Organizers may sell one-day licenses at on-site registration and pay USA Cycling through the post-event report. No rule found that lets a club's own online tool sell them. | Medium (page undated) | [J], [K], [L] |
| 12 | USA Cycling's paper application (Rev. 12.31.2022) collects name, contact details, birth date, race gender, category, event, and payment, with its own waiver and guardian block. The receipt plus photo ID serves as a temporary license. | Medium | [L] |
| 13 | The post-event report and fees are due within 21 days; the fee schedule lists a late fee after that. Rider surcharges (per unique rider per day) and on-site license sales are paid through the online post-event report, and results are uploaded in USA Cycling's portal. No official field format was found. | High (deadline), Low (format) | [M], [K], [N] |
| 14 | No field list found. Unique-rider counts (for the surcharge) and on-site license sales are needed for the report; license numbers are likely needed to match results (inferred). | Low | [K], [M] |
| 15 | Only the ten-year rule for paper waivers. No rule found on storing license-check results or sharing data with the timer. The waiver lets USA Cycling share data with service providers; the best-practices sheet tells registration staff to help officials and timers with start lists. | High (ten years), Low (rest) | [A], [F], [G], [O] |
| 16 | Event Services: eventservices@usacycling.org, 719-434-4200. No partnerships or developer contact is published. | High | [K], [N] |

Sources (retrieved November 15, 2026; dates are the documents' own where shown):

- [A] [USA Cycling 2026 Event Insurance Coverage Summary](https://assets.usacycling.org/prod/documents/2026-Event-Insurance-Coverage-Summary.pdf)
- [B] [USA Cycling Rulebook 2024](https://assets.usacycling.org/prod/documents/USACycling_RuleBook_4_2024.pdf). A [July 2025 rulebook](https://assets.usacycling.org/prod/documents/USACycling_RuleBook_7_2025.pdf) exists; its text was not checked.
- [C] [USA Cycling and BikeReg partnership announcement](https://usacycling.org/article/usac-and-bikereg-announce-partnership) (2019)
- [D] [RunSignup: USA Cycling competitive races](https://info.runsignup.com/2026/03/25/runsignup-now-supports-usa-cycling-competitive-races/) (March 25, 2026; platform's own claim)
- [E] [Movemint USA Cycling integration](https://www.movemint.cc/blog/posts/movemint-announces-usa-cycling-integration) (June 11, 2024; platform's own claim)
- [F] [USA Cycling waiver, Rev. 5/2024](https://assets.usacycling.org/prod/documents/USA-Cycling-Membership-Assumption-of-Risk-Release-of-Liability-Covenant-Not-to-Sue-and-Indemnification-Agreement-USAC-Base-2024-TB.pdf)
- [G] [USA Cycling onsite registration best practices](https://assets.usacycling.org/prod/documents/Registration_Best_Practices_USACycling.pdf) (November 2023)
- [H] [BikeReg knowledge base: USAC waiver setup](https://www.bikereg.com/knowledge-base/121/How-to-Setup-the-USAC-Waiver) (seen in search results only; the page could not be fetched)
- [I] [USA Cycling category upgrades](https://usacycling.org/category-upgrades) (undated)
- [J] [USA Cycling one-day licenses](https://usacycling.org/one-day-licenses) (undated; checked directly)
- [K] [USA Cycling organizer resources: permitting](https://usacycling.org/article/event-organizer-resources-permitting-your-event) (updated October 30, 2023) and [permitting guide](https://d31phgno5jnghy.cloudfront.net/prod/documents/Permitting_Your_Event_USACycling.pdf) (January 2024)
- [L] [USA Cycling annual and one-day license application](https://assets.usacycling.org/prod/documents/2023-Event-Annual-and-One-Day-License-Application-31Dec2022.pdf) (Rev. 12.31.2022)
- [M] [USA Cycling schedule of fees](https://usacycling.org/schedule-of-fees)
- [N] [USA Cycling organizer follow-up resources](https://usacycling.org/article/event-organizer-resources-follow-up-resources) (October 30, 2023)
- [O] [USA Cycling privacy policy](https://usacycling.org/privacy) (modified June 17, 2026)

### What this means so far

- A club-built tool that is not approved cannot collect electronic waivers. Until approval, riders sign paper waivers that the club keeps for ten years.
- No public license check exists. Without an agreement, license checks stay with organizer review at the desk, which USA Cycling's guidance allows.
- The Experienced one-day license is sold only on BikeReg, so riders who need it would still go there.
- Questions 2, 3, 7, and 8 decide whether a credible build path exists, and only USA Cycling can answer them. Send those first, to Event Services.

## Answers

Record each answer, who gave it, and where it is written down. A link to a USA Cycling document beats an email summary.

| # | Answer | From (name or role at USA Cycling) | Source or document | Date |
|---|---|---|---|---|
| 1 | | | | |
| 2 | | | | |
| 3 | | | | |
| 4 | | | | |
| 5 | | | | |
| 6 | | | | |
| 7 | | | | |
| 8 | | | | |
| 9 | | | | |
| 10 | | | | |
| 11 | | | | |
| 12 | | | | |
| 13 | | | | |
| 14 | | | | |
| 15 | | | | |
| 16 | | | | |

## What the answers decide

| If USA Cycling says | Then |
|---|---|
| Approval is possible for a club tool | Plan the approval steps and add them to the roadmap before Phase 2; record the requirements in product.md |
| Approval is not possible, or too costly for the club | Design for paper waivers kept by the organizer and organizer license review at the desk; update product.md and the check-in flow; reconsider whether the build still has a credible advantage (Phase 0 exit gate) |
| A license file is available | Plan the file-import source for license checks, with its refresh schedule shown to organizers |
| One-day licenses can only be bought from USA Cycling | Link riders to USA Cycling during registration and record the license number at check-in |

After the answers: update [product.md](../product.md#integrations-and-dependencies) with the confirmed requirements and their source and date, record the decision in [roadmap.md](../roadmap.md#delivery-status), and open an [ADR](decisions/README.md) if the answers change the architecture.
