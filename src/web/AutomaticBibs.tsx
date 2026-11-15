import { useEffect, useRef, useState, type FormEvent } from 'react';
import type { AutomaticBibInput, AutomaticBibJob } from '../shared/checkin';
import { api, type ApiError } from './api';

export function AutomaticBibs({ eventId }: { eventId: string }) {
  const statusRef = useRef<HTMLParagraphElement>(null);
  const [jobs, setJobs] = useState<AutomaticBibJob[] | null>(null);
  const [sort, setSort] = useState<AutomaticBibInput['sort']>('name');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  useEffect(() => {
    let ignore = false;
    api.automaticBibs(eventId).then((result) => {
      if (!ignore) {
        setJobs(result);
        setSort(result.find((j) => !j.completedAt && !j.cancelledAt)?.sort ?? 'name');
      }
    }).catch((err: ApiError) => { if (!ignore) setError(err.message); });
    return () => { ignore = true; };
  }, [eventId]);

  async function refresh() {
    setBusy(true);
    setError('');
    try { setJobs(await api.automaticBibs(eventId)); }
    catch (err) { setError((err as ApiError).message); }
    finally { setBusy(false); }
  }

  async function save(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError('');
    setMessage('');
    try {
      await api.enableAutomaticBibs(eventId, { sort });
      setJobs(null);
      setMessage('After-close automatic assignment enabled.');
      statusRef.current?.focus();
    } catch (err) {
      setError((err as ApiError).message);
      setBusy(false);
      return;
    }
    await refresh();
  }

  async function cancel() {
    setBusy(true);
    setError('');
    setMessage('');
    try {
      await api.disableAutomaticBibs(eventId);
      setJobs(null);
      setMessage('Pending automatic assignment cancelled. Existing bibs are unchanged.');
      statusRef.current?.focus();
    } catch (err) {
      setError((err as ApiError).message);
      setBusy(false);
      return;
    }
    await refresh();
  }

  const active = jobs?.find((j) => !j.completedAt && !j.cancelledAt);
  const latest = jobs?.[0];
  return <section className="ci-bibs ci-automatic" aria-label="Automatic bib assignment">
    <h2>Assign automatically after registration closes</h2>
    <p>Opt in to a single allocation of confirmed, unassigned riders after every published category closes and outstanding checkout holds settle or expire. Existing bibs and checked-in riders stay unchanged. This does not clear readiness or hand over a bib.</p>
    <p ref={statusRef} tabIndex={-1} role="status">{!jobs ? error ? 'Automatic assignment status is unavailable.' : 'Loading automatic assignment status…' : active ? 'Enabled: waiting for allocation to complete.' : latest?.completedAt ? `Completed: ${latest.assigned} numbers assigned. Later walk-ups use normal check-in assignment.` : 'Automatic assignment is off.'}</p>
    {jobs && <>
      {active?.message && <p className="ci__notice" role="status">{active.message}</p>}
      <form onSubmit={save}>
        <fieldset disabled={busy}>
          <legend>Automatic allocation order</legend>
          <label>Sort riders<select className="input" value={sort} onChange={(e) => setSort(e.target.value as AutomaticBibInput['sort'])}>
            <option value="name">Surname, then given name</option>
            <option value="registration">Registration time</option>
            <option value="start">Category / start order</option>
          </select></label>
        </fieldset>
        <div className="ci-bib__actions">
          <button className="btn btn--primary" type="submit" disabled={busy}>{active ? 'Replace pending automatic assignment' : 'Enable after-close assignment'}</button>
          {active && <button className="btn btn--secondary" type="button" disabled={busy} onClick={() => void cancel()}>Cancel automatic assignment</button>}
        </div>
      </form>
      {active && <p className="muted small">The running server checks once a minute. Closing the browser does not cancel this job. Refresh status to see progress.</p>}
    </>}
    <button className="btn btn--ghost" type="button" disabled={busy} onClick={() => void refresh()}>{busy ? 'Working…' : 'Refresh automatic status'}</button>
    {message && <p className="text-ok" role="status">{message}</p>}
    {error && <p className="text-error" role="alert">{error} Refresh status before trying again.</p>}
  </section>;
}
