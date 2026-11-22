import { useState } from 'react';
import { planBulkEdit, type BulkChange, type BulkField } from '../shared/bulk';
import { entryCountsByCategory, remainingForCategory } from '../shared/capacity';
import { summarizeEligibility } from '../shared/eligibility';
import { duplicateCategory, moveCategory, newCategory } from '../shared/factory';
import { formatCents, formatLength, formatTime, sortCategories, startGroupFor } from '../shared/format';
import type { Category } from '../shared/schema';
import type { Draft } from './Builder';
import { byDisplayGroup } from './format';
import { Icon, parseMoney } from './ui';

/** Copies a category in the draft and opens the copy in the editor. */
export function duplicateAndSelect(draft: Draft, categoryId: string, onSelect: (id: string) => void): void {
  const before = new Set(draft.config.categories.map((c) => c.id));
  let copyId: string | null = null;
  draft.update((cfg) => {
    const next = duplicateCategory(cfg, categoryId);
    copyId = next.categories.find((x) => !before.has(x.id))?.id ?? null;
    return next;
  });
  if (copyId) onSelect(copyId);
}

export function CategoryTable({ draft, raceId, selectedId, onSelect }: { draft: Draft; raceId: string; selectedId: string | null; onSelect: (id: string) => void }) {
  const { config, update, readOnly } = draft;
  const cats = sortCategories(config.categories.filter((c) => c.raceId === raceId && c.status !== 'archived'));
  const archived = config.categories.filter((c) => c.raceId === raceId && c.status === 'archived');
  const counts = entryCountsByCategory(draft.data.entries);
  const errorIds = new Set(draft.issues.filter((i) => i.level === 'error' && i.target.kind === 'category').map((i) => (i.target as { id: string }).id));
  const [picked, setPicked] = useState<string[]>([]);
  const pickedHere = picked.filter((id) => cats.some((c) => c.id === id));
  const togglePick = (id: string) => setPicked((p) => (p.includes(id) ? p.filter((x) => x !== id) : [...p, id]));
  const allPicked = cats.length > 0 && pickedHere.length === cats.length;

  const groups = byDisplayGroup(config, cats, 'No display group');

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
        {!readOnly && (
          <button className="btn btn--primary btn--small" onClick={add}>
            <Icon name="plus" /> Add category
          </button>
        )}
      </div>

      {!readOnly && pickedHere.length > 0 && <BulkEdit draft={draft} ids={pickedHere} counts={counts} onDone={() => setPicked([])} />}

      {cats.length === 0 ? (
        <div className="empty">
          <p>
            <strong>No categories in this race yet.</strong>
            {readOnly ? '' : ' Add one, set who can enter and what it costs, then add it to a start group below.'}
          </p>
        </div>
      ) : (
        <div className="table-wrap" role="region" aria-label="Category schedule" tabIndex={0}>
          <table className="cat-table">
            <thead>
              <tr>
                <th scope="col" className="col-pick">
                  {readOnly ? <span className="sr-only">Select</span> : <input type="checkbox" aria-label="Select every category in this race for bulk edit" checked={allPicked} onChange={() => setPicked(allPicked ? [] : cats.map((c) => c.id))} />}
                </th>
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
                  Places taken
                </th>
                <th scope="col">
                  <span className="sr-only">Actions</span>
                </th>
              </tr>
            </thead>
            {groups.map((g) => (
              <tbody key={g.id ?? 'none'}>
                <tr className="cat-table__group">
                  <th scope="rowgroup" colSpan={10}>
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
                    picked={pickedHere.includes(cat.id)}
                    onPick={() => togglePick(cat.id)}
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

function Row({ cat, draft, first, last, selected, hasError, entries, onSelect, picked, onPick }: { cat: Category; draft: Draft; first: boolean; last: boolean; selected: boolean; hasError: boolean; entries: number; onSelect: (id: string) => void; picked: boolean; onPick: () => void }) {
  const { config, update, readOnly } = draft;
  const sg = startGroupFor(config, cat);
  const remaining = remainingForCategory(config, draft.data.entries, cat.id);
  const shared = sg ? config.categories.filter((c) => c.startGroupId === sg.id && c.status !== 'archived').length > 1 : false;
  const name = cat.name || 'Unnamed category';
  return (
    <tr className={`cat-row ${selected ? 'is-selected' : ''} ${cat.status === 'closed' ? 'is-closed' : ''}`} onClick={() => onSelect(cat.id)}>
      <td className="col-pick" onClick={(e) => e.stopPropagation()}>
        {!readOnly && <input type="checkbox" aria-label={`Select ${name} for bulk edit`} checked={picked} onChange={onPick} />}
      </td>
      <td className="col-order">
        {!readOnly && (
          <div className="order-btns">
            <button className="icon-btn" disabled={first} aria-label={`Move ${name} up`} onClick={(e) => (e.stopPropagation(), update((c) => moveCategory(c, cat.id, -1)))}>
              <Icon name="up" size={14} />
            </button>
            <button className="icon-btn" disabled={last} aria-label={`Move ${name} down`} onClick={(e) => (e.stopPropagation(), update((c) => moveCategory(c, cat.id, 1)))}>
              <Icon name="down" size={14} />
            </button>
          </div>
        )}
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
      <td className="col-num" data-label="Places taken">
        <span className="num">{entries}</span>
        <span className="cat-row__sub">{remaining === null ? 'no limit' : remaining === 0 ? 'full' : `${remaining} left`}</span>
      </td>
      <td>
        {!readOnly && (
          <button className="icon-btn" aria-label={`Duplicate ${name}`} title="Duplicate" onClick={(e) => (e.stopPropagation(), duplicateAndSelect(draft, cat.id, onSelect))}>
            <Icon name="copy" size={14} />
          </button>
        )}
      </td>
    </tr>
  );
}

const FIELD_LABEL: Record<BulkField, string> = {
  price: 'Entry price',
  dayOfSurcharge: 'Day-of surcharge',
  cap: 'Category cap',
  opensAt: 'Registration opens',
  closesAt: 'Registration closes',
  status: 'Open or closed',
};

/** Change one field on several categories at once, with a before/after preview first. */
function BulkEdit({ draft, ids, counts, onDone }: { draft: Draft; ids: string[]; counts: Record<string, number>; onDone: () => void }) {
  const [field, setField] = useState<BulkField>('price');
  const [value, setValue] = useState('');
  const [applied, setApplied] = useState<string | null>(null);

  const change: BulkChange | null = (() => {
    if (field === 'price' || field === 'dayOfSurcharge') {
      const cents = parseMoney(value);
      return cents === null ? null : { field, cents };
    }
    if (field === 'cap') {
      if (value.trim() === '') return { field, cap: null };
      return /^\d+$/.test(value.trim()) && Number(value) >= 1 ? { field, cap: Number(value) } : null;
    }
    if (field === 'opensAt' || field === 'closesAt') return value ? { field, at: value } : { field, at: null };
    return { field: 'status', status: value === 'closed' ? 'closed' : 'active' };
  })();
  const plan = change ? planBulkEdit(draft.config, ids, change, counts) : null;
  const changing = plan ? plan.rows.filter((r) => !r.problem && r.before !== r.after).length : 0;

  const applyIt = () => {
    if (!change) return;
    draft.update((c) => planBulkEdit(c, ids, change, counts).config);
    setApplied(`Changed ${FIELD_LABEL[field].toLowerCase()} on ${changing} ${changing === 1 ? 'category' : 'categories'}.`);
    setValue('');
  };

  const valueInput =
    field === 'status' ? (
      <select id="bulk-value" className="input" value={value || 'active'} onChange={(e) => setValue(e.target.value)}>
        <option value="active">Open</option>
        <option value="closed">Closed</option>
      </select>
    ) : field === 'opensAt' || field === 'closesAt' ? (
      <input id="bulk-value" className="input" type="datetime-local" value={value} onChange={(e) => setValue(e.target.value)} />
    ) : (
      <input id="bulk-value" className="input" inputMode="decimal" placeholder={field === 'cap' ? 'Blank: no cap' : 'Dollars, for example 45'} value={value} onChange={(e) => setValue(e.target.value)} />
    );

  return (
    <section className="bulk" aria-labelledby="bulk-title">
      <h4 id="bulk-title">
        Bulk edit {ids.length} {ids.length === 1 ? 'category' : 'categories'}
      </h4>
      <div className="bulk__controls">
        <label htmlFor="bulk-field">
          Change
          <select id="bulk-field" className="input" value={field} onChange={(e) => (setField(e.target.value as BulkField), setValue(''), setApplied(null))}>
            {(Object.keys(FIELD_LABEL) as BulkField[]).map((f) => (
              <option key={f} value={f}>
                {FIELD_LABEL[f]}
              </option>
            ))}
          </select>
        </label>
        <label htmlFor="bulk-value">
          To
          {valueInput}
        </label>
      </div>
      {plan ? (
        <table className="mini-table bulk__preview" aria-label="Before and after">
          <thead>
            <tr>
              <th scope="col">Category</th>
              <th scope="col">Before</th>
              <th scope="col">After</th>
            </tr>
          </thead>
          <tbody>
            {plan.rows.map((r) => (
              <tr key={r.categoryId}>
                <td>{r.name}</td>
                <td>{r.before}</td>
                <td>{r.problem ? <span className="text-error">Unchanged: {r.problem}</span> : r.after}</td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : (
        <p className="muted small">Enter a value to preview the change.</p>
      )}
      <div className="bulk__actions">
        <button type="button" className="btn btn--primary btn--small" disabled={!plan || changing === 0} onClick={applyIt}>
          Apply to {changing} {changing === 1 ? 'category' : 'categories'}
        </button>
        <button type="button" className="btn btn--ghost btn--small" onClick={onDone}>
          Clear selection
        </button>
        {applied && (
          <span className="small text-ok" role="status">
            {applied} The draft autosaves; publish to make it live.
          </span>
        )}
      </div>
    </section>
  );
}
