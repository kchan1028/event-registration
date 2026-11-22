import { useEffect, useRef, useState } from 'react';
import { WAIVER_REASON_MAX, WAIVER_REASON_MIN, waiverReasonProblem, type ChangeImpact, type ImpactKind } from '../shared/impact';
import { countIssues, type Issue } from '../shared/validation';
import { api, ApiError } from './api';
import { href } from './App';
import type { Draft } from './Builder';
import { formatDateTime } from './format';
import { IssueList } from './IssuesPanel';
import { Field, Icon, Pending } from './ui';

export function Publish({ draft, onOpenIssue }: { draft: Draft; onOpenIssue: (i: Issue) => void }) {
  const { errors, warnings } = countIssues(draft.issues);
  const [ack, setAck] = useState(false);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ tone: 'ok' | 'error'; text: string } | null>(null);
  const { data } = draft;
  const [impact, setImpact] = useState<ChangeImpact | null>(null);
  const [impactAck, setImpactAck] = useState(false);
  const [impactError, setImpactError] = useState<string | null>(null);
  const [compared, setCompared] = useState<{ revision: number; publishedVersion: number | null; waiverChanged: boolean } | null>(null);
  const [check, setCheck] = useState(0);
  // The server can only be ahead of this screen, when someone else saved or published.
  const changedElsewhere = compared !== null && (compared.revision > draft.savedRevision || (compared.publishedVersion ?? 0) > (data.publishedVersion ?? 0));
  // Never current while the check has found a newer draft or version: that has to be reviewed first.
  const upToDate = !changedElsewhere && data.publishedVersion !== null && data.publishedRevision === draft.savedRevision && draft.saveState === 'saved';
  const [reason, setReason] = useState('');
  // Acknowledgements and a reason are for one draft against one live version.
  useEffect(() => {
    setAck(false);
    setImpactAck(false);
    setReason('');
  }, [draft.savedRevision, data.publishedVersion]);

  // Recompute after every saved draft revision. Before a first publication this only confirms that nobody saved or published since the screen loaded.
  useEffect(() => {
    if (draft.saveState !== 'saved') return;
    let live = true;
    setImpactError(null);
    api
      .changeImpact(data.id)
      .then((r) => {
        if (!live) return;
        setImpact(r.impact);
        setCompared(r);
        setImpactAck(false);
      })
      .catch((e: ApiError) => {
        if (!live) return;
        setCompared(null);
        setImpactError(e.message);
      });
    return () => {
      live = false;
    };
  }, [data.id, draft.savedRevision, data.publishedVersion, draft.saveState, check]);

  // Every publish waits for a comparison of exactly the draft and live version on this screen.
  const sameDraft = compared?.revision === draft.savedRevision && compared?.publishedVersion === data.publishedVersion;
  const unsaved = draft.saveState !== 'saved';
  const comparisonReady = upToDate || (!unsaved && sameDraft);
  // Ask nothing from, and show nothing of, a comparison of another draft.
  const shownImpact = sameDraft ? impact : null;
  const needsImpactAck = !upToDate && (shownImpact?.categories.length ?? 0) > 0;
  const needsReason = !upToDate && sameDraft && !!compared?.waiverChanged;
  const reasonProblem = needsReason ? waiverReasonProblem(reason) : null;
  // Too short is what the hint says; show an error only for what typing more cannot fix.
  const reasonError = reasonProblem && [...reason.trim()].length >= WAIVER_REASON_MIN ? reasonProblem : undefined;

  // A recovery button can disappear once it works; keep keyboard focus in the publishing controls.
  const box = useRef<HTMLDivElement>(null);
  const recover = (run: () => void) => {
    run();
    box.current?.focus();
  };

  const publish = async () => {
    setBusy(true);
    setMsg(null);
    try {
      const v = await draft.publish({ revision: draft.savedRevision, publishedVersion: data.publishedVersion }, ack, impactAck, needsReason ? reason : undefined);
      setMsg({ tone: 'ok', text: `Published as version ${v}. The published version is frozen; later edits stay in the draft until you publish again.` });
      setAck(false);
      setImpactAck(false);
      setReason('');
    } catch (e) {
      setMsg({ tone: 'error', text: (e as ApiError).message });
      // Either refusal can mean that the draft changed elsewhere.
      if ([409, 422].includes((e as ApiError).status)) setCheck((n) => n + 1);
    } finally {
      setBusy(false);
    }
  };

  const saveFailed = draft.saveState === 'error' || draft.saveState === 'conflict';
  const waitingFor = saveFailed
    ? `The draft was not saved${draft.saveError ? `: ${draft.saveError}` : '.'} Publishing waits until it is.`
    : unsaved
    ? 'Publishing waits until the draft is saved.'
    : impactError || changedElsewhere
      ? 'Publishing waits until the check above succeeds.'
      : data.publishedVersion === null
        ? 'Checking the saved draft…'
        : 'Checking what changed since the published version…';

  return (
    <div className="settings">
      <h2 className="page-title">Review and publish</h2>
      <p className="lede">Publishing saves a numbered, unchangeable copy of this configuration. Errors must be fixed first; warnings need your acknowledgement.</p>

      <div className="publish-status">
        <div>
          <p className="publish-status__label">Errors</p>
          <p className={`publish-status__num num ${errors ? 'text-error' : ''}`}>{errors}</p>
        </div>
        <div>
          <p className="publish-status__label">Warnings</p>
          <p className="publish-status__num num">{warnings}</p>
        </div>
        <div>
          <p className="publish-status__label">Draft save number</p>
          <p className="publish-status__num num">{draft.savedRevision}</p>
        </div>
        <div>
          <p className="publish-status__label">Published</p>
          <p className="publish-status__num num">{data.publishedVersion ? `v${data.publishedVersion}` : 'None'}</p>
        </div>
      </div>

      {draft.issues.length > 0 ? (
        <IssueList issues={draft.issues} config={draft.config} onOpen={onOpenIssue} />
      ) : (
        <p className="note note--ok">
          <Icon name="check" size={14} /> No problems found.
        </p>
      )}

      {!upToDate && (data.publishedVersion !== null || changedElsewhere || impactError) && (
        <ImpactPanel
          impact={shownImpact}
          error={changedElsewhere ? 'This event was changed or published somewhere else. Reload it and review the changes before publishing.' : impactError}
          recovery={
            changedElsewhere
              ? {
                  label: 'Reload event',
                  run: () =>
                    recover(() => {
                      setMsg(null);
                      draft.reload();
                    }),
                }
              : { label: 'Try again', run: () => recover(() => setCheck((n) => n + 1)) }
          }
          saving={draft.saveState !== 'saved'}
          publishedVersion={data.publishedVersion}
        />
      )}

      <div className="publish-box" ref={box} tabIndex={-1}>
        <div className="pending-stack">
          <Pending>USA Cycling license checks are not connected. Published categories still mark every license for review.</Pending>
          <Pending>{data.pending.payments}</Pending>
        </div>
        {warnings > 0 && (
          <label className="check">
            <input type="checkbox" checked={ack} onChange={(e) => setAck(e.target.checked)} disabled={errors > 0 || unsaved} />I have reviewed the {warnings} {warnings === 1 ? 'warning' : 'warnings'} above
          </label>
        )}
        {needsImpactAck && (
          <label className="check">
            <input type="checkbox" checked={impactAck} onChange={(e) => setImpactAck(e.target.checked)} disabled={errors > 0 || unsaved} />I have reviewed who these changes affect
          </label>
        )}
        {needsReason && (
          <Field
            className="publish-box__reason"
            label="Reason for the waiver change"
            error={reasonError}
            hint={`Required, ${WAIVER_REASON_MIN} to ${WAIVER_REASON_MAX} characters. Saved with this version and shown to owners and registration managers. Leave out rider details.`}
          >
            {(id, describedBy) => (
              <textarea id={id} aria-describedby={describedBy} aria-invalid={!!reasonError || undefined} className="input" rows={3} required value={reason} onChange={(e) => setReason(e.target.value)} disabled={busy || errors > 0} />
            )}
          </Field>
        )}
        <button className="btn btn--primary" onClick={publish} disabled={busy || errors > 0 || (warnings > 0 && !ack) || (needsImpactAck && !impactAck) || !comparisonReady || !!reasonProblem || upToDate}>
          {busy ? 'Publishing…' : upToDate ? `Version ${data.publishedVersion} is current` : `Publish version ${(data.publishedVersion ?? 0) + 1}`}
        </button>
        {errors > 0 && <p className="muted small">Fix the errors above to publish.</p>}
        <p className="muted small" aria-live="polite">
          {errors === 0 && !comparisonReady ? waitingFor : ''}
        </p>
        {errors === 0 && saveFailed && (
          <button type="button" className="btn btn--secondary publish-box__recover" onClick={() => void recover(draft.saveState === 'conflict' ? draft.reload : () => void draft.save())}>
            {draft.saveState === 'conflict' ? 'Reload event' : 'Save again'}
          </button>
        )}
        {data.publishedVersion !== null && (
          <a className="btn btn--secondary btn--small" href={href({ page: 'register', eventId: data.id })}>
            Open rider registration (version {data.publishedVersion})
          </a>
        )}
        {msg && (
          <p className={`note note--${msg.tone}`} role="status">
            {msg.text}
          </p>
        )}
      </div>

      {data.versions.length > 0 && (
        <section className="settings__section versions">
          <h3>Published versions</h3>
          <div className="table-wrap" role="region" aria-label="Published versions" tabIndex={0}>
            <table className="mini-table">
              <thead>
                <tr>
                  <th scope="col">Version</th>
                  <th scope="col">Published</th>
                  <th scope="col">Published by</th>
                  <th scope="col">Waiver change reason</th>
                  <th scope="col">Draft save number</th>
                  <th scope="col">Warnings acknowledged</th>
                </tr>
              </thead>
              <tbody>
                {data.versions.map((v) => (
                  <tr key={v.version}>
                    <td className="num">v{v.version}</td>
                    <td>{formatDateTime(v.publishedAt)}</td>
                    <td>{v.publishedBy ?? 'Not recorded'}</td>
                    <td className="versions__reason">{v.waiverChangeReason ?? 'None'}</td>
                    <td className="num">{v.draftRevision}</td>
                    <td className="num">{v.warningsAcknowledged}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}
    </div>
  );
}

const KIND_LABEL: Record<ImpactKind, string> = {
  eligibility: 'Who can enter',
  start: 'Start',
  classification: 'Timer code',
  limit: 'Limit',
  price: 'Price',
  availability: 'Availability',
};

interface PanelProps {
  impact: ChangeImpact | null;
  error: string | null;
  recovery: { label: string; run: () => void };
  saving: boolean;
  publishedVersion: number | null;
}

function ImpactPanel({ impact, error, recovery, saving, publishedVersion }: PanelProps) {
  return (
    <section className="settings__section impact" aria-labelledby="impact-title">
      <h3 id="impact-title">{publishedVersion === null ? 'Check before publishing' : 'Who these changes affect'}</h3>
      {publishedVersion !== null && (
        <p className="muted small">Compared with version {publishedVersion}, for riders who already entered or hold a place. {saving ? 'Updating after the draft saves.' : ''}</p>
      )}
      {error ? (
        <>
          <p className="text-error small" role="alert">
            {error}
          </p>
          <button type="button" className="btn btn--secondary impact__recover" onClick={recovery.run}>
            {recovery.label}
          </button>
        </>
      ) : !impact ? (
        <div className="skeleton impact__loading" />
      ) : impact.categories.length === 0 ? (
        <p className="note note--ok">
          <Icon name="check" size={14} /> No change touches a category that has entries.
        </p>
      ) : (
        <>
          <p className="note note--warn">
            {impact.totals.categories} {impact.totals.categories === 1 ? 'category' : 'categories'} with entries change: {impact.totals.confirmed} paid {impact.totals.confirmed === 1 ? 'entry' : 'entries'}
            {impact.totals.held > 0 ? ` and ${impact.totals.held} held ${impact.totals.held === 1 ? 'place' : 'places'}` : ''} across {impact.totals.orders} {impact.totals.orders === 1 ? 'order' : 'orders'}. Paid entries keep the price and rules they
            were sold under; publishing does not reprice or remove them.
          </p>
          <ul className="impact__list">
            {impact.categories.map((c) => (
              <li key={c.categoryId} className="impact__item">
                <p className="impact__name">
                  <code className="code">{c.code}</code> {c.name}
                  <span className="impact__kinds">
                    {c.kinds.map((k) => (
                      <span key={k} className="tag">
                        {KIND_LABEL[k]}
                      </span>
                    ))}
                  </span>
                </p>
                <ul className="impact__details">
                  {c.details.map((d) => (
                    <li key={d}>{d}</li>
                  ))}
                </ul>
                <p className="small">
                  {c.confirmed} paid{c.held > 0 ? `, ${c.held} held` : ''}: {c.riders.join(', ')}
                </p>
              </li>
            ))}
          </ul>
          {impact.startListsChange && <p className="small">Start lists change. After publishing, save a new start-list snapshot and send it to the timer.</p>}
          <p className="muted small">After you publish, each affected paid entry appears under Changes to resolve on Registrations, where you record whether it was kept, transferred, or withdrawn and that the rider was told. Contacting riders happens outside the app.</p>
        </>
      )}
    </section>
  );
}
