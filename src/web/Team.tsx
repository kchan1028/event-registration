import { useEffect, useState, type FormEvent } from 'react';
import { ROLE_LABELS, ROLES, type Role } from '../shared/roles';
import { api, ApiError, type MemberList } from './api';
import { Field } from './ui';

const ROLE_HELP: Record<Role, string> = {
  owner: 'Everything, including who is on the team',
  registration_manager: 'Event setup, publishing, registrations, check-in, start lists',
  check_in_volunteer: 'Race-day check-in and bibs only',
  timer_export: 'Start lists and the entries export',
  finance: 'Registrations and the ledger export',
};

/**
 * People and roles for one organization. Owners only; the server refuses everyone else.
 * Adding an email that has never signed in records an invitation that becomes a role the
 * first time that person signs in with the same email.
 */
export function TeamPanel({ orgId, orgName }: { orgId: string; orgName: string }) {
  const [open, setOpen] = useState(false);
  const [list, setList] = useState<MemberList | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [email, setEmail] = useState('');
  const [role, setRole] = useState<Role>('check_in_volunteer');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (open && !list) api.members(orgId).then(setList).catch((e: ApiError) => setError(e.message));
  }, [open, list, orgId]);

  async function run(action: () => Promise<MemberList>) {
    setBusy(true);
    setError(null);
    try {
      setList(await action());
      return true;
    } catch (e) {
      setError((e as ApiError).message);
      return false;
    } finally {
      setBusy(false);
    }
  }

  async function add(e: FormEvent) {
    e.preventDefault();
    if (await run(() => api.addMember(orgId, email.trim(), role))) setEmail('');
  }

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
      {!list && !error && <div className="skeleton" aria-label="Loading team" />}
      {list && (
        <ul className="team__list">
          {list.members.map((m) => (
            <li key={`${m.accountId}-${m.role}`}>
              <span className="team__email">{m.email}</span>
              <span className="tag">{ROLE_LABELS[m.role]}</span>
              <button className="link-btn" type="button" disabled={busy} onClick={() => run(() => api.removeMember(orgId, m.email, m.role))}>
                Remove<span className="sr-only">
                  {' '}
                  {ROLE_LABELS[m.role]} role from {m.email}
                </span>
              </button>
            </li>
          ))}
          {list.invitations.map((i) => (
            <li key={`invite-${i.email}-${i.role}`}>
              <span className="team__email">{i.email}</span>
              <span className="tag">{ROLE_LABELS[i.role]}</span>
              <span className="muted small">Not signed in yet</span>
              <button className="link-btn" type="button" disabled={busy} onClick={() => run(() => api.removeMember(orgId, i.email, i.role))}>
                Cancel<span className="sr-only"> invitation for {i.email}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
      <form className="team__add" onSubmit={add}>
        <Field label="Email" hint="They sign in with this email to get the role.">
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
        <button className="btn btn--secondary" type="submit" disabled={busy || !email.trim()}>
          Add to team
        </button>
      </form>
    </section>
  );
}
