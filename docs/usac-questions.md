# Questions for USA Cycling

Status: Proposed, written November 14, 2026. Not yet sent. Answers go in the table at the end of this page; the owner and status are tracked in the [Phase 0 discovery kit](discovery/external-requirements.md#status).

USA Cycling's answers decide whether this product can handle waivers and license checks for sanctioned events at all, so they come before any choice of production stack or live pilot. This is a [Phase 0](../roadmap.md#phase-0--establish-the-case-to-build) deliverable and [open decision 4](../product.md#open-decisions) in product.md. Until the answers are in, the prototype keeps using simulated checks and organizer review only.

## Who should send it

The club's race director or another officer who already holds a USA Cycling organizer account for the event, because USAC deals with sanctioning organizers. Copy the technical lead so technical follow-ups reach the right person. Do not describe the prototype as an approved or integrated platform.

## What to send

> We run [event] each year under a USA Cycling permit. Our club is exploring a registration and check-in tool built for road races and criteriums, to reduce volunteer workload. Before we build anything for live use, we want to follow USA Cycling's rules for waivers, licenses, and reporting. Could you answer the questions below, or point us to the right contact? We are not asking for access yet; we want to know what is required and whether it is possible.

## Context USA Cycling may ask for

- **What exists today.** A prototype that runs on one computer with fictional riders. It does not connect to USA Cycling, take real payments, or collect real waivers.
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
