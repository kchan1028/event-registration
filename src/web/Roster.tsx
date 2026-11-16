import { useEffect, useState } from 'react';
import { formatDate, formatTime } from '../shared/format';
import { buildRoster, type RosterRow } from '../shared/roster';
import { api, ApiError, type CheckInList } from './api';
import { href } from './App';
import { formatDateTime } from './format';
import { Icon } from './ui';

/**
 * Printable race-day fallback roster and exception checklist, one race day per
 * printed section. For when check-in cannot be restored quickly; it is a
 * snapshot, so each day shows its timestamp and recording limits. No contact, license, or payment details.
 */
export function Roster({ eventId }: { eventId: string }) {
  const [days, setDays] = useState<CheckInList[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [printedAt] = useState(() => new Date());

  useEffect(() => {
    let live = true;
    (async () => {
      try {
        const first = await api.checkInList(eventId, null, '');
        const rest = await Promise.all(first.days.filter((d) => d.id !== first.dayId).map((d) => api.checkInList(eventId, d.id, '')));
        const all = [first, ...rest].sort((a, b) => first.days.findIndex((d) => d.id === a.dayId) - first.days.findIndex((d) => d.id === b.dayId));
        if (live) setDays(all);
      } catch (e) {
        if (live) setError((e as ApiError).message);
      }
    })();
    return () => {
      live = false;
    };
  }, [eventId]);

  const stamp = formatDateTime(printedAt);

  return (
    <div className="roster">
      <header className="roster__bar no-print">
        <a className="btn btn--ghost btn--small" href={href({ page: 'checkin', eventId })}>
          <Icon name="arrow-left" /> Check-in
        </a>
        <p className="roster__bar-note">Print this before race morning and keep it at the registration desk. It shows the list as of {stamp}.</p>
        <button type="button" className="btn btn--primary btn--small" onClick={() => window.print()} disabled={!days}>
          Print roster
        </button>
      </header>

      {error && (
        <p className="ci__error" role="alert">
          {error}
        </p>
      )}
      {!days && !error && <div className="skeleton skeleton--page" />}

      {days?.map((d, i) => {
        const day = d.days.find((x) => x.id === d.dayId);
        const roster = buildRoster(d.riders);
        const title = `${d.eventName} · ${day ? formatDate(day.date) : 'Race day'}`;
        return (
          <section key={d.dayId} className={`roster__day ${i > 0 ? 'roster__day--break' : ''}`} aria-label={`Roster for ${day?.label ?? 'race day'}`}>
            <header className="roster__head">
              <h1>{title}</h1>
              <p className="roster__stamp">
                Fallback roster printed {stamp}. Changes after this time are not shown.
              </p>
              <p className="roster__hint">
                <strong>Reference only.</strong> This snapshot does not authorize offline registration, payment, waiver clearance or check-in.
                Paper bib issuance requires an approved event contingency. Without one, pause issuance and contact the registration lead.
                After service returns, the lead must reconcile notes with current records before normal issuance resumes.
              </p>
              {d.isDemo && <p className="roster__demo">Example data: fictional riders.</p>}
              <p className="roster__counts">
                {roster.counts.riders} riders · {roster.counts.checkedIn} checked in · {roster.counts.ready} ready · {roster.counts.blocked} not ready
              </p>
            </header>

            {roster.rows.length === 0 ? (
              <p>No registered riders for this day.</p>
            ) : (
              <div className="roster__scroll" role="region" aria-label={`Riders, ${day?.label ?? 'race day'}`} tabIndex={0}>
              <table className="roster__table">
                <thead>
                  <tr>
                    <th scope="col">Rider</th>
                    <th scope="col">Team</th>
                    <th scope="col" className="roster__num">Age</th>
                    <th scope="col">Races</th>
                    <th scope="col">Snapshot status</th>
                    <th scope="col" className="roster__bib">Recorded bib</th>
                  </tr>
                </thead>
                <tbody>
                  {roster.rows.map((r) => (
                    <tr key={r.orderId} className={r.status === 'blocked' ? 'is-blocked' : undefined}>
                      <td className="roster__name">{r.name}</td>
                      <td>{r.team || '·'}</td>
                      <td className="roster__num">{r.racingAge}</td>
                      <td>
                        {r.entries.map((e) => (
                          <span key={e.code} className="roster__race">
                            {formatTime(e.startTime)} <code>{e.code}</code> {e.categoryName}
                          </span>
                        ))}
                      </td>
                      <td>
                        <Status row={r} />
                      </td>
                      <td className="roster__bib">{r.bib ?? 'Not assigned'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              </div>
            )}

            <h2 className="roster__sub">Exception checklist</h2>
            {roster.exceptions.length === 0 ? (
              <p>No riders are blocked for this day.</p>
            ) : (
              <>
                <p className="roster__hint">Do not issue a bib while requirements remain unresolved. Send these riders to the registration desk for review by the registration lead; notes on this sheet do not clear requirements.</p>
                <table className="roster__table">
                  <thead>
                    <tr>
                      <th scope="col">Rider</th>
                      <th scope="col">What is missing</th>
                      <th scope="col">What to do</th>
                      <th scope="col" className="roster__resolve">Lead review notes</th>
                    </tr>
                  </thead>
                  <tbody>
                    {roster.exceptions.map((r) => (
                      <tr key={r.orderId}>
                        <td className="roster__name">{r.name}</td>
                        <td>{r.blockers.map((b) => b.label).join('; ')}</td>
                        <td>{[...new Set(r.blockers.map((b) => b.action))].join(' ')}</td>
                        <td className="roster__resolve" />
                      </tr>
                    ))}
                  </tbody>
                </table>
              </>
            )}

            <h2 className="roster__sub">Riders not on this list</h2>
            <p className="roster__hint">Send riders to the registration lead. Record lookup questions only; adding a name here does not create an entry, reserve capacity or authorize a bib.</p>
            <table className="roster__table roster__table--blank">
              <thead>
                <tr>
                  <th scope="col">Rider</th>
                  <th scope="col">Race</th>
                  <th scope="col">Question for registration lead</th>
                </tr>
              </thead>
              <tbody>
                {Array.from({ length: 6 }, (_, k) => (
                  <tr key={k}>
                    <td />
                    <td />
                    <td />
                  </tr>
                ))}
              </tbody>
            </table>
          </section>
        );
      })}
    </div>
  );
}

function Status({ row }: { row: RosterRow }) {
  if (row.status === 'checked_in') return <>Checked in</>;
  if (row.status === 'ready') return <>Ready</>;
  return (
    <strong className="roster__blocked">
      NOT READY: {row.blockers.map((b) => b.label).join('; ')}. Do not issue a bib.
    </strong>
  );
}
