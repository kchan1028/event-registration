import { useEffect, useRef, useState, type FormEvent } from 'react';
import { guardianRemovalSchema, type GuardianRelationship, type JuniorProfile } from '../shared/juniors';
import { api, type ApiError } from './api';
import { formatDateTime } from './format';
import { Field } from './ui';
import { useLoad } from './useLoad';

/** Current guardians manage invitations and the other guardian without changing purchase evidence. */
export function GuardianManagement({ junior }: { junior: JuniorProfile }) {
  const { data, error, setError, reload } = useLoad(() => Promise.all([api.guardianRelationships(junior.id), api.juniorGuardianInvitations(junior.id)]), [junior.id]);
  const [email, setEmail] = useState('');
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState('');
  const [removing, setRemoving] = useState<GuardianRelationship | null>(null);
  const [reason, setReason] = useState('');
  const [reasonError, setReasonError] = useState<string | null>(null);
  const [acknowledge, setAcknowledge] = useState(false);
  const status = useRef<HTMLParagraphElement>(null);
  const reasonInput = useRef<HTMLTextAreaElement>(null);
  useEffect(() => { if (notice) status.current?.focus(); }, [notice]);
  useEffect(() => { if (removing) reasonInput.current?.focus(); }, [removing]);
  const refresh = () => { setError(null); setRemoving(null); reload(); };
  const run = async (action: () => Promise<unknown>, message: string) => {
    if (busy) return;
    setBusy(true); setError(null); setNotice('');
    try {
      await action();
      setNotice(message); setEmail(''); setRemoving(null); setReason(''); setAcknowledge(false);
      reload();
    } catch (e) { setError(`${(e as ApiError).message} Refresh guardian access before trying again. Repeating a removal targets the same relationship only.`); }
    finally { setBusy(false); }
  };
  const invite = (event: FormEvent) => {
    event.preventDefault();
    void run(() => api.inviteJuniorGuardian(junior.id, email.trim()), 'Guardian invitation recorded. No email was sent; ask the invited person to sign in and open My registrations.');
  };
  const remove = (event: FormEvent) => {
    event.preventDefault();
    if (!removing || !acknowledge) return;
    const parsed = guardianRemovalSchema.safeParse({ reason, acknowledge });
    if (!parsed.success) { setReasonError(parsed.error.issues[0].message); reasonInput.current?.focus(); return; }
    void run(() => api.removeJuniorGuardian(junior.id, removing.id, parsed.data.reason), `Guardian access removed for ${removing.email}. Original orders and waivers are unchanged.`);
  };
  const [relationships, invitations] = data ?? [null, null];
  const active = relationships?.filter((g) => !g.revokedAt);
  const pending = invitations?.find((i) => i.status === 'pending');
  return <section className="guardian-management" aria-label={`Guardian access for ${junior.firstName} ${junior.lastName}`}>
    <h3>Guardian access</h3>
    <p className="small muted">Up to two guardians can manage this junior. Each uses their own account; a junior’s viewer login stays read-only.</p>
    <p role="status" tabIndex={notice ? -1 : undefined} ref={status} className={!notice && (data || error) ? 'sr-only' : undefined}>{notice || (!data && !error ? 'Loading guardian access…' : '')}</p>
    {error && <p className="alert alert--error" role="alert">{error}</p>}
    <button className="btn btn--secondary" type="button" disabled={busy} onClick={refresh}>Refresh guardian access</button>
    {active && <ul className="orders" aria-label={`Current guardians for ${junior.firstName}`}>
      {active.map((g) => <li key={g.id}>
        <p>{g.email}{g.isYou ? ' (you)' : ''}</p>
        {!g.isYou && !removing && <button className="btn btn--secondary" type="button" disabled={busy} onClick={() => { setRemoving(g); setReason(''); setReasonError(null); setAcknowledge(false); setNotice(''); }}>Remove guardian access for {g.email}</button>}
      </li>)}
    </ul>}
    {removing && <form className="guardian-invitation" onSubmit={remove} aria-label={`Remove guardian access for ${removing.email}`}>
      <p>{removing.email} will lose access to this junior’s existing registrations. This does not cancel entries, refund payments or change accepted waivers. Disputed access restoration requires support review.</p>
      <Field label="Reason for removing guardian access" hint="3 to 300 characters. This reason is retained in the relationship history.">
        {(id, description) => <textarea id={id} aria-describedby={[description, reasonError ? `${junior.id}-removal-error` : null].filter(Boolean).join(' ')} aria-invalid={Boolean(reasonError)} ref={reasonInput} className="input" value={reason} onChange={(e) => { setReason(e.target.value); setReasonError(null); }} required disabled={busy} />}
      </Field>
      {reasonError && <p id={`${junior.id}-removal-error`} className="alert alert--error" role="alert">{reasonError}</p>}
      <label className="guardian-invitation__ack"><input type="checkbox" checked={acknowledge} onChange={(e) => setAcknowledge(e.target.checked)} disabled={busy} required />I understand this removes the other guardian’s access to this junior’s registrations.</label>
      <div className="row">
        <button className="btn btn--primary" type="submit" disabled={busy || !acknowledge || !reason.trim()}>{busy ? 'Removing…' : 'Confirm guardian removal'}</button>
        <button className="btn btn--secondary" type="button" disabled={busy} onClick={() => { setRemoving(null); setNotice('Guardian access kept.'); }}>Keep guardian access</button>
      </div>
    </form>}
    {active && active.length < 2 && <form className="guardian-invitation" onSubmit={invite} aria-label={`Invite a guardian for ${junior.firstName}`}>
      <p className="small">No invitation email is sent yet. Ask the invited person to sign in with this exact address and open My registrations to accept. A new address replaces any open invitation.</p>
      {pending && <p className="small">Open invitation: {pending.email}. Expires {formatDateTime(pending.expiresAt)}.</p>}
      <Field label="Other guardian’s email" hint="Use their own sign-in address, not the junior’s viewer email.">
        {(id, description) => <input id={id} aria-describedby={description} className="input" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required maxLength={254} disabled={busy} />}
      </Field>
      <button className="btn btn--primary" type="submit" disabled={busy || !email.trim()}>{busy ? 'Saving…' : 'Record guardian invitation'}</button>
    </form>}
    {pending && <button className="btn btn--secondary" type="button" disabled={busy} onClick={() => void run(() => api.cancelJuniorGuardianInvitation(junior.id, pending.id), `Invitation for ${pending.email} cancelled. It grants no access.`)}>Cancel invitation for {pending.email}</button>}
    {invitations && invitations.length > 0 && <details><summary>Guardian invitation history</summary><ul className="orders">{invitations.map((i) => <li key={i.id}>
      <p>{i.email}: {i.status}{i.cancellationReason ? ` (${i.cancellationReason.replaceAll('_', ' ')})` : ''}.</p>
      <p className="small muted">Created {formatDateTime(i.createdAt)}. Original expiry {formatDateTime(i.expiresAt)}.{i.acceptedAt ? ` Accepted ${formatDateTime(i.acceptedAt)}.` : ''}{i.cancelledAt ? ` Cancelled ${formatDateTime(i.cancelledAt)}.` : ''}</p>
    </li>)}</ul></details>}
    {relationships?.some((g) => g.revokedAt) && <details><summary>Guardian relationship history</summary><ul className="orders">{relationships.filter((g) => g.revokedAt).map((g) => <li key={g.id}>
      <p>{g.email}: access ended {formatDateTime(g.revokedAt!)}.</p>
      <p className="small">{g.removalReason ?? 'No explicit removal reason recorded (historical or merged relationship).'}{g.removalAcknowledgedAt ? ` Acknowledged ${formatDateTime(g.removalAcknowledgedAt)}.` : ''}</p>
    </li>)}</ul></details>}
  </section>;
}
