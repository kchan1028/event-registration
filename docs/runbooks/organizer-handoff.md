# Organizer handoff

Status: Implemented instructions and a local fictional-account rehearsal. Human successor independence, real sign-in, provider responsibilities and operational acceptance remain unverified. Requirements stay in [product.md](../../product.md#core-flows-and-acceptance-criteria); delivery gates stay in [Phase 3](../../roadmap.md#phase-3--make-race-day-operable).

## Before handing over

This transfers your **Owner role for the organization**, affecting all its events. It is not an event copy, a new season's template, a payment-provider/merchant transfer or a federation approval. Review every active event in that organization before changing ownership.

1. Use fictional accounts/data locally. For any hosted or real-data use, satisfy the existing [security gates](../../SECURITY.md), including final pre-launch organizer MFA. Do not share an owner login, sign-in code or browser session.
2. Agree who is receiving ownership and which responsibilities they accept. Complete the existing [desk preparation/contact sheet](race-day-check-in.md#before-the-desk-opens-registration-lead) and [operations ownership](../operations.md#who-does-what). Named support/deputy, finance and timer responsibilities remain unassigned until actual people accept them; a role change does not assign those duties automatically.
3. Prepare the restricted event operating pack: event links, published configuration/version, bib settings, latest roster/snapshot, unresolved exceptions, timer handoff state, and links to the check-in, [phone registration](walkup-registration.md) and [local restore](local-backup-restore.md) procedures. Record outstanding incidents and reconciliation work. Do not put rider records, actual contact sheets or secrets in this public repository. An in-app operating-document upload/workspace is not provided by this procedure; use the organizer's accepted restricted location.
4. Decide whether the outgoing organizer still needs another role. Transfer removes their Owner role only. Existing Registration manager, Finance, Timer and exports or Check-in volunteer roles remain. Do not add retained roles merely to avoid losing access; use the [existing permission table](../../src/shared/roles.ts) for the duties actually continuing.

## Current owner: transfer in the interface

1. Open Home and locate the correct organization and its events. Open **Team and roles** on that organization.
2. Have the successor sign in once with their own email/account in a separate session. For local test sign-in use a fictional `.test` address; no email is sent by that test provider. Real Clerk email delivery remains a separate rehearsal.
3. Add that signed-in person with **Email**, an appropriate existing **Role**, and **Add to team**. For an organizer preparing events, Registration manager is an available preparatory role. A pending invitation is not a signed-in member and cannot be selected as the successor. Invitation delivery/expiry follows the existing team flow; an invitation record is not proof that an email arrived.
4. Under **Hand over ownership**, choose the intended teammate in **New owner**. Check the email carefully. In this interface, the candidate must be a signed-in teammate who is not already an owner. The service's broader signed-in-account prerequisite awaits a [product decision](../../product.md#ownership-transfer-successor-prerequisite); this guide rehearses the existing teammate path. If they are already an owner, verify their access and use the separate role-removal controls for your own Owner role if stepping down; do not try to transfer to yourself or remove the last owner.
5. Select **Hand over ownership**, then review the second confirmation. **Keep ownership** cancels that confirmation. **Hand over to [email]** commits the role transfer.
6. Wait for the success notice, then reload Home in both accounts to refresh displayed roles. The outgoing account stops being an owner; its other roles stay. The successor gains owner access. Team controls may still be on the pre-refresh page; their visibility is not proof that a server action is authorized.

## Successor: verify access and operation

Use your own account, not the outgoing browser session.

- Open the organization and **Team and roles**. Confirm your Owner membership and review **Recent changes** for the ownership handoff and actor. This transfers only the caller's Owner role; any other owners of the organization remain.
- Confirm the expected event links and published version. Open the event, its configuration and the operating pack. The handoff does not publish new terms or reprice registrations.
- Rehearse lookup, readiness and one bib issue with a fictional ready rider using the [check-in guide](race-day-check-in.md). A paid or bib-assigned rider with unresolved requirements remains blocked. Do not alter eligibility/waiver requirements to obtain a pass.
- Open **Start lists and timer export**, save a snapshot and check the sample export. A successful CSV download does not establish timer import/round-trip acceptance. If the event uses a timer liaison, route changes to them and retain acknowledgement separately.
- Review the ledger with the accountable finance person. Owner access to an export does not transfer bank, provider, dispute, settlement or tax responsibilities, and does not establish reconciliation.
- Confirm the outgoing account has only the intended remaining roles. An outgoing Registration manager can still manage entries and check-in but cannot manage the team or download the finance ledger unless another retained role permits it. If no roles remain, that organization is no longer accessible to the outgoing account.

## Failure or uncertain result

| Situation | Next step |
|---|---|
| Successor missing from New owner | Confirm organization, exact sign-in email and completed first sign-in; reload the team list. A pending invitation or an existing Owner is not a candidate. Do not create a duplicate account to work around the problem. |
| Request fails or response is lost | Stop repeating confirmations. Reload with each account and inspect current owner membership/history before retrying. A completed transfer removes the caller's authority to transfer again. Escalate unresolved state to the support owner; do not edit database memberships manually. |
| Outgoing account still has access | Check its retained roles and reload; transfer is not removal of every role or a global sign-out. Remove only unwanted roles through authorized team controls after verifying the successor's access. |
| Wrong organization, wrong successor or another operator changed access | Stop and contact the current authorized owner/support owner. No universal undo or developer-rescue operation is established here. Use current permissions and recorded history; do not share credentials to regain access. |
| Successor cannot operate without assistance | Record the blocked task and assistance needed. Keep the rehearsal incomplete; training, role changes or policy decisions must be resolved before claiming staff independence. |

Do not destroy or transfer the outgoing person's unrelated personal/rider account. Organization membership, external provider access and the person's account lifecycle are separate.

## Rehearsal and evidence

`e2e/handoff.spec.ts` uses two isolated fictional browser accounts to exercise cancel/confirm, owner membership/history, loss of team/finance privileges for an outgoing retained Registration manager, successor check-in and a saved start-list export. The existing ownership API scenario in `tests/auth.test.ts` covers unknown/self/non-owner/cross-organization refusals and actor history. These are software checks, not interviews, a human usability session or a real-provider sign-in test.

For acceptance, have the actual successor and volunteers repeat the relevant tasks without developer rescue. Record source commit, environment, roles, tasks, expected/observed results, assistance, incidents and untested areas under the [test plan](../testing/test-plan.md#5-manual-checks). No real rider data before its existing approvals. Unresolved support ownership, operating targets, retention, provider and timer responsibilities remain in [operations open questions](../operations.md#open-questions) and the roadmap; this guide approves none of them.
