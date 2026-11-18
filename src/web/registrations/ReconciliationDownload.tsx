import { useRef, useState } from 'react';
import { downloadFile } from '../api';

export function ReconciliationDownload({ eventId }: { eventId: string }) {
  const inFlight = useRef(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [requested, setRequested] = useState(false);
  const download = async () => {
    if (inFlight.current) return;
    inFlight.current = true;
    setBusy(true); setError(null); setRequested(false);
    try { await downloadFile(`/api/events/${eventId}/exports/reconciliation.csv`); setRequested(true); }
    catch (e) { setError(e instanceof Error ? e.message : 'Download failed.'); }
    finally { inFlight.current = false; setBusy(false); }
  };
  return <section className="settings__section" aria-labelledby="reconciliation-records-title">
    <h3 id="reconciliation-records-title">Local reconciliation records</h3>
    <p className="small">All linked payment attempts, checkout sessions, provider events and refunds for this event, including expired or cancelled orders. Registration search and filters do not narrow this file.</p>
    <p className="small" id="reconciliation-records-limits"><strong>Local evidence only.</strong> Provider settlement and payout matching are not included. Source kinds may describe the same payment: do not sum amounts across kinds or add the repeated order totals. Blank amounts mean unknown. Sessions do not prove money received, and requested or pending refunds do not prove money returned.</p>
    <button type="button" className="btn btn--secondary btn--small reconciliation-download__button" aria-describedby="reconciliation-records-limits" aria-disabled={busy || undefined} aria-busy={busy || undefined} onClick={download}>{busy ? 'Preparing CSV…' : 'Download local records (CSV)'}</button>
    <p className="small" role="status">{busy ? 'Preparing local records…' : requested ? 'Download requested. Check your browser downloads.' : ''}</p>
    {error && <p className="field__error" role="alert">{error} Refresh this page to check your access.</p>}
  </section>;
}
