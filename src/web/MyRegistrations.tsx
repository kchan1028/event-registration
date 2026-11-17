import { useState, type FormEvent } from 'react';
import type { JuniorProfile } from '../shared/juniors';
import { api, ApiError } from './api';
import { AccountMenu } from './auth';
import { GuardianInvitations } from './GuardianInvitations';
import { href } from './App';
import { formatDateTime } from './format';
import { Field, ThemeToggle } from './ui';
import { useLoad } from './useLoad';
import { GuardianManagement } from './GuardianManagement';

const STATUS_LABEL: Record<string, string> = {
  held: 'Places held, not paid',
  payment_failed: 'Payment failed',
  confirmed: 'Confirmed',
  expired: 'Hold expired',
  cancelled: 'Cancelled',
  needs_attention: 'Paid, waiting for the organizer',
};

/**
 * The signed-in person's registrations, including approved claimed profiles, and the juniors they manage as guardian. A junior's own
 * login (named by the guardian) sees that junior's registrations here, read-only.
 */
export function MyRegistrations() {
  const { data: orders, error, setData: setOrders, setError: setOrdersError } = useLoad(() => api.myRegistrations(), []);
  const { data: juniors, setData: setJuniors } = useLoad(() => api.juniors(), []);
  return (
    <div className="home">
      <header className="home__bar">
        <a className="brand" href={href({ page: 'home' })}>
          CycleReg
        </a>
        <span className="home__bar-note">My registrations</span>
        <ThemeToggle />
        <AccountMenu />
      </header>
      <main className="home__main settings">
        <h1 className="page-title">My registrations</h1>
        {error && (
          <p className="alert alert--error" role="alert">
            {error}
          </p>
        )}
        {!orders && !error && <div className="skeleton" aria-label="Loading registrations" />}
        {orders && orders.length === 0 && (
          <div className="empty">
            <p>
              No registrations yet. <a href={href({ page: 'events' })}>Find an event</a>.
            </p>
          </div>
        )}
        {orders && orders.length > 0 && (
          <ul className="orders" aria-label="Your registrations">
            {orders.map((o) => (
              <li key={o.id} className="my-reg">
                <a href={href({ page: 'order', orderId: o.id })} className="my-reg__link">
                  <span className="my-reg__event">{o.eventName}</span>
                  <span className="muted small">
                    {o.rider.firstName} {o.rider.lastName} · {o.orderNumber} · <time dateTime={o.createdAt}>{formatDateTime(o.createdAt)}</time>
                  </span>
                </a>
                <span className="tag">{STATUS_LABEL[o.status] ?? o.status}</span>
                {!o.placedByYou && <span className="muted small">{o.canManage ? 'Registered by another account' : 'Registered by your guardian'}</span>}
              </li>
            ))}
          </ul>
        )}
        <GuardianInvitations
          onAccepted={async (list) => { const currentOrders = await api.myRegistrations(); setJuniors(list); setOrders(currentOrders); setOrdersError(null); }}
          onRefresh={async () => { const [currentJuniors, currentOrders] = await Promise.all([api.juniors(), api.myRegistrations()]); setJuniors(currentJuniors); setOrders(currentOrders); setOrdersError(null); }}
        />
        {juniors && juniors.length > 0 && (
          <section className="settings__section" aria-labelledby="juniors-title">
            <h2 id="juniors-title">Juniors you manage</h2>
            <p className="muted small">
              Juniors you are authorized to manage appear here. To let a junior check their own registrations, add the email they sign in with; they can look but not pay, cancel, or change anything.
            </p>
            <ul className="orders">
              {juniors.map((j) => (
                <JuniorRow key={j.id} junior={j} onChange={setJuniors} />
              ))}
            </ul>
          </section>
        )}
      </main>
    </div>
  );
}

function JuniorRow({ junior, onChange }: { junior: JuniorProfile; onChange: (list: JuniorProfile[]) => void }) {
  const [email, setEmail] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const save = async (next: string | null) => {
    setBusy(true);
    setErr(null);
    try {
      onChange(await api.setJuniorViewer(junior.id, next));
      setEmail('');
    } catch (e) {
      setErr((e as ApiError).message);
    } finally {
      setBusy(false);
    }
  };
  const submit = (e: FormEvent) => {
    e.preventDefault();
    void save(email.trim());
  };
  return (
    <li className="my-junior">
      <strong>
        {junior.firstName} {junior.lastName}
      </strong>
      {junior.viewerEmail ? (
        <p className="small">
          {junior.viewerEmail} can see {junior.firstName}’s registrations.{' '}
          <button className="link-btn" type="button" disabled={busy} onClick={() => save(null)}>
            Stop sharing<span className="sr-only"> with {junior.viewerEmail}</span>
          </button>
        </p>
      ) : (
        <form className="team__add" onSubmit={submit}>
          <Field label={`${junior.firstName}’s email (optional)`} hint="They sign in with this email to see their registrations.">
            {(id, d) => <input id={id} aria-describedby={d} className="input" type="email" value={email} onChange={(e) => setEmail(e.target.value)} maxLength={254} required />}
          </Field>
          <button className="btn btn--secondary" type="submit" disabled={busy || !email.trim()}>
            Let {junior.firstName} see their registrations
          </button>
        </form>
      )}
      <GuardianManagement junior={junior} />
      {err && (
        <p className="alert alert--error" role="alert">
          {err}
        </p>
      )}
    </li>
  );
}
