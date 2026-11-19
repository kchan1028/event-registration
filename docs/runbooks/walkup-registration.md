# Phone-first walk-up registration

Status: Implemented locally for fictional-data rehearsals. Owner decision: November 16, 2026, rider phone first; staff check readiness and issue bibs. This is not approval for live payment or sanctioned use. Full Phase 3 acceptance remains open in the [roadmap](../../roadmap.md#phase-3--make-race-day-operable).

## Before the desk opens

The event owner or registration manager publishes the intended categories, opening/closing windows and day-of surcharges. Registration must remain open for the intended race-day period; the handoff cannot override a closed category, eligibility, capacity or a waitlist. Configure bib ranges. Use the existing approved exception process; no new exception permission is introduced.

For another device to open the QR, the site must be reachable from that device. A loopback address works only on this computer. Local browser contexts can rehearse the flow; actual phone scanning requires reachable fictional-data staging under the existing security gates. No deployment is authorized by this guide.

## At the desk

1. Open **Check-in**, then **Register a walk-up**. An unpublished event shows no registration address or QR.
2. Ask the rider or guardian to scan the event QR or type the displayed public address on their own phone. Keep the staff account on the staff device. The preview link is for checking the page, not a shared kiosk.
3. The participant signs in to their own account, selects available entries, reviews the total, supplies required details and consent, and completes the configured payment flow. The demo is simulated; Stripe test mode uses hosted test payment only. Staff never collect card numbers or type a signature for a rider.
4. Ask for their name or confirmation code and search again in check-in. A pending/failed payment or unresolved requirement is not clearance. Do not start another order to solve an unknown payment outcome; recover the existing order or escalate to the registration lead.
5. Select **Mark as walk-up** on the confirmed entry. The QR and link open ordinary registration. Resolve permitted exceptions through authorized review. When the result is **Ready to race**, check in and issue the bib. Check the resulting timestamped start list; do not maintain a second hand-entered entrant list.

## Unavailable or interrupted registration

A closed/full category or waitlist remains enforced. Refer the participant to the registration lead; volunteers cannot reopen it through this panel. A disconnected device cannot create a live entry offline. Use the existing [fallback/incident procedure](../operations.md#handling-an-incident), preserving a record for authorized reconciliation. Cash/check, staff-entered orders, shared-kiosk sessions and physical terminals are outside this increment.

## Evidence still required

Physical QR scanning, real Clerk/provider behavior, staff independence, and accepted waiver/license resolution remain unverified. Automated handoff coverage is in `e2e/walkup.spec.ts`; test policy remains in the [test plan](../testing/test-plan.md). Do not treat a successful simulated purchase as a completed race-day rehearsal.
