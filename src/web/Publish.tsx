import { useState } from 'react';
import { countIssues, type Issue } from '../shared/validation';
import { ApiError } from './api';
import { href } from './App';
import type { Draft } from './Builder';
import { IssueList } from './IssuesPanel';
import { Icon, Pending } from './ui';

export function Publish({ draft, onOpenIssue }: { draft: Draft; onOpenIssue: (i: Issue) => void }) {
  const { errors, warnings } = countIssues(draft.issues);
  const [ack, setAck] = useState(false);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ tone: 'ok' | 'error'; text: string } | null>(null);
  const { data } = draft;
  const upToDate = data.publishedVersion !== null && data.publishedRevision === data.revision && draft.saveState === 'saved';

  const publish = async () => {
    setBusy(true);
    setMsg(null);
    try {
      const v = await draft.publish(ack);
      setMsg({ tone: 'ok', text: `Published as version ${v}. The published version is frozen; later edits stay in the draft until you publish again.` });
      setAck(false);
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
          <p className="publish-status__label">Draft revision</p>
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

      <div className="publish-box">
        <div className="pending-stack">
          <Pending>USA Cycling license checks are not connected. Published categories still mark every license for review.</Pending>
          <Pending>Payments are not connected. Published events open a rider registration page with simulated payment only.</Pending>
        </div>
        {warnings > 0 && (
          <label className="check">
            <input type="checkbox" checked={ack} onChange={(e) => setAck(e.target.checked)} disabled={errors > 0} />I have reviewed the {warnings} {warnings === 1 ? 'warning' : 'warnings'} above
          </label>
        )}
        <button className="btn btn--primary" onClick={publish} disabled={busy || errors > 0 || (warnings > 0 && !ack) || upToDate}>
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
                <th scope="col">From draft revision</th>
                <th scope="col">Warnings acknowledged</th>
              </tr>
            </thead>
            <tbody>
              {data.versions.map((v) => (
                <tr key={v.version}>
                  <td className="num">v{v.version}</td>
                  <td>{new Date(v.publishedAt).toLocaleString()}</td>
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
