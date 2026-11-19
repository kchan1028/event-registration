# Race-day check-in guide

Status: Implemented documentation for local fictional-data rehearsals, November 16, 2026. Instructions were checked against the source; independent volunteer operation, actual devices/printers and the full mock weekend remain unverified. This guide does not authorize live payments, real rider data or sanctioned use. Requirements remain in [product.md](../../product.md#5-race-day-operations); acceptance gates remain in the [roadmap](../../roadmap.md#phase-3--make-race-day-operable).

## Before the desk opens: registration lead

1. Give each staff member their own account and the required event-organization role. Open the event's **Check-in** page together; record the event link in the desk instructions. Do not share an owner login. Local test identities are fictional, not a substitute for rehearsing real sign-in.
2. Confirm the event and race day. Check published categories, intended registration windows and prices. Configure bib ranges and explain whether one bib covers the weekend or a day. Bulk/automatic allocation reserves numbers; it does not clear readiness or record check-in.
3. Prepare the physical bib inventory. Keep one controlled desk process so two volunteers do not hand out the same physical number.
4. While connected, open **Fallback roster**, wait for every day to load, and select **Print roster**. Check each day, the snapshot time and the exception checklist on the printout. The roster is a snapshot, not a live or automatically synchronized record.
5. Complete the desk contact sheet below and walk through the blocked-rider and unknown-outcome cases. Assign a lead and deputy before accepting an operational rehearsal. Unassigned contacts are a blocker to staff independence, not permission for the developer to become the implicit support owner.

| Desk information | Complete for the fictional rehearsal |
|---|---|
| Event link and race day | Unassigned |
| Registration lead and deputy; how to reach them | Unassigned |
| Support owner and deputy; how to reach them | Unassigned |
| Timer/officials liaison; how changes reach them | Unassigned |
| Finance contact for payment/refund questions | Unassigned |
| Latest printed roster time and storage location | Unassigned |
| Approved contingency instructions, if any | Unassigned; see limitations below |

Keep actual contact details in the event's restricted operating materials, not this public repository. These assignments are event preparation, not a new product decision; unresolved ownership remains in [operations open questions](../operations.md#open-questions).

## What each role can do

The [server role table](../../src/shared/roles.ts) is authoritative. Roles are scoped to an organization and a person can hold more than one.

| Role | Relevant local controls | Refer elsewhere |
|---|---|---|
| Check-in volunteer | Find riders, see readiness, check in, assign/correct an individual bib, undo a check-in with a reason, print fallback roster, show **Register a walk-up** for a published event | Category/window changes, license review, bulk/range settings, refunds and timer exports |
| Registration manager | Volunteer controls plus registration/entry management, license review, publishing and bib settings/batches | Money refunds require finance or owner access; accepted waiver/license processes still need approval |
| Timer and exports | Start lists, snapshots/locks and entries CSV | Check-in or entry changes require another granted role |
| Finance | Orders, ledger export and refunds | Check-in, entry changes or publishing require another granted role |
| Owner | All existing organizer permissions; assign access and accountable leads | A role does not create a federation approval or an accepted live-payment/contingency process |

## At the desk: check-in volunteer

1. Check the event and selected race day before each shift. A rider's races on another day do not establish an entry today.
2. In **Find a rider**, enter their full name, team, bib or confirmation check-in code and press Enter. Broad searches return at most 50 matches; use the full name or confirmation code to narrow the result instead of assuming the visible list is complete. A unique match opens the rider. With multiple matches, select the correct person and confirm their listed team, racing age and **Racing today** entries with them. A name alone is not enough for duplicate names. Camera scanning is optional and device-dependent; typing the code remains available.
3. Read the **Ready to race** or **Not ready** result and **Requirements**. Paid and bib-assigned do not mean cleared. For **Not ready**, do not issue a bib: use the escalation table below.
4. For a ready advance rider, check in using the preassigned bib. Send an advance rider without a bib to the registration lead for allocation. For a confirmed walk-up, select **Mark as walk-up** on the relevant entry. Once ready, use **Check in with bib** or **Check in and issue next bib**. An empty bib field requests the next available number. Verify the recorded check-in and bib before handover.
5. Use **Next rider** to return to lookup. Returning to an already checked-in rider preserves the recorded bib; do not hand out another physical bib merely because the page is opened again.

### Corrections and uncertain outcomes

For an incorrect individual number, use **Change bib**, enter the new number and reason, and **Preview bib change**. Check the affected days/entries and proposed number. A checked-in correction needs the displayed acknowledgement. Apply only the reviewed change; a stale/conflicting preview needs a new review. Before applying, recover the old physical bib and confirm the replacement is in desk inventory: changing the number can release the old assignment for reuse. If the old bib cannot be recovered, stop and ask the registration lead to control that number before any reuse; do not leave two physical bibs in circulation. Tell the timer/officials liaison about an issued-number change. Saved start-list revisions do not prove that the timer received it.

For a mistaken check-in, use **Undo check-in** and record the reason. Before confirming, recover any physical bib already handed out. Undo normally releases its number back to the available pool; a number used by another checked-in day can remain reserved. If the physical bib is missing, stop and escalate to the registration lead before undo/reuse so the same number cannot be handed to another rider. Recheck the current recorded assignment before any further issue.

If the request times out or the connection drops after a click, stop handing out numbers, reconnect and search again. Confirm the recorded check-in/bib before retrying. Repeated online check-in is designed to retain the same bib; that does not prevent duplicate physical handover. Escalate any uncertain or conflicting record instead of selecting another number to make the error disappear.

The [local connection-recovery checks](../testing/test-plan.md#check-in-connection-recovery) exercise unreceived requests and lost committed responses with fictional volunteer accounts. A fresh lookup that confirms check-in clears the warning and shows the saved time and bib. If the lookup fails or the rider is still unchecked, the warning stays visible. Retry check-in only after a lookup shows the rider is ready and still unchecked. These automated checks do not establish volunteer comprehension, real network/device recovery or physical inventory control.

## Blocked riders and escalation

| What staff see | Next action |
|---|---|
| Payment not complete, failed payment or unknown payment outcome | Rider/guardian recovers the existing order under their own account; registration lead and finance investigate unresolved results. Do not create a second order or treat a bank screen as readiness clearance. |
| License review, waiver, guardian or other outstanding requirement | Refer to the registration lead. The authorized reviewer must use the accepted process and recheck readiness. Unknown/stale verification is not cleared. The accepted federation/guardian/waiver path remains an external gate; this guide grants no bypass. |
| No match, duplicate names or no entry on this day | Recheck event/day and confirmation code; ask the registration lead to locate the existing record. Do not create a replacement entry solely because lookup failed. |
| Rider needs to register | Open **Register a walk-up** and use the [phone-first walk-up guide](walkup-registration.md); unpublished events show no registration link. Riders/guardians use their own accounts; staff do not sign a waiver or enter a payment for them. Closed/full categories and waitlists remain enforced. |
| Missing bib range, exhausted range, conflicting number or stale preview | Stop that assignment and ask the registration manager to review ranges/inventory and obtain a fresh preview. Do not invent a number outside the allowed range. |
| Refund, withdrawal or entry/category correction | Registration lead coordinates entry changes; finance/owner handles refunds. Payment, entry and readiness must be checked separately. A requested refund is not proof of provider settlement. |
| App unavailable, wrong permissions or suspicious data exposure | Contact the support owner; keep the affected screen/material restricted. Security reports follow [SECURITY.md](../../SECURITY.md#how-to-report), not public issues or chats containing rider data. |

## Connectivity loss and fallback limits

On phones the roster shows stacked rider entries with snapshot status, recorded bib, races and blocker guidance. It is still a read-only snapshot, not the live check-in controls. Desktop and print use the tables; **Print roster** from a phone also prints tables, including the separate exception checklist and writing aids.

Live registration and changes require connectivity. Do not reload away from an uncertain submission just to start a new one. Do not assume a cached screen or old printout reflects later withdrawals, reviews, bib changes or payments.

The printout identifies its limits as **Reference only**, labels readiness and bibs as snapshot records, and provides **Lead review notes** rather than a paper clearance field ([wording correction #142](https://github.com/kchan1028/event-registration/issues/142)). The registration lead must still brief staff on the unapproved contingency and reconciliation process before using it in a fictional rehearsal.

Use the printed roster to identify its snapshot time and the affected riders for the registration lead. A paper note does not update the application. The blank rows and exception checklist are recording aids; they do not authorize new offline entries, capacity exceptions, waiver clearance or payment collection. The lead must use an approved contingency process before authorizing any paper bib issuance. That process and paper reconciliation remain Proposed in [operations](../operations.md#handling-an-incident); no live fallback is approved by this guide. If none is accepted, pause affected issuance and escalate.

When connectivity returns, the registration lead coordinates reconciliation before ordinary issuance resumes: compare paper notes with current entries, readiness, recorded check-ins and bibs; investigate conflicts before replaying an action; have the timer liaison acknowledge changes. Do not silently replace accepted prices, payment records or history. No offline synchronization or dedicated paper-import workflow exists. Rehearse this with fictional data before claiming continuity.

Keep printed sheets controlled at the desk, collect them at shift handoff, and give them to the accountable owner for reconciliation and approved retention. Do not photograph or upload rider sheets into public issues. Real-data retention and restricted emergency-contact access remain unresolved; this guide does not invent either policy.

## Shift handoff and rehearsal evidence

Before leaving, show the next authorized volunteer the event/day, pending exceptions, last confirmed bib actions, any uncertain submissions, latest roster time and how to reach the lead/deputy. Sign out when handing over a device; the next person uses their own account. Do not pass along a session or ask riders to use the staff device to register.

Use the [test-plan rehearsal scenarios](../testing/test-plan.md#volunteer-runbook-rehearsal) to record what another organizer and volunteers can complete without developer intervention. Record source commit, environment, fictional dataset, role/device, task, observed result, assistance, defects and untested areas. Automated tests and source review alone do not establish volunteer independence or complete Phase 3.
