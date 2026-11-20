import type { EventConfig } from '../shared/schema';
import { countIssues, type Issue } from '../shared/validation';
import { href } from './App';
import { Icon } from './ui';

export function IssueList({ issues, config, onOpen, limit }: { issues: Issue[]; config: EventConfig; onOpen: (i: Issue) => void; limit?: number }) {
  const sorted = [...issues].sort((a, b) => (a.level === b.level ? 0 : a.level === 'error' ? -1 : 1));
  const shown = limit ? sorted.slice(0, limit) : sorted;
  const where = (i: Issue) => {
    const t = i.target;
    if (t.kind === 'category') {
      const c = config.categories.find((x) => x.id === t.id);
      return config.races.find((r) => r.id === c?.raceId)?.name ?? '';
    }
    if (t.kind === 'startGroup') {
      const g = config.startGroups.find((x) => x.id === t.id);
      return config.races.find((r) => r.id === g?.raceId)?.name ?? '';
    }
    if (t.kind === 'race') return config.races.find((r) => r.id === t.id)?.name ?? '';
    if (t.kind === 'pool') return 'Shared capacity pools';
    if (i.key === 'event.refund') return 'Event setup > Bundles, discounts, and rider policies > Refund and credit rules';
    return 'Event setup';
  };
  return (
    <ul className="issues">
      {shown.map((i) => (
        <li key={i.key}>
          <button className={`issue issue--${i.level}`} onClick={() => onOpen(i)}>
            <Icon name={i.level === 'error' ? 'error' : 'warn'} size={14} />
            <span>
              <span className="issue__where">{where(i)}</span>
              {i.key === 'event.refund' && <span className="issue__action">Set up refund policy</span>}
              {i.message}
            </span>
          </button>
        </li>
      ))}
    </ul>
  );
}

export function IssuesPanel({ issues, config, onOpen, eventId }: { issues: Issue[]; config: EventConfig; onOpen: (i: Issue) => void; eventId: string }) {
  const { errors, warnings } = countIssues(issues);
  return (
    <div className="issues-panel">
      <h2 className="issues-panel__title">Checks before publishing</h2>
      {errors + warnings === 0 ? (
        <p className="note note--ok">
          <Icon name="check" size={14} /> No problems found. Preview the rider schedule, then publish.
        </p>
      ) : (
        <>
          <p className="issues-panel__counts">
            <span className={errors ? 'text-error' : ''}>
              <span className="num">{errors}</span> {errors === 1 ? 'error blocks' : 'errors block'} publishing
            </span>
            <span>
              <span className="num">{warnings}</span> {warnings === 1 ? 'warning' : 'warnings'} to acknowledge
            </span>
          </p>
          <IssueList issues={issues} config={config} onOpen={onOpen} limit={12} />
          {errors + warnings > 12 && (
            <a className="link" href={href({ page: 'event', eventId, view: 'publish' })}>
              See all {errors + warnings}
            </a>
          )}
        </>
      )}
      <p className="issues-panel__tip">Select a category in the schedule to edit it here.</p>
    </div>
  );
}
