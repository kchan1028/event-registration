import { entryCountsByCategory, remainingForCategory } from '../shared/capacity';
import { summarizeEligibility } from '../shared/eligibility';
import { duplicateCategory, moveCategory, newCategory } from '../shared/factory';
import { formatCents, formatLength, formatTime, sortCategories, startGroupFor } from '../shared/format';
import type { Category } from '../shared/schema';
import type { Draft } from './Builder';
import { Icon } from './ui';

export function CategoryTable({ draft, raceId, selectedId, onSelect }: { draft: Draft; raceId: string; selectedId: string | null; onSelect: (id: string) => void }) {
  const { config, update } = draft;
  const cats = sortCategories(config.categories.filter((c) => c.raceId === raceId && c.status !== 'archived'));
  const archived = config.categories.filter((c) => c.raceId === raceId && c.status === 'archived');
  const counts = entryCountsByCategory(draft.data.entries);
  const errorIds = new Set(draft.issues.filter((i) => i.level === 'error' && i.target.kind === 'category').map((i) => (i.target as { id: string }).id));

  const groups = [
    ...[...config.displayGroups].sort((a, b) => a.sortOrder - b.sortOrder).map((g) => ({ id: g.id as string | null, name: g.name })),
    { id: null, name: 'No display group' },
  ]
    .map((g) => ({ ...g, cats: cats.filter((c) => c.displayGroupId === g.id) }))
    .filter((g) => g.cats.length > 0);

  const add = () => {
    const cat = newCategory(config, raceId);
    update((c) => ({ ...c, categories: [...c.categories, cat] }));
    onSelect(cat.id);
  };

  return (
    <section className="schedule" aria-labelledby="schedule-title">
      <div className="section-head">
        <h3 id="schedule-title">Category schedule</h3>
        <p className="section-head__note">What riders buy. Display group headers only arrange the list; they never set limits.</p>
        <button className="btn btn--primary btn--small" onClick={add}>
          <Icon name="plus" /> Add category
        </button>
      </div>

      {cats.length === 0 ? (
        <div className="empty">
          <p>
            <strong>No categories in this race yet.</strong> Add one, set who can enter and what it costs, then clip it into a start group below.
          </p>
        </div>
      ) : (
        <div className="table-wrap">
          <table className="cat-table">
            <thead>
              <tr>
                <th scope="col" className="col-order">
                  <span className="sr-only">Order</span>
                </th>
                <th scope="col">Category</th>
                <th scope="col">Who can enter</th>
                <th scope="col">Start</th>
                <th scope="col">Length</th>
                <th scope="col" className="col-num">
                  Price
                </th>
                <th scope="col" className="col-num">
                  Cap
                </th>
                <th scope="col" className="col-num">
                  Entries
                </th>
                <th scope="col">
                  <span className="sr-only">Actions</span>
                </th>
              </tr>
            </thead>
            {groups.map((g) => (
              <tbody key={g.id ?? 'none'}>
                <tr className="cat-table__group">
                  <th scope="rowgroup" colSpan={9}>
                    {g.name}
                  </th>
                </tr>
                {g.cats.map((cat, i) => (
                  <Row
                    key={cat.id}
                    cat={cat}
                    draft={draft}
                    first={i === 0}
                    last={i === g.cats.length - 1}
                    selected={selectedId === cat.id}
                    hasError={errorIds.has(cat.id)}
                    entries={counts[cat.id] ?? 0}
                    onSelect={onSelect}
                  />
                ))}
              </tbody>
            ))}
          </table>
        </div>
      )}
      {archived.length > 0 && (
        <p className="muted small">
          {archived.length} archived {archived.length === 1 ? 'category is' : 'categories are'} hidden. Archived categories keep their entry history and can be restored
          from the editor.{' '}
          {archived.map((a) => (
            <button key={a.id} className="link-btn" onClick={() => onSelect(a.id)}>
              {a.name}
            </button>
          ))}
        </p>
      )}
    </section>
  );
}

function Row({ cat, draft, first, last, selected, hasError, entries, onSelect }: { cat: Category; draft: Draft; first: boolean; last: boolean; selected: boolean; hasError: boolean; entries: number; onSelect: (id: string) => void }) {
  const { config, update } = draft;
  const sg = startGroupFor(config, cat);
  const remaining = remainingForCategory(config, draft.data.entries, cat.id);
  const shared = sg ? config.categories.filter((c) => c.startGroupId === sg.id && c.status !== 'archived').length > 1 : false;
  const name = cat.name || 'Unnamed category';
  return (
    <tr className={`cat-row ${selected ? 'is-selected' : ''} ${cat.status === 'closed' ? 'is-closed' : ''}`} onClick={() => onSelect(cat.id)}>
      <td className="col-order">
        <div className="order-btns">
          <button className="icon-btn" disabled={first} aria-label={`Move ${name} up`} onClick={(e) => (e.stopPropagation(), update((c) => moveCategory(c, cat.id, -1)))}>
            <Icon name="up" size={14} />
          </button>
          <button className="icon-btn" disabled={last} aria-label={`Move ${name} down`} onClick={(e) => (e.stopPropagation(), update((c) => moveCategory(c, cat.id, 1)))}>
            <Icon name="down" size={14} />
          </button>
        </div>
      </td>
      <td>
        <button className="cat-row__name" onClick={(e) => (e.stopPropagation(), onSelect(cat.id))} aria-pressed={selected}>
          {name}
        </button>
        <span className="cat-row__meta">
          {cat.timingCode ? <code className="code">{cat.timingCode}</code> : <span className="text-error">No timing code</span>}
          {cat.needsReview && <span className="tag tag--warn">Review copy</span>}
          {cat.status === 'closed' && <span className="tag">Closed</span>}
          {cat.eligibility.guardianRequired && <span className="tag">Guardian</span>}
          {hasError && !cat.needsReview && (
            <span className="tag tag--error">
              <Icon name="error" size={12} /> Needs fixing
            </span>
          )}
        </span>
      </td>
      <td className="cat-row__elig" data-label="Who can enter">{summarizeEligibility(cat)}</td>
      <td data-label="Start">
        {sg ? (
          <>
            <span className="num">{formatTime(sg.startTime)}</span>
            <span className="cat-row__sub">
              {shared ? `Shared start: ${sg.name}` : sg.name}
            </span>
          </>
        ) : (
          <span className="text-error">No start group</span>
        )}
      </td>
      <td className="nowrap" data-label="Length">{formatLength(cat.length)}</td>
      <td className="col-num num" data-label="Price">{formatCents(cat.pricing.baseCents)}</td>
      <td className="col-num num" data-label="Cap">{cat.cap ?? '·'}</td>
      <td className="col-num" data-label="Entries">
        <span className="num">{entries}</span>
        <span className="cat-row__sub">{remaining === null ? 'no limit' : remaining === 0 ? 'full' : `${remaining} left`}</span>
      </td>
      <td>
        <button className="icon-btn" aria-label={`Duplicate ${name}`} title="Duplicate" onClick={(e) => {
          e.stopPropagation();
          const before = new Set(config.categories.map((c) => c.id));
          let copyId: string | null = null;
          update((c) => {
            const next = duplicateCategory(c, cat.id);
            copyId = next.categories.find((x) => !before.has(x.id))?.id ?? null;
            return next;
          });
          if (copyId) onSelect(copyId);
        }}>
          <Icon name="copy" size={14} />
        </button>
      </td>
    </tr>
  );
}
