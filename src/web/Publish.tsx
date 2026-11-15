import { useEffect, useState } from 'react';
import type { ChangeImpact, ImpactKind } from '../shared/impact';
import { countIssues, type Issue } from '../shared/validation';
import { api, ApiError } from './api';
import { href } from './App';
import type { Draft } from './Builder';
import { formatDateTime } from './format';
import { IssueList } from './IssuesPanel';
import { Icon, Pending } from './ui';

export function Publish({ draft, onOpenIssue }: { draft: Draft; onOpenIssue: (i: Issue) => void }) {
  const { errors, warnings } = countIssues(draft.issues);
  const [ack, setAck] = useState(false);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ tone: 'ok' | 'error'; text: string } | null>(null);
  const { data } = draft;
  const upToDate = data.publishedVersion !== null && data.publishedRevision === data.revision && draft.saveState === 'saved';
  const [impact, setImpact] = useState<ChangeImpact | null>(null);
  const [impactAck, setImpactAck] = useState(false);
  const [impactError, setImpactError] = useState<string | null>(null);

  // Recompute after every saved draft revision; the server compares the saved draft with the latest published version.
  useEffect(() => {
    if (data.publishedVersion === null || draft.saveState !== 'saved') return;
    let live = true;
    api
      .changeImpact(data.id)
      .then((r) => {
        if (!live) return;
        setImpact(r.impact);
        setImpactError(null);
        setImpactAck(false);
      })
      .catch((e: ApiError) => live && setImpactError(e.message));
    return () => {
      live = false;
    };
  }, [data.id, data.revision, data.publishedVersion, draft.saveState]);

  const needsImpactAck = !upToDate && (impact?.categories.length ?? 0) > 0;

  const publish = async () => {
    setBusy(true);
    setMsg(null);
    try {
      const v = await draft.publish(ack, impactAck);
      setMsg({ tone: 'ok', text: `Published as version ${v}. The published version is frozen; later edits stay in the draft until you publish again.` });
      setAck(false);
      setImpactAck(false);
    } catch (e) {
      setMsg({ tone: 'error', text: (e as ApiError).message });
    } finally {
      setBusy(false);
    }
  };

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
          <p className="publish-status__num num">{data.revision}</p>
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

      {data.publishedVersion !== null && !upToDate && (
        <ImpactPanel impact={impact} error={impactError} saving={draft.saveState !== 'saved'} publishedVersion={data.publishedVersion} />
      )}

      <div className="publish-box">
        <div className="pending-stack">
          <Pending>USA Cycling license checks are not connected. Published categories still mark every license for review.</Pending>
          <Pending>{data.pending.payments}</Pending>
        </div>
        {warnings > 0 && (
          <label className="check">
            <input type="checkbox" checked={ack} onChange={(e) => setAck(e.target.checked)} disabled={errors > 0} />I have reviewed the {warnings} {warnings === 1 ? 'warning' : 'warnings'} above
          </label>
        )}
        {needsImpactAck && (
          <label className="check">
            <input type="checkbox" checked={impactAck} onChange={(e) => setImpactAck(e.target.checked)} disabled={errors > 0} />I have reviewed who these changes affect
          </label>
        )}
        <button className="btn btn--primary" onClick={publish} disabled={busy || errors > 0 || (warnings > 0 && !ack) || (needsImpactAck && !impactAck) || upToDate}>
          {busy ? 'Publishing…' : upToDate ? `Version ${data.publishedVersion} is current` : `Publish version ${(data.publishedVersion ?? 0) + 1}`}
        </button>
        {errors > 0 && <p className="muted small">Fix the errors above to publish.</p>}
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
        <section className="settings__section">
          <h3>Published versions</h3>
          <table className="mini-table">
            <thead>
              <tr>
                <th scope="col">Version</th>
                <th scope="col">Published</th>
                <th scope="col">Draft save number</th>
                <th scope="col">Warnings acknowledged</th>
              </tr>
            </thead>
            <tbody>
              {data.versions.map((v) => (
                <tr key={v.version}>
                  <td className="num">v{v.version}</td>
                  <td>{formatDateTime(v.publishedAt)}</td>
                  <td className="num">{v.draftRevision}</td>
                  <td className="num">{v.warningsAcknowledged}</td>
                </tr>
              ))}
            </tbody>
          </table>
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

function ImpactPanel({ impact, error, saving, publishedVersion }: { impact: ChangeImpact | null; error: string | null; saving: boolean; publishedVersion: number }) {
  return (
    <section className="settings__section impact" aria-labelledby="impact-title">
      <h3 id="impact-title">Who these changes affect</h3>
      <p className="muted small">Compared with version {publishedVersion}, for riders who already entered or hold a place. {saving ? 'Updating after the draft saves.' : ''}</p>
      {error ? (
        <p className="text-error small" role="alert">
          {error}
        </p>
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
