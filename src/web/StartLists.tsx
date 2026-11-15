import { useCallback, useEffect, useState } from 'react';
import { formatTime } from '../shared/format';
import { FIELD_LABELS, type StartListDiff } from '../shared/startlist';
import { api, ApiError, type StartListOverview } from './api';
import type { Draft } from './Builder';
import { Pending } from './ui';

/** Start lists per race, timestamped snapshots, and the sample timer CSV. */
export function StartLists({ draft }: { draft: Draft }) {
  const eventId = draft.data.id;
  const [data, setData] = useState<StartListOverview | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [raceId, setRaceId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  const load = useCallback(() => {
    api
      .startLists(eventId)
      .then((d) => {
        setData(d);
        setError(null);
      })
      .catch((e: ApiError) => setError(e.message));
  }, [eventId]);
  useEffect(load, [load]);

  const race = data?.races.find((r) => r.raceId === raceId) ?? data?.races[0] ?? null;

  async function snapshot() {
    if (!race) return;
    setBusy(true);
    try {
      const s = await api.snapshotStartList(eventId, race.raceId);
      setNotice(`Saved snapshot v${s.version} of ${race.raceName} with ${s.riders} ${s.riders === 1 ? 'rider' : 'riders'}.`);
      load();
    } catch (e) {
      setError((e as ApiError).message);
    } finally {
      setBusy(false);
    }
  }

  async function lock() {
    if (!race) return;
    setBusy(true);
    try {
      const l = await api.lockStartList(eventId, race.raceId);
      setNotice(`Locked ${race.raceName} at snapshot v${l.version} (${l.riders} ${l.riders === 1 ? 'rider' : 'riders'}). Send that version to the timer; later changes show below as revisions.`);
      load();
    } catch (e) {
      setError((e as ApiError).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="settings settings--wide">
      <h2 className="page-title">Start lists and timer export</h2>
      <p className="lede">Confirmed entries per race, in start order, with bibs from check-in. Save a snapshot when you send a list to the timer; later changes show against it.</p>
      <div className="pending-stack">
        <Pending>Sample CSV format for discussion with the timer and officials. It is not an agreed format and has not been round-tripped through timing software.</Pending>
      </div>

      {error && (
        <p className="text-error" role="alert">
          {error}
        </p>
      )}

      {data && race && (
        <>
          {data.races.length > 1 && (
            <div className="segmented sl-races" role="radiogroup" aria-label="Race">
              {data.races.map((r) => (
                <label key={r.raceId} className={`segmented__opt ${r.raceId === race.raceId ? 'is-on' : ''}`}>
                  <input
                    type="radio"
                    name="sl-race"
                    checked={r.raceId === race.raceId}
                    onChange={() => {
                      setRaceId(r.raceId);
                      setNotice(null);
                    }}
                  />
                  {r.raceName}
                </label>
              ))}
            </div>
          )}

          <div className="sl-actions">
            <a className="btn btn--primary" href={api.startListCsvUrl(eventId, race.raceId)} download>
              Download {race.raceName} CSV
            </a>
            <button type="button" className="btn btn--secondary" onClick={snapshot} disabled={busy}>
              Save snapshot
            </button>
            <button type="button" className="btn btn--secondary" onClick={lock} disabled={busy}>
              {race.lock ? 'Lock again at current list' : 'Lock start list'}
            </button>
            {data.races.length > 1 && (
              <a className="btn btn--ghost" href={api.startListCsvUrl(eventId, 'all')} download>
                All races in one CSV
              </a>
            )}
          </div>
          {notice && (
            <p className="small text-ok" role="status">
              {notice}
            </p>
          )}

          {race.lock && (
            <div className="note" role="status">
              <span>
              <strong>Locked</strong> at snapshot v{race.lock.snapshotVersion} on {new Date(race.lock.lockedAt).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' })}.{' '}
              <a href={api.startListCsvUrl(eventId, race.raceId, race.lock.snapshotVersion)} download>
                Download the locked list
              </a>
              . Changes are still allowed; each one appears below as a revision for the timer.
              {race.changesSinceLock && summary(race.changesSinceLock) === 'no changes' && ' No revisions yet.'}
              </span>
            </div>
          )}
          {race.lock && race.changesSinceLock && summary(race.changesSinceLock) !== 'no changes' && (
            <Changes title={`Revisions since the lock (v${race.lock.snapshotVersion})`} diff={race.changesSinceLock} />
          )}
          {race.changesSinceLastSnapshot && race.snapshots[0] && (!race.lock || race.snapshots[0].version !== race.lock.snapshotVersion) && (
            <Changes title={`Changes since snapshot v${race.snapshots[0].version}`} diff={race.changesSinceLastSnapshot} />
          )}

          <h3 className="sl-subhead">
            {race.raceName} · {race.rows.length} {race.rows.length === 1 ? 'rider' : 'riders'}
          </h3>
          {race.rows.length === 0 ? (
            <p className="note">No confirmed entries in this race yet.</p>
          ) : (
            <div className="table-wrap" role="region" aria-label={`${race.raceName} start list`} tabIndex={0}>
              <table className="mini-table sl-table">
                <thead>
                  <tr>
                    <th scope="col">Start</th>
                    <th scope="col">Code</th>
                    <th scope="col">Category</th>
                    <th scope="col">Length</th>
                    <th scope="col">Bib</th>
                    <th scope="col">Rider</th>
                    <th scope="col">Team</th>
                    <th scope="col">License</th>
                    <th scope="col">Checked in</th>
                  </tr>
                </thead>
                <tbody>
                  {race.rows.map((r) => (
                    <tr key={r.entryId}>
                      <td className="sl-num">{formatTime(r.startTime)}</td>
                      <td>
                        <code>{r.classificationCode}</code>
                      </td>
                      <td>{r.categoryName}</td>
                      <td>{r.raceLength}</td>
                      <td className="sl-num">{r.bib ?? <span className="muted">none</span>}</td>
                      <td>
                        {r.lastName}, {r.firstName}
                      </td>
                      <td>{r.team || <span className="muted">none</span>}</td>
                      <td>{r.licenseStatus === 'reviewed' ? 'Reviewed' : <span className="sl-review">Needs review</span>}</td>
                      <td>{r.checkedIn ? 'Yes' : 'No'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          <h3 className="sl-subhead">Snapshots</h3>
          {race.snapshots.length === 0 ? (
            <p className="note">No snapshots yet. Save one when you send this list to the timer.</p>
          ) : (
            <ul className="sl-snaps">
              {race.snapshots.map((s) => (
                <li key={s.version}>
                  <div>
                    <strong>v{s.version}</strong> · {new Date(s.createdAt).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' })} · {s.riders} {s.riders === 1 ? 'rider' : 'riders'}
                    <span className="muted small"> · schedule version {s.publishedVersion}</span>
                    {s.changesFromPrevious && <span className="small"> · {summary(s.changesFromPrevious)} from v{s.version - 1}</span>}
                  </div>
                  <a className="btn btn--ghost btn--small" href={api.startListCsvUrl(eventId, race.raceId, s.version)} download>
                    Download v{s.version}
                  </a>
                </li>
              ))}
            </ul>
          )}
        </>
      )}
    </div>
  );
}

function summary(d: StartListDiff): string {
  const parts = [d.added.length && `${d.added.length} added`, d.removed.length && `${d.removed.length} removed`, d.changed.length && `${d.changed.length} changed`].filter(Boolean);
  return parts.length ? parts.join(', ') : 'no changes';
}

function Changes({ title, diff }: { title: string; diff: StartListDiff }) {
  const none = !diff.added.length && !diff.removed.length && !diff.changed.length;
  return (
    <section className={`sl-changes ${none ? 'is-none' : ''}`} aria-label={title}>
      <h3>{title}</h3>
      {none ? (
        <p className="small">No changes. The timer's copy is current.</p>
      ) : (
        <ul>
          {diff.added.map((r) => (
            <li key={`a${r.entryId}`}>
              <strong>Added</strong> {r.firstName} {r.lastName} · {r.classificationCode}
              {r.bib !== null ? ` · bib ${r.bib}` : ''}
            </li>
          ))}
          {diff.removed.map((r) => (
            <li key={`r${r.entryId}`}>
              <strong>Removed</strong> {r.firstName} {r.lastName} · {r.classificationCode}
              {r.bib !== null ? ` · bib ${r.bib}` : ''}
            </li>
          ))}
          {diff.changed.map((c) => (
            <li key={`c${c.after.entryId}`}>
              <strong>Changed</strong> {c.after.firstName} {c.after.lastName}: {c.fields.map((f) => `${FIELD_LABELS[f] ?? f} ${String(c.before[f] ?? 'none')} → ${String(c.after[f] ?? 'none')}`).join('; ')}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
