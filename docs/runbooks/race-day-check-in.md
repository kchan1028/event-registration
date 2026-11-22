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
| Support owner and deputy for registration opening and race morning; coverage times and how to reach them | Unassigned |
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

Any of these roles may look up one registration's emergency contact. That lookup is a separate action. It is not part of the default check-in card, roster, or export.

## At the desk: check-in volunteer

1. Check the event and selected race day before each shift. A rider's races on another day do not establish an entry today.
2. In **Find a rider**, enter their full name, team, bib or confirmation check-in code and press Enter. Broad searches return at most 50 matches; use the full name or confirmation code to narrow the result instead of assuming the visible list is complete. A unique match opens the rider. With multiple matches, select the correct person and confirm their listed team, racing age and **Racing today** entries with them. A name alone is not enough for duplicate names. Camera scanning is optional and device-dependent; typing the code remains available.
3. Read the **Ready to race** or **Not ready** result and **Requirements**. Paid and bib-assigned do not mean cleared. For **Not ready**, do not issue a bib: use the escalation table below.
4. For a ready advance rider, check in using the preassigned bib. Send an advance rider without a bib to the registration lead for allocation. For a confirmed walk-up, select **Mark as walk-up** on the relevant entry. Once ready, use **Check in with bib** or **Check in and issue next bib**. An empty bib field requests the next available number. Verify the recorded check-in and bib before handover.
5. Use **Next rider** to return to lookup. Returning to an already checked-in rider preserves the recorded bib; do not hand out another physical bib merely because the page is opened again.

### Corrections and uncertain outcomes

For an incorrect individual number, use **Change bib**, enter the new number and reason, and **Preview bib change**. Check the affected days/entries and proposed number. A checked-in correction needs the displayed acknowledgement. Apply only the reviewed change; a stale/conflicting preview needs a new review. Before applying, recover the old physical bib and confirm the replacement is in desk inventory: changing the number can release the old assignment for reuse. If the old bib cannot be recovered, stop and ask the registration lead to control that number before any reuse; do not leave two physical bibs in circulation. Tell the timer/officials liaison about an issued-number change. Saved start-list revisions do not prove that the timer received it.

For a mistaken check-in, use **Undo check-in** and record the reason. Before confirming, recover any physical bib already handed out. Undo normally releases its number back to the available pool; a number used by another checked-in day can remain reserved. If the physical bib is missing, stop and escalate to the registration lead before undo/reuse so the same number cannot be handed to another rider. Recheck the current recorded assignment before any further issue.

If a check-in attempt changes **Ready to race** to **Not ready**, read the current blockers and refer the rider.

If the desk cannot confirm check-in, stop handing out bibs, reconnect and search for the same rider and race day. Use the check-in code to narrow the search to one rider. The warning stays on the current desk page until that lookup succeeds. If the page reloads, the desk clears the warning and search and can reopen on the first race day. Reselect the original day and look up the rider by check-in code before handing over a bib or retrying. If lookup confirms check-in, use the displayed bib and time to verify the record and check that the physical bib has not already been handed out. If lookup confirms no check-in was recorded, retry only when the rider is ready. Escalate any conflict to the registration lead.

The [local connection-recovery checks](../testing/test-plan.md#check-in-connection-recovery) exercise unreceived requests and lost committed responses with fictional volunteer accounts. Volunteer comprehension, physical connectivity recovery and inventory control remain open.

## Blocked riders and escalation

| What staff see | Next action |
|---|---|
| Payment not complete, failed payment or unknown payment outcome | Rider/guardian recovers the existing order under their own account; registration lead and finance investigate unresolved results. Do not create a second order or treat a bank screen as readiness clearance. |
| License review, waiver, guardian or other outstanding requirement | Hold the bib and refer to the registration lead. Use the [manual exception procedure](#manual-license-and-waiver-exceptions) in the fictional rehearsal. |
| No match, duplicate names or no entry on this day | Recheck event/day and confirmation code; ask the registration lead to locate the existing record. Do not create a replacement entry solely because lookup failed. |
| Rider needs to register | Open **Register a walk-up** and use the [phone-first walk-up guide](walkup-registration.md); unpublished events show no registration link. Riders/guardians use their own accounts; staff do not sign a waiver or enter a payment for them. Closed/full categories and waitlists remain enforced. |
| Missing bib range, exhausted range, conflicting number or stale preview | Stop that assignment and ask the registration manager to review ranges/inventory and obtain a fresh preview. Do not invent a number outside the allowed range. |
| Refund, withdrawal or entry/category correction | Registration lead coordinates entry changes; finance/owner handles refunds. Payment, entry and readiness must be checked separately. A requested refund is not proof of provider settlement. |
| App unavailable, wrong permissions or suspicious data exposure | Contact the support owner; keep the affected screen/material restricted. Security reports follow [SECURITY.md](../../SECURITY.md#how-to-report), not public issues or chats containing rider data. |

## Manual license and waiver exceptions

**Proposed for fictional rehearsal. Use mock riders, licenses and forms.** Before any live use, the race director needs event-specific acceptance of the license evidence and recheck rules, the waiver and guardian process, and how evidence is kept. Name the registration lead and deputy and agree with the Chief Referee who handles disputed license or eligibility cases. [USA Cycling onsite registration guidance](https://assets.usacycling.org/prod/documents/Registration_Best_Practices_USACycling.pdf)

1. **Volunteer.** Confirm the rider, event and race day using the check-in code and the entry details. Hold the bib and send the rider to the registration lead. Say which requirement is missing. Routine referrals need no written explanation from the volunteer.
2. **License needs review.** The lead or deputy, signed in as a Registration manager or Owner, checks evidence from the event's approved source. Match the rider and check the license status, type and category against the entry and race date. For the fictional rehearsal, use a current mock license, and recheck for a different race day, a change affecting eligibility, or conflicting or stale evidence. Leave the rider blocked if the source is unavailable or the evidence is unclear. Send disputed category or license cases to the designated official. After a satisfactory fictional check, find the entry in **Registrations** then select **Review license** and **Mark reviewed**. CycleReg records the review time without a typed note. CycleReg does not enforce a recheck interval. If new evidence makes a previous review unreliable, tell the check-in volunteer directly to hold the bib, even if the screen still shows **Ready to race**.
3. **Waiver or guardian signature is missing.** The lead identifies the missing signature or consent and directs the rider or required guardian to the signing procedure accepted for the event. If an accepted paper process applies, the lead checks the rider and event, the form version, and that the correct signer completed the required sections. For live use, keep the form in the event's approved restricted records. If it cannot be matched or the correct signer is unavailable, keep the rider blocked. A waiver signed outside CycleReg leaves the app’s blocker in place. CycleReg cannot record that paper waiver or replace the original signed record. Practice the referral using a mock form and discard it after the rehearsal. A sanctioned event that uses a paper process needs an accepted way to reconcile that evidence before it relies on CycleReg for bib issuance.
4. **Return to check-in.** Look up the same rider and race day again. Hand over the bib only after the lead has lifted any manual hold and the latest lookup shows the rider is ready and check-in is recorded. Payment, a preassigned bib, and a paper note do not clear a missing requirement. Keep any proof or exception references in the approved restricted process. Keep card or ID images and signatures out of volunteer notes. Avoid writing extra personal details on printed rosters.

Rehearse a valid fictional license, stale or mismatched evidence, a missing waiver, and a missing required guardian signature. The first case can pass license review if the other requirements are met. In the other cases, check that staff can identify the reason, refer the rider, and leave the bib at the desk.

## Connectivity loss and fallback limits

On phones the roster shows stacked rider entries with snapshot status, recorded bib, races and blocker guidance. It is still a read-only snapshot, not the live check-in controls. Desktop and print use the tables; **Print roster** from a phone also prints tables, including the separate exception checklist and writing aids.

Live registration and changes require connectivity. Do not reload away from an uncertain submission just to start a new one. Do not assume a cached screen or old printout reflects later withdrawals, reviews, bib changes or payments.

The printout identifies its limits as **Reference only**, labels readiness and bibs as snapshot records, and provides **Lead review notes** rather than a paper clearance field ([wording correction #142](https://github.com/kchan1028/event-registration/issues/142)). The registration lead must still brief staff on the unapproved contingency and reconciliation process before using it in a fictional rehearsal.

Use the printed roster to identify its snapshot time and the affected riders for the registration lead. A paper note does not update the application. The blank rows and exception checklist are recording aids; they do not authorize new offline entries, capacity exceptions, waiver clearance or payment collection. The lead must use an approved contingency process before authorizing any paper bib issuance. That process and paper reconciliation remain Proposed in [operations](../operations.md#handling-an-incident); no live fallback is approved by this guide. If none is accepted, pause affected issuance and escalate.

When connectivity returns, the registration lead coordinates reconciliation before ordinary issuance resumes: compare paper notes with current entries, readiness, recorded check-ins and bibs; investigate conflicts before replaying an action; have the timer liaison acknowledge changes where applicable. Do not silently replace accepted prices, payment records or history. No offline synchronization or dedicated paper-import workflow exists. Rehearse this with fictional data before claiming continuity.

Keep printed sheets controlled at the desk, collect them at shift handoff, and give them to the accountable owner for reconciliation and approved retention. Do not photograph or upload rider sheets into public issues. On screen, any organizer role may look up one registration's emergency contact from check-in, Registrations, or start lists. Hide it when finished. Each lookup is recorded with the account, event, order, and time, and that record does not store the name or phone. The printed roster still has no emergency contact. A paper copy of a contact is not a defined process, and real-data retention of the contact and the lookup record remains unresolved. This guide does not invent either policy.

### Reconcile a reference-only outage

**Proposed for fictional rehearsal.** Use the published demo event and add fictional demo riders. Prepare a printable roster, separate fictional volunteer and lead accounts, and mock bibs. Brief both staff on the pause and the route to the lead before starting.

1. **Prepare three fictional cases.** Before the exercise, the facilitator configures a bib range that matches the mock inventory, keeps one paid demo rider’s license unreviewed and preassigns a bib to another rider. Print the roster, then preview and apply a bib change for the preassigned rider using a free number in mock inventory. Record a check-in for a third rider and set aside the mock bib bearing that number. Give the volunteer a cue that the number left the desk before the saved result could be confirmed. Record this preparation as setup in the rehearsal log.
2. **Pause at the affected desk.** The facilitator announces a simulated outage and presents the three prepared cases. Hold mock bibs. Record the event, race day, snapshot time printed for that day, observed time, a reference to the affected row and what was attempted or seen. Record whether a physical bib may already have been handed over and its number if known. Keep the notes at the desk. Use a fresh lookup for payment, readiness and check-in decisions.
3. **Compare after reconnecting.** At the facilitator’s recovery cue, the volunteer looks up each rider on the original race day and the lead checks the notes against the current record and mock inventory. For the saved check-in, confirm the original bib and time without a second check-in or handover. For the unreviewed license, keep the bib at the desk and refer the rider. For the changed bib, use the current assignment and history. Hold any conflicting or unaccounted-for number until the lead can resolve it.
4. **Close the exercise.** Record the verified outcome or unresolved hold and its owner for each note. The lead confirms inventory against the handover records, with discrepancies listed as named holds. Ordinary check-in can resume for riders and bibs outside those holds. Record any start-list change and the timer liaison’s separate acknowledgement. Collect all fictional sheets at handoff. Use fictional case labels in place of rider details in the [rehearsal record](../testing/test-plan.md#volunteer-runbook-rehearsal).

## Shift handoff and rehearsal evidence

Before leaving, show the next authorized volunteer the event/day, pending exceptions, last confirmed bib actions, any uncertain submissions, latest roster time and how to reach the lead/deputy. Sign out when handing over a device; the next person uses their own account. Do not pass along a session or ask riders to use the staff device to register.

Use the [test-plan rehearsal scenarios](../testing/test-plan.md#volunteer-runbook-rehearsal) to record what another organizer and volunteers can complete without developer intervention. Record source commit, environment, fictional dataset, role/device, task, observed result, assistance, defects and untested areas. Automated tests and source review alone do not establish volunteer independence or complete Phase 3.
