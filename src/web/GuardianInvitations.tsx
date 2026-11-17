import { useEffect, useRef, useState, type FormEvent } from 'react';
import type { JuniorProfile, ReceivedGuardianInvitation } from '../shared/juniors';
import { api, type ApiError } from './api';
import { formatDateTime } from './format';
import { useLoad } from './useLoad';

/** Invited recipients explicitly accept before any junior orders are loaded for them. */
export function GuardianInvitations({ onAccepted }: { onAccepted: (list: JuniorProfile[]) => void }) {
  const { data, error, reload, setError } = useLoad(() => api.guardianInvitations(), []);
  const [message, setMessage] = useState('');
  const status = useRef<HTMLParagraphElement>(null);
  useEffect(() => { if (message) status.current?.focus(); }, [message]);
  return <section className="settings__section" aria-labelledby="guardian-invitations-title">
    <h2 id="guardian-invitations-title">Guardian invitations</h2>
    <p className="small muted">Accept only if you are authorized to manage this junior’s registrations. Signing in alone does not give access.</p>
    <p role="status" tabIndex={-1} ref={status}>{message}</p>
    {error && <p className="alert alert--error" role="alert">Could not load guardian invitations. {error}</p>}
    <button className="btn btn--secondary" type="button" onClick={() => { setError(null); reload(); }}>Refresh guardian invitations</button>
    {!data && !error && <p role="status">Loading guardian invitations…</p>}
    {data?.length === 0 && <p className="small">No open invitations for this signed-in email. Ask a current guardian to invite the email you use here.</p>}
    {data && data.length > 0 && <ul className="orders" aria-label="Pending guardian invitations">
      {data.map((invitation) => <Invitation key={invitation.id} invitation={invitation} onAccepted={(list) => {
        onAccepted(list);
        setMessage(`Guardian access accepted for ${invitation.firstName} ${invitation.lastName}. The registrations list has been refreshed.`);
        reload();
      }} />)}
    </ul>}
  </section>;
}

function Invitation({ invitation, onAccepted }: { invitation: ReceivedGuardianInvitation; onAccepted: (list: JuniorProfile[]) => void }) {
  const [acknowledge, setAcknowledge] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const name = `${invitation.firstName} ${invitation.lastName}`;
  const accept = async (event: FormEvent) => {
    event.preventDefault();
    if (!acknowledge || busy) return;
    setBusy(true); setError(null);
    try { onAccepted(await api.acceptGuardianInvitation(invitation.id)); }
    catch (e) { setError(`${(e as ApiError).message} Refresh invitations to check the current status. If needed, ask a current guardian for a new invitation.`); }
    finally { setBusy(false); }
  };
  return <li className="my-junior">
    <h3>{name}</h3>
    <p className="small">Invited by {invitation.invitedByEmail}. Expires <time dateTime={invitation.expiresAt}>{formatDateTime(invitation.expiresAt)}</time>.</p>
    <form className="guardian-invitation" onSubmit={accept} aria-label={`Accept guardian access for ${name}`}>
      <label className="check"><input type="checkbox" checked={acknowledge} onChange={(e) => setAcknowledge(e.target.checked)} disabled={busy} required />
        <span>I am authorized to manage {name}’s registrations and accept guardian access.</span>
      </label>
      <button className="btn btn--primary" type="submit" disabled={busy || !acknowledge}>{busy ? 'Accepting guardian access…' : `Accept guardian access for ${name}`}</button>
    </form>
    {error && <p className="alert alert--error" role="alert">{error}</p>}
  </li>;
}
