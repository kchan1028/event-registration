import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { INVITATION_DAYS, ROLE_LABELS, ROLES, type MembershipChange, type Role } from '../shared/roles';
import { api, ApiError, type MemberList } from './api';
import { formatDateTime } from './format';
import { Field } from './ui';

const ROLE_HELP: Record<Role, string> = {
  owner: 'Everything, including who is on the team',
  registration_manager: 'Event setup, publishing, registrations, check-in, start lists',
  check_in_volunteer: 'Race-day check-in and bibs only',
  timer_export: 'Start lists and the entries export',
  finance: 'Registrations, refunds, and the ledger export',
};

/** One line of role history in plain words. A change with no actor was made by a setup script. */
function describeChange(c: MembershipChange): string {
  const by = c.by ?? 'A setup script';
  const role = ROLE_LABELS[c.role];
  switch (c.action) {
    case 'granted':
      return `${by} gave ${c.email} the ${role} role`;
    case 'invited':
      return `${by} invited ${c.email} as ${role}`;
    case 'invitation_renewed':
      return `${by} resent the ${role} invitation to ${c.email}`;
    case 'invitation_accepted':
      return `${c.email} signed in and took up the ${role} invitation`;
    case 'invitation_expired':
      return `${c.email} signed in after the ${role} invitation expired, so got no role`;
    case 'removed':
      return `${by} removed the ${role} role from ${c.email}`;
    case 'invitation_cancelled':
      return `${by} cancelled the ${role} invitation for ${c.email}`;
    case 'ownership_transferred':
      return `${by} handed ownership to ${c.email}`;
  }
}

const EMAIL_STATUS: Record<'recorded' | 'sent' | 'failed' | 'uncertain', string> = {
  recorded: 'Email recorded, not sent (local email)',
  sent: 'Email sent',
  failed: 'Email failed to send',
  uncertain: 'Email might have been sent',
};

const DELIVERY_LABEL = {
  delivered: 'Delivered',
  bounced: 'Bounced',
  complained: 'Complaint received',
} as const;

/** A delivery word only for the three recorded outcomes. Missing or unknown values stay blank. */
function deliveryLabel(value: string | null | undefined): string | null {
  if (value === 'delivered' || value === 'bounced' || value === 'complained') return DELIVERY_LABEL[value];
  return null;
}

type TeamSnapshot = { list: MemberList; receivedAt: number };

function teamTime(snapshot: TeamSnapshot | null): number {
  const serverTime = Date.parse(snapshot?.list.asOf ?? '');
  // Advance the server's time with elapsed time, independent of device-clock corrections.
  return snapshot && Number.isFinite(serverTime) ? serverTime + performance.now() - snapshot.receivedAt : Date.now();
}

/**
 * People and roles for one organization. Owners only; the server refuses everyone else.
 * Adding an email that has never signed in records an invitation that becomes a role the
 * first time that person signs in with the same email, if that is within INVITATION_DAYS.
 * Resending a completed invitation emails it again and starts the period over. Retrying an email that might already have been sent does not.
 * A bounced or complained address stays stopped until an owner sends the open invitation again without adding days, or allows one new invitation after cancelling or after it has ended.
 * An owner can hand ownership to a teammate
 * who has signed in; every change appears under Recent changes with who made it.
 */
export function TeamPanel({ orgId, orgName }: { orgId: string; orgName: string }) {
  const [open, setOpen] = useState(false);
  const [snapshot, setSnapshot] = useState<TeamSnapshot | null>(null);
  const list = snapshot?.list ?? null;
  const setList = useCallback((next: MemberList) => {
    setSnapshot({ list: next, receivedAt: performance.now() });
  }, []);
  const [error, setError] = useState<string | null>(null);
  const [email, setEmail] = useState('');
  const [role, setRole] = useState<Role>('check_in_volunteer');
  const [busy, setBusy] = useState(false);
  const [successor, setSuccessor] = useState('');
  const [confirming, setConfirming] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    if (open && !list) api.members(orgId).then(setList).catch((e: ApiError) => setError(e.message));
  }, [open, list, orgId, setList]);

  const [deadlineTick, setDeadlineTick] = useState(0);
  const now = teamTime(snapshot);
  const deadlines = list?.invitations.map((invitation) => Date.parse(invitation.expiresAt)).filter((deadline) => deadline > now) ?? [];
  const nextDeadline = Math.min(...deadlines);

  useEffect(() => {
    if (!open || !Number.isFinite(nextDeadline)) return;
    const delay = Math.min(Math.max(1, nextDeadline - teamTime(snapshot)), 2_147_483_647);
    const timer = window.setTimeout(() => setDeadlineTick((tick) => tick + 1), Math.ceil(delay));
    return () => window.clearTimeout(timer);
  }, [open, snapshot, nextDeadline, deadlineTick]);

  useEffect(() => {
    if (!open || !snapshot || busy) return;
    let active = true;
    let refreshing = false;
    async function refresh() {
      if (!active || refreshing || document.visibilityState !== 'visible') return;
      refreshing = true;
      try {
        const next = await api.members(orgId);
        if (active) setSnapshot((current) => current === snapshot ? { list: next, receivedAt: performance.now() } : current);
      } catch {
        // Keep the last list. A later visibility change or conflicting action can refresh it.
      } finally {
        refreshing = false;
      }
    }

    document.addEventListener('visibilitychange', refresh);
    return () => {
      active = false;
      document.removeEventListener('visibilitychange', refresh);
    };
  }, [open, snapshot, busy, orgId]);

  async function run(action: () => Promise<MemberList>) {
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      setList(await action());
      return true;
    } catch (e) {
      setError((e as ApiError).message);
      // A conflict means the list on screen is out of date.
      if ((e as ApiError).status === 409) await api.members(orgId).then(setList, () => undefined);
      return false;
    } finally {
      setBusy(false);
    }
  }

  async function retry(email: string, role: Role, attemptId: string) {
    await run(async () => {
      const next = await api.retryInvitation(orgId, email, role, attemptId);
      const status = next.invitations.find((i) => i.lastEmail?.attemptId === attemptId)?.lastEmail?.status;
      setNotice(status ? `${email}: ${EMAIL_STATUS[status]}.` : `The invitation for ${email} changed. The list shows where it stands now.`);
      return next;
    });
  }

  async function handOver() {
    if (await run(() => api.transferOwnership(orgId, successor))) {
      setNotice(`Ownership handed to ${successor}. You are no longer an owner here; your other roles stay.`);
      setSuccessor('');
      setConfirming(false);
    }
  }

  async function add(e: FormEvent) {
    e.preventDefault();
    const action = typedStopped && !typedOpen ? () => api.allowInvitation(orgId, email.trim(), role) : () => api.addMember(orgId, email.trim(), role);
    if (await run(action)) setEmail('');
  }

  // Signed-in teammates who are not owners yet. An invitation cannot take ownership.
  const candidates = list ? [...new Set(list.members.map((m) => m.email))].filter((address) => !list.members.some((m) => m.email === address && m.role === 'owner')) : [];
  const typed = email.trim().toLowerCase();
  const typedStopped = list?.stoppedEmails.some((row) => row.email === typed) ?? false;
  const typedOpen = list?.invitations.some((row) => row.email === typed && row.role === role && Date.parse(row.expiresAt) > now) ?? false;
  const emailHint = typedStopped
    ? typedOpen
      ? 'Mail to this address is stopped. Use Send without extending on the invitation above. That does not add days.'
      : `Mail to this address is stopped. Allowing one new invitation starts ${INVITATION_DAYS} days from now.`
    : `They sign in with this email within ${INVITATION_DAYS} days to get the role.`;

  if (!open) {
    return (
      <button className="btn btn--ghost btn--small" type="button" onClick={() => setOpen(true)} aria-expanded={false}>
        Team and roles
      </button>
    );
  }

  return (
    <section className="team" aria-label={`Team and roles for ${orgName}`}>
      <div className="team__head">
        <h4>Team and roles</h4>
        <button className="btn btn--ghost btn--small" type="button" onClick={() => setOpen(false)} aria-expanded={true}>
          Close
        </button>
      </div>
      {error && (
        <p className="alert alert--error" role="alert">
          {error}
        </p>
      )}
      {/* Always mounted, so screen readers hear the text arrive. A retry result is not always good news. */}
      <p className={notice ? 'note' : 'sr-only'} role="status">
        {notice}
      </p>
      {!list && !error && <div className="skeleton" aria-label="Loading team" />}
      {list && (
        <ul className="team__list">
          {list.members.map((m) => (
            <li key={`${m.accountId}-${m.role}`}>
              <span className="team__email">{m.email}</span>
              <span className="tag">{ROLE_LABELS[m.role]}</span>
              <button className="link-btn" type="button" disabled={busy} onClick={() => run(() => api.removeMember(orgId, m.email, m.role, m.revision))}>
                Remove<span className="sr-only">
                  {' '}
                  {ROLE_LABELS[m.role]} role from {m.email}
                </span>
              </button>
            </li>
          ))}
          {list.invitations.map((i) => {
            const expired = Date.parse(i.expiresAt) <= now;
            const uncertain = i.lastEmail?.status === 'uncertain';
            const delivery = deliveryLabel(i.lastEmail?.delivery);
            const deliveryFailed = i.lastEmail?.delivery === 'bounced' || i.lastEmail?.delivery === 'complained';
            const stopped = Boolean(i.suppressed);
            return (
              <li key={`invite-${i.email}-${i.role}`}>
                <span className="team__email">{i.email}</span>
                <span className="tag">{ROLE_LABELS[i.role]}</span>
                {expired && <span className="tag tag--error">Expired</span>}
                <span className="muted small">
                  {expired ? 'Ended' : 'Not signed in yet, open until'} <time dateTime={i.expiresAt}>{formatDateTime(i.expiresAt)}</time>
                  {i.earlierEmail && ' · An earlier email might have been sent. To send a new one, cancel and invite again.'}
                  {!i.earlierEmail && i.lastEmail && (
                    <>
                      {' · '}
                      <span className={i.lastEmail.status === 'failed' ? 'team__email-failed' : i.lastEmail.status === 'uncertain' ? 'team__email-uncertain' : undefined}>{EMAIL_STATUS[i.lastEmail.status]}</span>
                      {delivery && (
                        <>
                          {' · '}
                          <span className={deliveryFailed ? 'team__email-failed' : undefined}>{delivery}</span>
                        </>
                      )}
                    </>
                  )}
                  {stopped && (
                    <>
                      {' · '}
                      <span className="team__email-failed">Mail stopped</span>
                    </>
                  )}
                </span>
                {!i.earlierEmail && stopped && !expired && (
                  <button className="link-btn" type="button" disabled={busy} onClick={() => run(() => api.sendWithoutExtending(orgId, i.email, i.role, i.revision))}>
                    Send without extending
                    <span className="sr-only"> the invitation to {i.email}. This does not add days.</span>
                  </button>
                )}
                {!i.earlierEmail && !stopped && (
                  <button className="link-btn" type="button" disabled={busy} onClick={() => (uncertain ? retry(i.email, i.role, i.lastEmail!.attemptId) : run(() => api.resendInvitation(orgId, i.email, i.role, i.revision)))}>
                    {uncertain ? 'Retry send' : 'Resend'}
                    <span className="sr-only">
                      {uncertain ? ` of the invitation email to ${i.email} without extending it` : ` invitation to ${i.email}, open for ${INVITATION_DAYS} more days`}
                    </span>
                  </button>
                )}
                <button className="link-btn" type="button" disabled={busy} onClick={() => run(() => api.cancelInvitation(orgId, i.email, i.role, i.revision))}>
                  Cancel<span className="sr-only"> invitation for {i.email}</span>
                </button>
              </li>
            );
          })}
        </ul>
      )}
      <form className="team__add" onSubmit={add}>
        <Field label="Email" hint={emailHint}>
          {(id, describedBy) => <input id={id} className="input" type="email" value={email} onChange={(e) => setEmail(e.target.value)} aria-describedby={describedBy} required maxLength={254} />}
        </Field>
        <Field label="Role" hint={ROLE_HELP[role]}>
          {(id, describedBy) => (
            <select id={id} className="input" value={role} onChange={(e) => setRole(e.target.value as Role)} aria-describedby={describedBy}>
              {ROLES.map((r) => (
                <option key={r} value={r}>
                  {ROLE_LABELS[r]}
                </option>
              ))}
            </select>
          )}
        </Field>
        <button className="btn btn--secondary" type="submit" disabled={busy || !email.trim() || (typedStopped && typedOpen)}>
          {typedStopped && !typedOpen ? (
            <>
              Allow one new invitation
              <span className="sr-only"> to {typed}. This starts a new {INVITATION_DAYS}-day invitation.</span>
            </>
          ) : (
            'Add to team'
          )}
        </button>
      </form>
      {list && (
        <div className="team__handover">
          <h5>Hand over ownership</h5>
          {candidates.length === 0 ? (
            <p className="muted small">Add your successor to the team first. They need to sign in once before they can take ownership.</p>
          ) : (
            <div className="team__add">
              <Field label="New owner" hint="You stop being an owner. Any other roles you hold stay.">
                {(id, describedBy) => (
                  <select
                    id={id}
                    className="input"
                    value={successor}
                    onChange={(e) => {
                      setSuccessor(e.target.value);
                      setConfirming(false);
                    }}
                    aria-describedby={describedBy}
                  >
                    <option value="">Choose a teammate</option>
                    {candidates.map((c) => (
                      <option key={c} value={c}>
                        {c}
                      </option>
                    ))}
                  </select>
                )}
              </Field>
              {confirming ? (
                <div className="team__confirm" role="group" aria-label="Confirm hand-over">
                  <button className="btn btn--primary" type="button" disabled={busy} onClick={handOver}>
                    Hand over to {successor}
                  </button>
                  <button className="link-btn" type="button" disabled={busy} onClick={() => setConfirming(false)}>
                    Keep ownership
                  </button>
                </div>
              ) : (
                <button className="btn btn--secondary" type="button" disabled={busy || !successor} onClick={() => setConfirming(true)}>
                  Hand over ownership
                </button>
              )}
            </div>
          )}
        </div>
      )}
      {list && list.history.length > 0 && (
        <details className="team__history">
          <summary className="small">Recent changes ({list.history.length})</summary>
          <ol>
            {list.history.map((c, i) => (
              <li key={i} className="small">
                <time dateTime={c.at}>{formatDateTime(c.at)}</time> · {describeChange(c)}
              </li>
            ))}
          </ol>
        </details>
      )}
    </section>
  );
}
