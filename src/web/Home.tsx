import { useState, type FormEvent } from 'react';
import { formatDate } from '../shared/format';
import type { Template } from '../shared/schema';
import { api, ApiError } from './api';
import { href, navigate } from './App';
import { TIME_ZONES } from './format';
import { useLoad } from './useLoad';
import { Field, Icon, Pending, ThemeToggle } from './ui';
import { AccountMenu } from './auth';
import { TeamPanel } from './Team';
import { can, ROLE_LABELS, type Role } from '../shared/roles';

const TEMPLATE_LABELS: Record<Template, { title: string; detail: string }> = {
  weekend: { title: 'Two-day weekend', detail: 'Saturday road race and Sunday criterium' },
  road_race: { title: 'Road race', detail: 'One race day, distance and laps' },
  criterium: { title: 'Criterium', detail: 'One race day, minutes plus laps' },
};

export function Home() {
  const { data: orgs, error, setError, reload: load } = useLoad(() => api.organizations(), []);
  const [busy, setBusy] = useState(false);

  async function loadDemo(which: 'omnium' | 'example') {
    setBusy(true);
    try {
      const { eventId } = await (which === 'omnium' ? api.createOmnium() : api.createDemo());
      navigate({ page: 'event', eventId, view: 'race', raceId: null });
    } catch (e) {
      setError((e as ApiError).message);
      setBusy(false);
    }
  }

  return (
    <div className="home">
      <header className="home__bar">
        <span className="brand">CycleReg</span>
        <span className="home__bar-note">Organizer workspace</span>
        <ThemeToggle />
        <AccountMenu />
      </header>
      <main className="home__main">
        <section className="home__intro">
          <h1>Build a race schedule riders can enter correctly</h1>
          <p>
            Set up road race and criterium categories, combine them into start groups, set shared field limits, and check the rider-facing schedule before you
            publish. Your organization's owner decides who on the team can change what.
          </p>
          <ul className="pending-list" aria-label="Not connected yet">
            <li>
              <Pending>USA Cycling license checks: not connected</Pending>
            </li>
            <li>
              <Pending>Payments: simulated or Stripe test mode only, no real money moves</Pending>
            </li>
            <li>
              <Pending>Sign-in: emailed code or link only. Multi-factor sign-in for organizers is not built yet, so use fictional data only</Pending>
            </li>
          </ul>
        </section>

        {error && (
          <p className="alert alert--error" role="alert">
            {error}
          </p>
        )}

        <section className="home__grid">
          <div className="home__col">
            <h2>Your organizations</h2>
            {orgs === null && !error && <div className="skeleton" aria-label="Loading organizations" />}
            {orgs?.length === 0 && (
              <div className="empty">
                <p>
                  <strong>You are not on any organization's team yet.</strong> Create your club on the right, or load the Berkeley Omnium to see a full elite,
                  masters, women's, junior, and collegiate schedule. If a club added you, sign in with the email they used.
                </p>
              </div>
            )}
            {orgs?.map((org) => (
              <article className="org" key={org.id}>
                <div className="org__head">
                  <h3>{org.name}</h3>
                  <span className="org__roles">
                    {org.roles.map((r) => (
                      <span className="tag" key={r}>
                        {ROLE_LABELS[r]}
                      </span>
                    ))}
                  </span>
                </div>
                {org.events.length === 0 ? (
                  <p className="muted">No events yet.</p>
                ) : (
                  <ul className="event-list">
                    {org.events.map((ev) => (
                      <li key={ev.id}>
                        <a className="event-link" href={eventHref(ev.id, org.roles)}>
                          <span className="event-link__name">
                            {ev.name}
                            {ev.isDemo && <span className="tag tag--demo">Example data</span>}
                          </span>
                          <span className="event-link__meta">
                            {ev.firstDay ? formatDate(ev.firstDay) : 'No date'} · {ev.raceCount} {ev.raceCount === 1 ? 'race' : 'races'} · {ev.categoryCount}{' '}
                            {ev.categoryCount === 1 ? 'category' : 'categories'} ·{' '}
                            {ev.publishedVersion ? `Published v${ev.publishedVersion}${ev.hasUnpublishedChanges ? ', draft has changes' : ''}` : 'Draft'}
                          </span>
                        </a>
                      </li>
                    ))}
                  </ul>
                )}
                {can(org.roles, 'event.edit') && <CreateEvent orgId={org.id} onError={setError} />}
                {can(org.roles, 'members.manage') && <TeamPanel orgId={org.id} orgName={org.name} />}
              </article>
            ))}
          </div>

          <aside className="home__col home__col--side">
            <CreateOrganization onCreated={load} onError={setError} />
            <div className="demo-callout">
              <h2>Load the Berkeley Omnium</h2>
              <p>
                The Berkeley Hills Road Race and Berkeley Streets Criterium, with every field, distance, start time and field limit from the 2026 race information, dated
                for April 17–18, 2027. Entry fees are placeholders and entries are simulated.
              </p>
              <button className="btn btn--secondary" onClick={() => loadDemo('omnium')} disabled={busy}>
                {busy ? 'Creating…' : 'Load Berkeley Omnium'}
              </button>
              <p>
                Or try a{' '}
                <button className="link-btn" onClick={() => loadDemo('example')} disabled={busy}>
                  fictional example weekend
                </button>{' '}
                with 16 categories.
              </p>
            </div>
            <div className="demo-callout">
              <h2>Try rider registration</h2>
              <p>Browse events already loaded in this database. Use fictional rider details and test payments.</p>
              <button className="btn btn--secondary" onClick={() => navigate({ page: 'events' })} disabled={busy}>
                Browse rider events
              </button>
            </div>
          </aside>
        </section>
      </main>
    </div>
  );
}

/** Opens each event where the person's role does its work: the builder, check-in, or start lists. */
function eventHref(eventId: string, roles: Role[]): string {
  if (can(roles, 'event.edit')) return href({ page: 'event', eventId, view: 'race', raceId: null });
  if (can(roles, 'orders.view')) return href({ page: 'event', eventId, view: 'registrations' });
  if (can(roles, 'checkin')) return href({ page: 'checkin', eventId });
  if (can(roles, 'startlists')) return href({ page: 'event', eventId, view: 'startlists' });
  return href({ page: 'event', eventId, view: 'race', raceId: null });
}

function CreateOrganization({ onCreated, onError }: { onCreated: () => void; onError: (m: string) => void }) {
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    setBusy(true);
    try {
      await api.createOrganization(name.trim());
      setName('');
      onCreated();
    } catch (err) {
      onError((err as ApiError).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <form className="panel-form" onSubmit={submit}>
      <h2>Create an organization</h2>
      <Field label="Club or organization name">
        {(id) => <input id={id} className="input" value={name} onChange={(e) => setName(e.target.value)} placeholder="For example, Valley Bicycle Club" required maxLength={120} />}
      </Field>
      <button className="btn btn--primary" type="submit" disabled={busy || !name.trim()}>
        Create organization
      </button>
    </form>
  );
}

function CreateEvent({ orgId, onError }: { orgId: string; onError: (m: string) => void }) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState('');
  const [template, setTemplate] = useState<Template>('weekend');
  const [startDate, setStartDate] = useState('');
  const [timeZone, setTimeZone] = useState('America/Los_Angeles');
  const [venue, setVenue] = useState('');
  const [busy, setBusy] = useState(false);

  if (!open) {
    return (
      <button className="btn btn--ghost" onClick={() => setOpen(true)}>
        <Icon name="plus" /> New draft event
      </button>
    );
  }

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      const ev = await api.createEvent(orgId, { name: name.trim(), template, startDate, timeZone, venue });
      navigate({ page: 'event', eventId: ev.id, view: 'race', raceId: null });
    } catch (err) {
      onError((err as ApiError).message);
      setBusy(false);
    }
  }

  return (
    <form className="create-event" onSubmit={submit}>
      <h4>New draft event</h4>
      <fieldset className="template-pick">
        <legend>Template</legend>
        {(Object.keys(TEMPLATE_LABELS) as Template[]).map((t) => (
          <label key={t} className={`template-option ${template === t ? 'is-selected' : ''}`}>
            <input type="radio" name={`tpl-${orgId}`} value={t} checked={template === t} onChange={() => setTemplate(t)} />
            <span className="template-option__title">{TEMPLATE_LABELS[t].title}</span>
            <span className="template-option__detail">{TEMPLATE_LABELS[t].detail}</span>
          </label>
        ))}
      </fieldset>
      <div className="form-row">
        <Field label="Event name">{(id) => <input id={id} className="input" value={name} onChange={(e) => setName(e.target.value)} required maxLength={120} />}</Field>
        <Field label={template === 'weekend' ? 'First race day' : 'Race day'}>
          {(id) => <input id={id} type="date" className="input" value={startDate} onChange={(e) => setStartDate(e.target.value)} required />}
        </Field>
      </div>
      <div className="form-row">
        <Field label="Time zone">
          {(id) => (
            <select id={id} className="input" value={timeZone} onChange={(e) => setTimeZone(e.target.value)}>
              {TIME_ZONES.map((z) => (
                <option key={z}>{z}</option>
              ))}
            </select>
          )}
        </Field>
        <Field label="Venue (optional)">{(id) => <input id={id} className="input" value={venue} onChange={(e) => setVenue(e.target.value)} maxLength={200} />}</Field>
      </div>
      <div className="form-actions">
        <button className="btn btn--primary" type="submit" disabled={busy || !name.trim() || !startDate}>
          {busy ? 'Creating…' : 'Create draft'}
        </button>
        <button type="button" className="btn btn--ghost" onClick={() => setOpen(false)}>
          Cancel
        </button>
      </div>
    </form>
  );
}
