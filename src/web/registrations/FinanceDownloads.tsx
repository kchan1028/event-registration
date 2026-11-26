import { useRef, useState } from 'react';
import { downloadFile } from '../api';

const financeSummary = {
  id: 'finance-summary',
  title: 'Finance summary',
  description: 'Event-wide counts by day, race and category, with event-level ledger totals in USD cents. Registration search and filters do not narrow this file.',
  limits: <>Orders and riders can appear in several groups. Refund totals include requests and pending refunds recorded in the local ledger.</>,
  button: 'Download finance summary (CSV)',
  progress: 'Preparing finance summary…',
  file: 'finance-summary.csv',
};

const reconciliation = {
  id: 'reconciliation-records',
  title: 'Local reconciliation records',
  description: 'All linked payment attempts, checkout sessions, provider events and refunds for this event, including expired or cancelled orders. Registration search and filters do not narrow this file.',
  limits: <><strong>Local evidence only.</strong> Provider settlement and payout matching are not included. Source kinds may describe the same payment: do not sum amounts across kinds or add the repeated order totals. Blank amounts mean unknown. Sessions do not prove money received, and requested or pending refunds do not prove money returned.</>,
  button: 'Download local records (CSV)',
  progress: 'Preparing local records…',
  file: 'reconciliation.csv',
};

export function FinanceDownloads({ eventId }: { eventId: string }) {
  return <>
    <FinanceDownload eventId={eventId} report={financeSummary} />
    <FinanceDownload eventId={eventId} report={reconciliation} />
  </>;
}

function FinanceDownload({ eventId, report }: { eventId: string; report: typeof financeSummary }) {
  const inFlight = useRef(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [requested, setRequested] = useState(false);
  const download = async () => {
    if (inFlight.current) return;
    inFlight.current = true;
    setBusy(true); setError(null); setRequested(false);
    try { await downloadFile(`/api/events/${eventId}/exports/${report.file}`); setRequested(true); }
    catch (e) { setError(e instanceof Error ? e.message : 'Download failed.'); }
    finally { inFlight.current = false; setBusy(false); }
  };
  return <section className="settings__section" aria-labelledby={`${report.id}-title`}>
    <h3 id={`${report.id}-title`}>{report.title}</h3>
    <p className="small">{report.description}</p>
    <p className="small" id={`${report.id}-limits`}>{report.limits}</p>
    <button type="button" className="btn btn--secondary btn--small reconciliation-download__button" aria-describedby={`${report.id}-limits`} aria-disabled={busy || undefined} aria-busy={busy || undefined} onClick={download}>{busy ? 'Preparing CSV…' : report.button}</button>
    <p className="small" role="status">{busy ? report.progress : requested ? 'Download requested. Check your browser downloads.' : ''}</p>
    {error && <p className="field__error" role="alert">{error} Refresh this page to check your access.</p>}
  </section>;
}
